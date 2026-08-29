/**
 * S31-01 AC-3 — platform operates with CREATE revoked from holocron_app.
 *
 * CLIs run as holocron_app (not owner). Heartbeat is written via backup:healthy.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run packages/platform/tests/integration/sprint31-no-runtime-ddl.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql } from '../../src/db/client.ts';
import { HOLOCRON_APP_ROLE, toAppRoleDatabaseUrl } from '../../src/db/evidence/roles.ts';
import { applyMigrations } from '../../src/db/migrate.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const HOLO = resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-01');

const OWNER_URL =
  process.env.DATABASE_URL_OWNER ??
  process.env.DATABASE_URL ??
  'postgres://inference1@127.0.0.1:5432/holocron';

const DB_NAME = 'holocron_s31_01_ddl';
const SIX_FILES = [
  'packages/platform/src/queue/schema.ts',
  'packages/platform/src/queue/durable-effect.ts',
  'packages/platform/src/queue/jobs-runner.ts',
  'packages/platform/src/backup/heartbeat.ts',
  'packages/platform/src/backup/wal-archive.ts',
  'packages/platform/src/inference/degraded-mode-controller.ts',
] as const;

function adminUrlFrom(url: string): string {
  const u = new URL(url);
  u.pathname = '/postgres';
  return u.toString();
}

function dbUrl(name: string): string {
  const u = new URL(OWNER_URL);
  u.pathname = `/${name}`;
  return u.toString();
}

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(EVIDENCE_DIR, name),
    typeof body === 'string' ? body : JSON.stringify(body, null, 2),
    'utf8'
  );
}

/** Cluster-level app role must exist BEFORE migrate so migration GRANT blocks fire. */
async function ensureHolocronAppRole(): Promise<void> {
  const admin = createSql(adminUrlFrom(OWNER_URL));
  try {
    await admin.unsafe(`
      DO $role$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
          CREATE ROLE holocron_app LOGIN;
        END IF;
      END
      $role$;
    `);
  } finally {
    await admin.end({ timeout: 5 });
  }
}

async function dropAndCreateDb(name: string): Promise<void> {
  const admin = createSql(adminUrlFrom(OWNER_URL));
  try {
    await admin.unsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid()`
    );
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`);
    await admin.unsafe(`CREATE DATABASE ${name}`);
    // CONNECT so app-role product paths can open a session after migrate.
    await admin.unsafe(`GRANT CONNECT ON DATABASE ${name} TO holocron_app`);
  } finally {
    await admin.end({ timeout: 5 });
  }
}

/** Product CLIs as holocron_app — DATABASE_URL is app; owner left for admin only. */
function runHoloAsApp(args: string[], ownerUrl: string) {
  const appUrl = toAppRoleDatabaseUrl(ownerUrl);
  return spawnSync('bun', [HOLO, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: appUrl,
      // Keep owner separate so migrate/admin rewrites stay owner-scoped if invoked.
      DATABASE_URL_OWNER: ownerUrl,
    },
    timeout: 180_000,
  });
}

function scanDdl(): { total: number; hits: Array<{ file: string; match: string }> } {
  const hits: Array<{ file: string; match: string }> = [];
  for (const rel of SIX_FILES) {
    const body = readFileSync(resolve(REPO_ROOT, rel), 'utf8');
    for (const pat of ['CREATE TABLE', 'CREATE INDEX', 'GRANT ']) {
      if (body.includes(pat)) {
        hits.push({ file: rel, match: pat });
      }
    }
  }
  return { total: hits.length, hits };
}

describe('S31-01 no runtime DDL (real Postgres)', () => {
  beforeAll(async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
  });

  afterAll(async () => {
    if (!PLATFORM_IT) return;
    const admin = createSql(adminUrlFrom(OWNER_URL));
    try {
      await admin.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid()`
      );
      await admin.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    } finally {
      await admin.end({ timeout: 5 }).catch(() => undefined);
    }
  });

  itLive(
    'platformOperatesWithoutCreatePrivilege (AC-3)',
    async () => {
      await ensureHolocronAppRole();
      await dropAndCreateDb(DB_NAME);
      const ownerUrl = dbUrl(DB_NAME);
      const appUrl = toAppRoleDatabaseUrl(ownerUrl);

      // Migrate as owner so schema + migration GRANT blocks install for holocron_app.
      const mig = await applyMigrations({ databaseUrl: ownerUrl });
      expect(mig.ok, mig.errors.join('; ')).toBe(true);

      const owner = createSql(ownerUrl);
      let caseWindowStart = '';
      try {
        await owner.unsafe(`GRANT USAGE ON SCHEMA public TO holocron_app`);
        // Fail-closed app-role fixture: CREATE revoked for the product session.
        await owner.unsafe(`REVOKE CREATE ON SCHEMA public FROM holocron_app`);
        await owner.unsafe(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);

        const whoApp = await owner<{ current_user: string; session: string }[]>`
          SELECT current_user::text, current_setting('role', true) AS session
        `;
        writeEvidence('ac3-owner-session.json', {
          owner_current_user: whoApp[0]?.current_user,
          app_url: appUrl.replace(/:[^:@/]+@/, ':***@'),
          app_role: HOLOCRON_APP_ROLE,
        });

        const startRows = await owner<{ ts: string }[]>`SELECT now()::text AS ts`;
        caseWindowStart = startRows[0]?.ts ?? new Date(0).toISOString();
      } finally {
        await owner.end({ timeout: 5 });
      }

      // Prove product connection is holocron_app before CLI fan-out.
      const appProbe = createSql(appUrl);
      try {
        const who = await appProbe<{ u: string }[]>`SELECT current_user::text AS u`;
        expect(who[0]?.u).toBe(HOLOCRON_APP_ROLE);
        writeEvidence('ac3-app-session.json', { current_user: who[0]?.u });
      } finally {
        await appProbe.end({ timeout: 5 });
      }

      const cliResults: Array<{
        cmd: string;
        status: number | null;
        stderr: string;
        stdout: string;
        as_role: string;
      }> = [];

      const effect = runHoloAsApp(['queue:effect', 'ddl-probe-1', '--json'], ownerUrl);
      cliResults.push({
        cmd: 'queue:effect',
        status: effect.status,
        stderr: effect.stderr,
        stdout: effect.stdout,
        as_role: HOLOCRON_APP_ROLE,
      });

      const jobs = runHoloAsApp(['jobs:run-all', '--json'], ownerUrl);
      cliResults.push({
        cmd: 'jobs:run-all',
        status: jobs.status,
        stderr: jobs.stderr,
        stdout: jobs.stdout,
        as_role: HOLOCRON_APP_ROLE,
      });

      // backup:healthy upserts backup_heartbeat (status path is read-only).
      const healthy = runHoloAsApp(['backup:healthy', '--all', '--json'], ownerUrl);
      cliResults.push({
        cmd: 'backup:healthy --all',
        status: healthy.status,
        stderr: healthy.stderr,
        stdout: healthy.stdout,
        as_role: HOLOCRON_APP_ROLE,
      });

      const backup = runHoloAsApp(['backup:status', '--json'], ownerUrl);
      cliResults.push({
        cmd: 'backup:status',
        status: backup.status,
        stderr: backup.stderr,
        stdout: backup.stdout,
        as_role: HOLOCRON_APP_ROLE,
      });

      const degraded = runHoloAsApp(['infer:degraded', '--json'], ownerUrl);
      cliResults.push({
        cmd: 'infer:degraded',
        status: degraded.status,
        stderr: degraded.stderr,
        stdout: degraded.stdout,
        as_role: HOLOCRON_APP_ROLE,
      });

      writeEvidence('ac3-cli-results.json', cliResults);

      for (const r of cliResults) {
        const blob = `${r.stderr}\n${r.stdout}`;
        expect(blob, `${r.cmd} raised 42501`).not.toMatch(/42501|permission denied for/i);
      }

      expect(effect.status, effect.stderr || effect.stdout).toBe(0);
      expect(jobs.status, jobs.stderr || jobs.stdout).toBe(0);
      expect(healthy.status, healthy.stderr || healthy.stdout).toBe(0);
      expect(degraded.status, degraded.stderr || degraded.stdout).toBe(0);

      // Observe as owner (read-only inventory) after app-role writes.
      const sql = createSql(ownerUrl);
      try {
        const effects = await sql<{ n: string }[]>`
          SELECT count(*)::text AS n FROM queue_effects WHERE key = 'ddl-probe-1'
        `;
        expect(Number(effects[0]?.n ?? 0)).toBe(1);

        const jobsParsed = JSON.parse(jobs.stdout) as { run_id?: string; jobs_fired?: number };
        writeEvidence('ac3-jobs-run-all.json', jobsParsed);
        if (jobsParsed.run_id) {
          const jobRows = await sql<{ n: string }[]>`
            SELECT count(*)::text AS n FROM job_runs WHERE run_key LIKE ${`%${jobsParsed.run_id}%`}
          `;
          expect(Number(jobRows[0]?.n ?? 0)).toBe(16);
        }

        const heartbeat = await sql<{ n: string; max_updated: string | null }[]>`
          SELECT count(*)::text AS n, max(updated_at)::text AS max_updated
          FROM backup_heartbeat
          WHERE updated_at >= ${caseWindowStart}::timestamptz
        `;
        writeEvidence('ac3-backup-heartbeat.json', {
          caseWindowStart,
          ...heartbeat[0],
        });
        expect(Number(heartbeat[0]?.n ?? 0)).toBeGreaterThanOrEqual(1);

        const degradedCount = await sql<{ n: string; updated: string }[]>`
          SELECT count(*)::text AS n, max(updated_at)::text AS updated FROM degraded_mode
        `;
        expect(Number(degradedCount[0]?.n ?? 0)).toBe(1);

        const research = await sql<{ n: string }[]>`
          SELECT count(*)::text AS n
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            AND table_name LIKE 'research\\_%' ESCAPE '\\'
        `;
        expect(Number(research[0]?.n ?? 0)).toBe(3);

        const mission = await sql<{ reg: string | null }[]>`
          SELECT to_regclass('public.research_mission')::text AS reg
        `;
        expect(mission[0]?.reg).toBeNull();
      } finally {
        await sql.end({ timeout: 5 });
      }

      const ddl = scanDdl();
      writeEvidence('ac3-ddl-scan.json', ddl);
      expect(ddl.total).toBe(0);
    },
    300_000
  );
});
