/**
 * Queue schema helpers — migrate-owned tables only (0010_queue_leased + 0036 reconcile).
 * Runtime DDL (table/index/privilege statements) is prohibited (S31-01).
 */
import { createSql, type Sql } from '../db/client.ts';

/**
 * Fail-closed assert: queue tables must already exist via `holo db:migrate`.
 * Never issues schema-mutating SQL.
 */
export async function ensureQueueSchema(sql: Sql): Promise<void> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT to_regclass('public.queue_jobs') IS NOT NULL AS exists
  `;
  if (!rows[0]?.exists) {
    throw new Error(
      'queue_jobs table is missing — run `holo db:migrate` (migration 0010_queue_leased) before queue APIs; schema is migrate-owned only'
    );
  }
}

export async function withQueueSql<T>(
  databaseUrl: string | undefined,
  fn: (sql: Sql) => Promise<T>
): Promise<T> {
  const sql = createSql(databaseUrl);
  try {
    await ensureQueueSchema(sql);
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export type QueueBackendName = 'pg-boss' | 'graphile-worker';

export async function markBackendReady(
  sql: Sql,
  backend: QueueBackendName,
  ready: boolean
): Promise<void> {
  await sql`
    INSERT INTO queue_backend_meta (id, backend, ready, updated_at)
    VALUES (1, ${backend}, ${ready}, now())
    ON CONFLICT (id) DO UPDATE SET
      backend = EXCLUDED.backend,
      ready = EXCLUDED.ready,
      updated_at = now()
  `;
}

export async function readBackendMeta(sql: Sql): Promise<{
  backend: QueueBackendName;
  ready: boolean;
}> {
  const rows = await sql<{ backend: string; ready: boolean }[]>`
    SELECT backend, ready FROM queue_backend_meta WHERE id = 1 LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    return { backend: 'pg-boss', ready: false };
  }
  const backend: QueueBackendName =
    row.backend === 'graphile-worker' ? 'graphile-worker' : 'pg-boss';
  return { backend, ready: Boolean(row.ready) };
}
