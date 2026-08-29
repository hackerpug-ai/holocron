/**
 * Wave 4 T-01 — migration 0039 research pipeline columns + research_web_calls.
 *
 * Proves on real Postgres (holocron_nonprod):
 *   - migrator applies 0039; second run applies 0 (idempotent)
 *   - new columns / unique indexes / research_web_calls exist
 *   - RESEARCH_TRIO stays length 3; research_web_calls in DOMAIN, not zero_pub
 *   - UNIQUE (session_id, iteration_number) rejects duplicates
 *   - holocron_app can INSERT into research_web_calls when role exists
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     pnpm vitest run --project integration packages/platform/tests/integration/research-migration-0039.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client.ts';
import { applyMigrations } from '../../src/db/migrate.ts';
import {
  DOMAIN_TABLE_NAMES,
  RESEARCH_TRIO,
  ZERO_PUB_EXCLUDED_TABLES,
  ZERO_PUB_TABLE_NAMES,
} from '../../src/db/schema/index.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const MIGRATION_SQL = resolve(
  REPO_ROOT,
  'packages/platform/src/db/migrations/0039_research_pipeline.sql'
);

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_OWNER ??
  'postgres://127.0.0.1:5432/holocron_nonprod';

const SESSION_COLS = [
  'phase',
  'progress',
  'idempotency_key',
  'started_at',
  'cancel_requested_at',
  'estimated_cost_usd',
] as const;

const ITERATION_COLS = ['updated_at', 'branch_id', 'duration_ms', 'estimated_cost_usd'] as const;

describe('Wave 4 T-01 research migration 0039', () => {
  let sql: Sql;
  let firstMigrate: Awaited<ReturnType<typeof applyMigrations>>;
  let secondMigrate: Awaited<ReturnType<typeof applyMigrations>>;

  beforeAll(async () => {
    if (!DATABASE_URL.includes('holocron_nonprod')) {
      throw new Error(
        `DATABASE_URL must target holocron_nonprod (got ${DATABASE_URL}). Refusing to run.`
      );
    }

    try {
      sql = createSql(DATABASE_URL);
      await sql`SELECT 1`;
    } catch (err) {
      throw new Error(
        `Postgres unreachable for ${DATABASE_URL}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    firstMigrate = await applyMigrations({ databaseUrl: DATABASE_URL });
    if (!firstMigrate.ok) {
      throw new Error(`first migrate failed: ${firstMigrate.errors.join('; ')}`);
    }

    secondMigrate = await applyMigrations({ databaseUrl: DATABASE_URL });
    if (!secondMigrate.ok) {
      throw new Error(`second migrate failed: ${secondMigrate.errors.join('; ')}`);
    }
  }, 120_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 }).catch(() => undefined);
  });

  it('migrator applies 0039 then second run applies 0', () => {
    const appliedOrPresent =
      firstMigrate.migrationsApplied.includes('0039_research_pipeline.sql') ||
      firstMigrate.alreadyApplied.includes('0039_research_pipeline.sql');
    expect(appliedOrPresent).toBe(true);
    expect(secondMigrate.migrationsApplied).toEqual([]);
    expect(secondMigrate.alreadyApplied).toContain('0039_research_pipeline.sql');
  });

  it('research_sessions gains pipeline columns; full-table zero_pub membership holds', async () => {
    const cols = await sql<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'research_sessions'
    `;
    const names = new Set(cols.map((c) => c.column_name));
    for (const col of SESSION_COLS) {
      expect(names.has(col), `missing research_sessions.${col}`).toBe(true);
    }

    const phaseCheck = await sql<{ def: string }[]>`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conname = 'research_sessions_phase_check'
        AND conrelid = 'public.research_sessions'::regclass
    `;
    expect(phaseCheck[0]?.def ?? '').toMatch(/planning/);
    expect(phaseCheck[0]?.def ?? '').toMatch(/publishing/);

    const partialUnique = await sql<{ indexdef: string }[]>`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'research_sessions'
        AND indexname = 'research_sessions_idempotency_key_uidx'
    `;
    expect(partialUnique[0]?.indexdef ?? '').toMatch(/UNIQUE/i);
    expect(partialUnique[0]?.indexdef ?? '').toMatch(/idempotency_key/);
    expect(partialUnique[0]?.indexdef ?? '').toMatch(/WHERE/i);

    const pub = await sql<{ tablename: string; all_columns: boolean }[]>`
      SELECT c.relname AS tablename, (pr.prattrs IS NULL) AS all_columns
      FROM pg_publication_rel pr
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_publication p ON p.oid = pr.prpubid
      WHERE p.pubname = 'zero_pub' AND c.relname = 'research_sessions'
    `;
    expect(pub.length).toBeGreaterThan(0);
    expect(pub[0]?.all_columns).toBe(true);

    const pubCols = await sql<{ attnames: string[] }[]>`
      SELECT attnames
      FROM pg_publication_tables
      WHERE pubname = 'zero_pub' AND tablename = 'research_sessions'
    `;
    const published = new Set(pubCols[0]?.attnames ?? []);
    for (const col of SESSION_COLS) {
      expect(published.has(col), `zero_pub missing research_sessions.${col}`).toBe(true);
    }
  });

  it('research_iterations gains columns + UNIQUE(session_id, iteration_number); pub refreshed', async () => {
    const cols = await sql<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'research_iterations'
    `;
    const names = new Set(cols.map((c) => c.column_name));
    for (const col of ITERATION_COLS) {
      expect(names.has(col), `missing research_iterations.${col}`).toBe(true);
    }

    const uidx = await sql<{ indexdef: string }[]>`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'research_iterations'
        AND indexname = 'research_iterations_session_iteration_uidx'
    `;
    expect(uidx[0]?.indexdef ?? '').toMatch(/UNIQUE/i);
    expect(uidx[0]?.indexdef ?? '').toMatch(/session_id/);
    expect(uidx[0]?.indexdef ?? '').toMatch(/iteration_number/);

    const pubCols = await sql<{ attnames: string[] }[]>`
      SELECT attnames
      FROM pg_publication_tables
      WHERE pubname = 'zero_pub' AND tablename = 'research_iterations'
    `;
    const published = new Set(pubCols[0]?.attnames ?? []);
    for (const col of ITERATION_COLS) {
      expect(published.has(col), `zero_pub missing research_iterations.${col}`).toBe(true);
    }
    expect(published.has('embedding')).toBe(false);
  });

  it('research_web_calls exists; catalog invariants; not in zero_pub', async () => {
    const reg = await sql<{ reg: string | null }[]>`
      SELECT to_regclass('public.research_web_calls')::text AS reg
    `;
    expect(reg[0]?.reg).toBe('research_web_calls');

    expect(RESEARCH_TRIO).toHaveLength(3);
    expect(DOMAIN_TABLE_NAMES).toContain('research_web_calls');
    expect((ZERO_PUB_TABLE_NAMES as readonly string[]).includes('research_web_calls')).toBe(false);
    expect(ZERO_PUB_EXCLUDED_TABLES).toContain('research_web_calls');

    const inPub = await sql<{ n: string }[]>`
      SELECT tablename AS n
      FROM pg_publication_tables
      WHERE pubname = 'zero_pub' AND tablename = 'research_web_calls'
    `;
    expect(inPub).toEqual([]);
  });

  it('UNIQUE(session_id, iteration_number) rejects duplicate iteration rows', async () => {
    const session = await sql<{ id: string }[]>`
      INSERT INTO research_sessions (system, status, query)
      VALUES ('simple', 'queued', '0039-unique-proof')
      RETURNING id::text AS id
    `;
    const sessionId = session[0]?.id;
    expect(sessionId).toBeTruthy();

    await sql`
      INSERT INTO research_iterations (system, status, session_id, iteration_number)
      VALUES ('simple', 'pending', ${sessionId}::uuid, 1)
    `;

    let rejected = false;
    let msg = '';
    try {
      await sql`
        INSERT INTO research_iterations (system, status, session_id, iteration_number)
        VALUES ('simple', 'pending', ${sessionId}::uuid, 1)
      `;
    } catch (err) {
      rejected = true;
      msg = err instanceof Error ? err.message : String(err);
    }
    expect(rejected).toBe(true);
    expect(msg).toMatch(/unique|duplicate|research_iterations_session_iteration_uidx/i);

    await sql`DELETE FROM research_iterations WHERE session_id = ${sessionId}::uuid`;
    await sql`DELETE FROM research_sessions WHERE id = ${sessionId}::uuid`;
  });

  it('holocron_app can INSERT into research_web_calls (or GRANT is in SQL)', async () => {
    const migBody = readFileSync(MIGRATION_SQL, 'utf8');
    expect(migBody).toMatch(
      /GRANT\s+SELECT,\s*INSERT,\s*UPDATE\s+ON\s+TABLE\s+research_web_calls\s+TO\s+holocron_app/i
    );

    const role = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') AS exists
    `;
    if (!role[0]?.exists) {
      expect(migBody).toMatch(/holocron_app/);
      return;
    }

    const session = await sql<{ id: string }[]>`
      INSERT INTO research_sessions (system, status, query)
      VALUES ('simple', 'queued', '0039-grant-proof')
      RETURNING id::text AS id
    `;
    const sessionId = session[0]!.id;

    const u = new URL(DATABASE_URL);
    u.username = 'holocron_app';
    u.password = '';
    const appSql = createSql(u.toString());

    try {
      const inserted = await appSql<{ id: string }[]>`
        INSERT INTO research_web_calls (session_id, provider, call_kind, query)
        VALUES (${sessionId}::uuid, 'jina', 'search', '0039-grant-proof')
        RETURNING id::text AS id
      `;
      expect(inserted[0]?.id).toBeTruthy();
      await sql`DELETE FROM research_web_calls WHERE session_id = ${sessionId}::uuid`;
    } finally {
      await appSql.end({ timeout: 5 }).catch(() => undefined);
      await sql`DELETE FROM research_sessions WHERE id = ${sessionId}::uuid`;
    }
  });
});
