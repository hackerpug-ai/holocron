/**
 * S31-01 AC-3 — platform operates with CREATE revoked from holocron_app.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint31-no-runtime-ddl.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql } from '../../src/db/client.ts';
import { applyMigrations } from '../../src/db/migrate.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const HOLO = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-01');

const OWNER_URL =
  process.env.DATABASE_URL_OWNER ??
  process.env.DATABASE_URL ??
  'postgres://inference1@127.0.0.1:5432/holocron';

const DB_NAME = 'holocron_s31_01_ddl';
const SIX_FILES = [
  'services/platform/src/queue/schema.ts',
  'services/platform/src/queue/durable-effect.ts',
  'services/platform/src/queue/jobs-runner.ts',
  'services/platform/src/backup/heartbeat.ts',
  'services/platform/src/backup/wal-archive.ts',
  'services/platform/src/inference/degraded-mode-controller.ts',
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

async function dropAndCreateDb(name: string): Promise<void> {
  const admin = createSql(adminUrlFrom(OWNER_URL));
  try {
    await admin.unsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid()`
    );
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`);
    await admin.unsafe(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end({ timeout: 5 });
  }
}

function runHolo(args: string[], databaseUrl: string) {
  return spawnSync('bun', [HOLO, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_URL_OWNER: databaseUrl,
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
      await dropAndCreateDb(DB_NAME);
      const url = dbUrl(DB_NAME);
      const mig = await applyMigrations({ databaseUrl: url });
      expect(mig.ok, mig.errors.join('; ')).toBe(true);

      const owner = createSql(url);
      try {
        // Ensure holocron_app can connect: grant CONNECT + DML already from migrations.
        await owner.unsafe(`
          DO $role$
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
              CREATE ROLE holocron_app LOGIN;
            END IF;
          END
          $role$;
        `);
        await owner.unsafe(`GRANT CONNECT ON DATABASE ${DB_NAME} TO holocron_app`);
        await owner.unsafe(`GRANT USAGE ON SCHEMA public TO holocron_app`);
        await owner.unsafe(`REVOKE CREATE ON SCHEMA public FROM holocron_app`);
        await owner.unsafe(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
      } finally {
        await owner.end({ timeout: 5 });
      }

      const cliResults: Array<{
        cmd: string;
        status: number | null;
        stderr: string;
        stdout: string;
      }> = [];

      const effect = runHolo(['queue:effect', 'ddl-probe-1', '--json'], url);
      cliResults.push({
        cmd: 'queue:effect',
        status: effect.status,
        stderr: effect.stderr,
        stdout: effect.stdout,
      });

      const jobs = runHolo(['jobs:run-all', '--json'], url);
      cliResults.push({
        cmd: 'jobs:run-all',
        status: jobs.status,
        stderr: jobs.stderr,
        stdout: jobs.stdout,
      });

      const backup = runHolo(['backup:status', '--json'], url);
      cliResults.push({
        cmd: 'backup:status',
        status: backup.status,
        stderr: backup.stderr,
        stdout: backup.stdout,
      });

      const degraded = runHolo(['infer:degraded', '--json'], url);
      cliResults.push({
        cmd: 'infer:degraded',
        status: degraded.status,
        stderr: degraded.stderr,
        stdout: degraded.stdout,
      });

      writeEvidence('ac3-cli-results.json', cliResults);

      for (const r of cliResults) {
        const blob = `${r.stderr}\n${r.stdout}`;
        expect(blob, `${r.cmd} raised 42501`).not.toMatch(/42501|permission denied for/i);
      }

      // queue:effect + jobs:run-all must succeed for the schema probes.
      expect(effect.status, effect.stderr || effect.stdout).toBe(0);
      expect(jobs.status, jobs.stderr || jobs.stdout).toBe(0);
      expect(degraded.status, degraded.stderr || degraded.stdout).toBe(0);

      const sql = createSql(url);
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
          // 16 migrated jobs each write one job_runs row
          expect(Number(jobRows[0]?.n ?? 0)).toBe(16);
        }

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
