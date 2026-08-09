/**
 * S31-01 AC-5 — migrated queue schema matches migration 0010 (no runtime ENSURE_SQL).
 *
 * holocron_app exists BEFORE migrate so GRANT blocks in 0010/0036 fire; test never re-GRANTs.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint31-queue-schema-reconciled.test.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql } from '../../src/db/client.ts';
import { HOLOCRON_APP_ROLE } from '../../src/db/evidence/roles.ts';
import { applyMigrations } from '../../src/db/migrate.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-01');
const QUEUE_SCHEMA = resolve(REPO_ROOT, 'services/platform/src/queue/schema.ts');

const OWNER_URL =
  process.env.DATABASE_URL_OWNER ??
  process.env.DATABASE_URL ??
  'postgres://inference1@127.0.0.1:5432/holocron';

const DB_NAME = 'holocron_s31_01_queue';

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

/** Cluster-level app role BEFORE migrate — migration GRANT blocks require it. */
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
  } finally {
    await admin.end({ timeout: 5 });
  }
}

describe('S31-01 queue schema reconciled (real Postgres)', () => {
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
    'queueSchemaMatchesMigration0010 (AC-5)',
    async () => {
      await ensureHolocronAppRole();
      await dropAndCreateDb(DB_NAME);
      const url = dbUrl(DB_NAME);

      // Role exists first so 0010 / 0036 DO $grants$ blocks actually GRANT to holocron_app.
      writeEvidence('ac5-role-before-migrate.json', {
        role: HOLOCRON_APP_ROLE,
        note: 'holocron_app ensured at cluster level before applyMigrations; test issues no GRANT',
      });

      const mig = await applyMigrations({ databaseUrl: url });
      expect(mig.ok, mig.errors.join('; ')).toBe(true);

      const sql = createSql(url);
      try {
        // NO post-migrate GRANT — inventory must come from migrations alone.

        const checks = await sql<{ conname: string }[]>`
          SELECT conname
          FROM pg_constraint
          WHERE contype = 'c' AND conrelid = 'public.queue_jobs'::regclass
          ORDER BY conname
        `;
        const connames = new Set(checks.map((r) => r.conname));
        writeEvidence('ac5-queue-checks.json', [...connames]);
        expect(connames.has('queue_jobs_priority_nonneg')).toBe(true);
        expect(connames.has('queue_jobs_attempts_nonneg')).toBe(true);
        expect(connames.has('queue_jobs_max_attempts_pos')).toBe(true);
        expect(connames.size).toBeGreaterThanOrEqual(5);

        const indexes = await sql<{ indexname: string }[]>`
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename IN ('queue_jobs', 'queue_dlq')
          ORDER BY indexname
        `;
        const indexnames = new Set(indexes.map((r) => r.indexname));
        writeEvidence('ac5-queue-indexes.json', [...indexnames]);
        expect(indexnames.has('queue_jobs_lease_expires_idx')).toBe(true);
        expect(indexnames.has('queue_dlq_created_at_idx')).toBe(true);

        const grants = await sql<{ privilege_type: string }[]>`
          SELECT privilege_type
          FROM information_schema.role_table_grants
          WHERE grantee = ${HOLOCRON_APP_ROLE}
            AND table_schema = 'public'
            AND table_name = 'queue_jobs'
        `;
        const privs = new Set(grants.map((g) => g.privilege_type));
        writeEvidence('ac5-queue-grants.json', {
          grantee: HOLOCRON_APP_ROLE,
          privileges: [...privs],
          source: 'migration-only (no test GRANT)',
        });
        for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
          expect(privs.has(p), `missing ${p} for holocron_app from migrations`).toBe(true);
        }

        const schemaSrc = readFileSync(QUEUE_SCHEMA, 'utf8');
        const createCount = (schemaSrc.match(/CREATE TABLE/g) ?? []).length;
        writeEvidence('ac5-schema-create-count.json', { createCount });
        expect(createCount).toBe(0);
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
    240_000
  );
});
