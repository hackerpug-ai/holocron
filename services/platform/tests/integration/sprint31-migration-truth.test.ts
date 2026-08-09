/**
 * S31-01 AC-1 + AC-2 — Drizzle migrations are the single source of schema truth.
 *
 * AC-1: fresh empty namespace → db:migrate → one row per .sql, 3 research_*, degraded_mode seeded
 * AC-2: ordinal collision + gap → exit 2, ORDINAL_*, 0 rows applied
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://inference1@127.0.0.1:5432/holocron_nonprod \
 *     pnpm vitest run services/platform/tests/integration/sprint31-migration-truth.test.ts
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql } from '../../src/db/client.ts';
import { MIGRATIONS_DIR } from '../../src/db/migrate.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const HOLO = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-01');
const COLLIDE_DIR = resolve(EVIDENCE_DIR, 'migrations-collide');

const OWNER_URL =
  process.env.DATABASE_URL_OWNER ??
  process.env.DATABASE_URL ??
  'postgres://inference1@127.0.0.1:5432/holocron';

const FRESH_DB = 'holocron_s31_01_fresh';
const COLLIDE_DB = 'holocron_s31_01_collide';

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
  const path = join(EVIDENCE_DIR, name);
  writeFileSync(path, typeof body === 'string' ? body : JSON.stringify(body, null, 2), 'utf8');
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

async function dropDb(name: string): Promise<void> {
  const admin = createSql(adminUrlFrom(OWNER_URL));
  try {
    await admin.unsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid()`
    );
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`);
  } finally {
    await admin.end({ timeout: 5 }).catch(() => undefined);
  }
}

function runMigrate(databaseUrl: string, envExtra?: Record<string, string>) {
  return spawnSync('bun', [HOLO, 'db:migrate', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_URL_OWNER: databaseUrl,
      HOLO_DANGEROUS_ALLOW_PROD_DB: '0',
      ...envExtra,
    },
    timeout: 180_000,
  });
}

function runVerifyMerges(databaseUrl: string) {
  return spawnSync('bun', [HOLO, 'db:verify', '--merges', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_URL_OWNER: databaseUrl,
    },
    timeout: 60_000,
  });
}

function countOnDiskSql(): number {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).length;
}

describe('S31-01 migration truth (real Postgres)', () => {
  beforeAll(async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
  });

  afterAll(async () => {
    if (!PLATFORM_IT) return;
    await dropDb(FRESH_DB).catch(() => undefined);
    await dropDb(COLLIDE_DB).catch(() => undefined);
  });

  itLive(
    'freshNamespaceMigratesToCompleteSchema (AC-1)',
    async () => {
      await dropAndCreateDb(FRESH_DB);
      const url = dbUrl(FRESH_DB);
      const sql = createSql(url);
      try {
        const before = await sql<{ n: string }[]>`
          SELECT count(*)::text AS n
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        `;
        expect(Number(before[0]?.n ?? -1)).toBe(0);

        const mig = runMigrate(url);
        writeEvidence('ac1-migrate-stdout.json', mig.stdout);
        writeEvidence('ac1-migrate-stderr.txt', mig.stderr);
        writeEvidence('ac1-migrate-status.json', { status: mig.status });

        expect(mig.status, `db:migrate exit: ${mig.stderr || mig.stdout}`).toBe(0);
        const parsed = JSON.parse(mig.stdout) as {
          ok: boolean;
          migrationsApplied: string[];
          alreadyApplied: string[];
          errors: string[];
        };
        expect(parsed.ok).toBe(true);
        expect(parsed.errors ?? []).toEqual([]);

        const onDisk = countOnDiskSql();
        writeEvidence('ac1-on-disk-sql-count.json', { onDisk });

        const migRows = await sql<{ n: string; distinct_n: string }[]>`
          SELECT count(*)::text AS n, count(DISTINCT hash)::text AS distinct_n
          FROM drizzle_migrations
        `;
        const rowCount = Number(migRows[0]?.n ?? 0);
        const distinctCount = Number(migRows[0]?.distinct_n ?? 0);
        writeEvidence('ac1-drizzle-migrations.json', {
          rowCount,
          distinctCount,
          onDisk,
        });
        expect(rowCount).toBe(onDisk);
        expect(distinctCount).toBe(onDisk);
        expect(rowCount).toBeGreaterThanOrEqual(34);

        const tables = await sql<{ n: string }[]>`
          SELECT count(*)::text AS n
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            AND table_name NOT IN ('drizzle_migrations')
        `;
        expect(Number(tables[0]?.n ?? 0)).toBeGreaterThanOrEqual(55);

        const research = await sql<{ n: string; names: string }[]>`
          SELECT count(*)::text AS n,
                 coalesce(string_agg(table_name, ',' ORDER BY table_name), '') AS names
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            AND table_name LIKE 'research\\_%' ESCAPE '\\'
        `;
        writeEvidence('ac1-research-tables.json', research[0]);
        expect(Number(research[0]?.n ?? 0)).toBe(3);
        expect(research[0]?.names).not.toMatch(/research_mission/);

        const degraded = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM degraded_mode`;
        expect(Number(degraded[0]?.n ?? 0)).toBe(1);

        const retry = await sql<{ reg: string | null }[]>`
          SELECT to_regclass('public.retry_queue')::text AS reg
        `;
        expect(retry[0]?.reg).toBeTruthy();

        const verify = runVerifyMerges(url);
        writeEvidence('ac1-verify-merges.json', verify.stdout);
        expect(verify.status, `db:verify --merges: ${verify.stderr || verify.stdout}`).toBe(0);
        const verifyBody = JSON.parse(verify.stdout) as { ok?: boolean; researchTables?: string[] };
        expect(verifyBody.ok).toBe(true);
        if (verifyBody.researchTables) {
          expect(verifyBody.researchTables).toHaveLength(3);
        }
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
    240_000
  );

  itLive(
    'ordinalGateRefusesCollisionAndGap (AC-2)',
    async () => {
      // Build colliding tree: copy real migrations, then add probes that collide + gap.
      if (existsSync(COLLIDE_DIR)) rmSync(COLLIDE_DIR, { recursive: true, force: true });
      mkdirSync(dirname(COLLIDE_DIR), { recursive: true });
      cpSync(MIGRATIONS_DIR, COLLIDE_DIR, { recursive: true });
      // Remove meta noise for listing — keep only .sql
      const meta = join(COLLIDE_DIR, 'meta');
      if (existsSync(meta)) rmSync(meta, { recursive: true, force: true });

      writeFileSync(join(COLLIDE_DIR, '0033_alpha_probe.sql'), 'SELECT 1;\n', 'utf8');
      writeFileSync(join(COLLIDE_DIR, '0033_beta_probe.sql'), 'SELECT 1;\n', 'utf8');
      // 0033 already exists as zero_pub renumber — probes collide at 0033 with each other
      // and with 0033_zero_pub_file_objects.sql if present. AC wants two 0033 probes.
      // Remove the real 0033 so only the two probes share 0033, then add 0035 with gap at 0034.
      const real0033 = join(COLLIDE_DIR, '0033_zero_pub_file_objects.sql');
      if (existsSync(real0033)) rmSync(real0033);
      // Remove 0034+ so gap is clean: after 0032, only 0033_alpha/beta and 0035_gap_probe
      for (const f of readdirSync(COLLIDE_DIR)) {
        if (!f.endsWith('.sql')) continue;
        const ord = Number(f.slice(0, 4));
        if (ord >= 34 && f !== '0035_gap_probe.sql') {
          rmSync(join(COLLIDE_DIR, f));
        }
      }
      writeFileSync(join(COLLIDE_DIR, '0035_gap_probe.sql'), 'SELECT 1;\n', 'utf8');

      await dropAndCreateDb(COLLIDE_DB);
      const url = dbUrl(COLLIDE_DB);

      const mig = runMigrate(url, { HOLO_MIGRATIONS_DIR: COLLIDE_DIR });
      writeEvidence('ac2-migrate-stdout.json', mig.stdout);
      writeEvidence('ac2-migrate-status.json', {
        status: mig.status,
        stderr: mig.stderr,
      });

      expect(mig.status).toBe(2);
      const parsed = JSON.parse(mig.stdout) as {
        ok: boolean;
        migrationsApplied: string[];
        errors: string[];
        errorDetails?: Array<{ code: string; files?: string[]; ordinal?: string }>;
      };
      expect(parsed.ok).toBe(false);
      expect(parsed.migrationsApplied ?? []).toEqual([]);

      const errText = JSON.stringify(parsed);
      expect(errText).toMatch(/ORDINAL_COLLISION/);
      expect(errText).toMatch(/0033_alpha_probe\.sql/);
      expect(errText).toMatch(/0033_beta_probe\.sql/);
      expect(errText).toMatch(/ORDINAL_GAP/);
      expect(errText).toMatch(/0034/);

      const sql = createSql(url);
      try {
        const rows = await sql<{ n: string }[]>`
          SELECT count(*)::text AS n FROM drizzle_migrations
        `;
        writeEvidence('ac2-drizzle-count.json', { n: rows[0]?.n });
        expect(Number(rows[0]?.n ?? -1)).toBe(0);
      } finally {
        await sql.end({ timeout: 5 });
      }

      // Clean path: real migrations dir has no collision/gap
      await dropAndCreateDb(FRESH_DB);
      const clean = runMigrate(dbUrl(FRESH_DB));
      writeEvidence('ac2-clean-migrate-status.json', {
        status: clean.status,
        stdout: clean.stdout,
      });
      expect(clean.status).toBe(0);
      const cleanParsed = JSON.parse(clean.stdout) as {
        migrationsApplied: string[];
        errors: string[];
      };
      expect(cleanParsed.errors ?? []).toEqual([]);
      expect(cleanParsed.migrationsApplied.length).toBe(countOnDiskSql());
      expect(cleanParsed.migrationsApplied.filter((f) => f.startsWith('0030_'))).toHaveLength(1);
    },
    240_000
  );
});
