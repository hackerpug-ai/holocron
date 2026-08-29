/**
 * D02-02 — Deterministic nonprod seed/reset.
 */
import { createHash } from 'node:crypto';
import { createSql } from './client';
import { applyMigrations } from './migrate';
import {
  databaseNameFromUrl,
  isProdDatabaseUrl,
  NONPROD_DB_NAME,
  provisionNonprodNamespace,
} from './nonprod';

export const SEED_MARKER_TABLE = '_holo_seed_meta';
export const FIXTURE_IDS = ['seed-conversation-1', 'seed-message-1', 'seed-message-2'] as const;

export type SeedResult = {
  ok: boolean;
  database: string;
  seed_fingerprint: string;
  table_count: number;
  fixture_ids: string[];
  reset: boolean;
  messages: string[];
  errors: string[];
};

function fingerprint(parts: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
}

export function assertSeedTargetAllowed(databaseUrl: string): void {
  if (!isProdDatabaseUrl(databaseUrl)) return;
  if (process.env.HOLO_ALLOW_PROD_SEED === '1') return;
  throw new Error(
    `refusing seed/reset against production-like database '${databaseNameFromUrl(databaseUrl)}' — set HOLO_ALLOW_PROD_SEED=1 to override (dangerous)`
  );
}

export async function seedDatabase(options?: {
  databaseUrl?: string;
  reset?: boolean;
}): Promise<SeedResult> {
  const databaseUrl =
    options?.databaseUrl ??
    process.env.DATABASE_URL ??
    `postgres://127.0.0.1:5432/${NONPROD_DB_NAME}`;
  const reset = options?.reset !== false;
  const messages: string[] = [];
  const errors: string[] = [];

  try {
    assertSeedTargetAllowed(databaseUrl);
  } catch (err) {
    return {
      ok: false,
      database: databaseNameFromUrl(databaseUrl),
      seed_fingerprint: '',
      table_count: 0,
      fixture_ids: [],
      reset,
      messages,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  if (databaseNameFromUrl(databaseUrl) === NONPROD_DB_NAME) {
    const prov = await provisionNonprodNamespace({ ownerUrl: databaseUrl });
    messages.push(...prov.messages);
    if (!prov.ok) {
      return {
        ok: false,
        database: NONPROD_DB_NAME,
        seed_fingerprint: '',
        table_count: 0,
        fixture_ids: [],
        reset,
        messages,
        errors: prov.errors,
      };
    }
  } else {
    const mig = await applyMigrations({ databaseUrl });
    messages.push(...mig.messages);
    if (!mig.ok) errors.push(...mig.errors);
  }

  const sql = createSql(databaseUrl);
  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${SEED_MARKER_TABLE} (
        id text PRIMARY KEY,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    if (reset) {
      const tables = await sql<{ relname: string }[]>`
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname NOT IN ('drizzle_migrations')
        ORDER BY c.relname
      `;
      if (tables.length) {
        const list = tables.map((t) => `"${t.relname.replaceAll('"', '')}"`).join(', ');
        await sql.unsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
        messages.push(`truncated ${tables.length} public tables`);
      }
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS ${SEED_MARKER_TABLE} (
          id text PRIMARY KEY,
          payload jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
    }

    for (const id of FIXTURE_IDS) {
      await sql.unsafe(
        `INSERT INTO ${SEED_MARKER_TABLE} (id, payload) VALUES ($1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload`,
        [id, JSON.stringify({ kind: 'fixture', id })]
      );
    }
    messages.push(`seeded ${FIXTURE_IDS.length} fixture ids`);
    await sql`
      INSERT INTO conversations (id, title, created_at, updated_at)
      VALUES ('00000000-0000-0000-0000-000000000020'::uuid, 'Sprint 20 reference conversation', now(), now())
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, updated_at = now()
    `;
    messages.push('seeded Sprint 20 reference conversation');

    const tableCountRows = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `;
    const table_count = tableCountRows[0]?.n ?? 0;

    const fixtureRows = (await sql.unsafe(
      `SELECT id FROM ${SEED_MARKER_TABLE} WHERE id LIKE 'seed-%' ORDER BY id`
    )) as Array<{ id: string }>;
    const fixture_ids = fixtureRows.map((r) => r.id);
    const seed_fingerprint = fingerprint({
      database: databaseNameFromUrl(databaseUrl),
      table_count,
      fixture_ids,
      version: 1,
    });

    await sql.unsafe(
      `INSERT INTO ${SEED_MARKER_TABLE} (id, payload) VALUES ($1, $2::jsonb)
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload`,
      ['seed-fingerprint', JSON.stringify({ seed_fingerprint, table_count, fixture_ids })]
    );

    return {
      ok: errors.length === 0,
      database: databaseNameFromUrl(databaseUrl),
      seed_fingerprint,
      table_count,
      fixture_ids,
      reset,
      messages,
      errors,
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return {
      ok: false,
      database: databaseNameFromUrl(databaseUrl),
      seed_fingerprint: '',
      table_count: 0,
      fixture_ids: [],
      reset,
      messages,
      errors,
    };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}
