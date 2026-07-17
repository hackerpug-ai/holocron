/**
 * Ensure leased-queue tables exist (idempotent). Used by priority/dlq APIs so
 * integration tests can run after migrate or bootstrap schema in-place.
 */
import { createSql, type Sql } from '../db/client.ts';

const ENSURE_SQL = `
CREATE TABLE IF NOT EXISTS queue_jobs (
  id uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  key text,
  name text NOT NULL,
  lane text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  fence_token text,
  lease_owner text,
  lease_expires_at timestamptz,
  available_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  poison boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT queue_jobs_lane_check CHECK (lane IN ('interactive', 'background')),
  CONSTRAINT queue_jobs_status_check CHECK (
    status IN ('pending','leased','completed','failed','dead_letter','cancelled')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS queue_jobs_key_uidx
  ON queue_jobs (key) WHERE key IS NOT NULL;

CREATE INDEX IF NOT EXISTS queue_jobs_dequeue_idx
  ON queue_jobs (status, priority DESC, available_at, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS queue_jobs_lane_status_idx
  ON queue_jobs (lane, status);

CREATE TABLE IF NOT EXISTS queue_dlq (
  id uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  job_id uuid NOT NULL REFERENCES queue_jobs (id) ON DELETE CASCADE,
  key text,
  name text NOT NULL,
  lane text,
  priority integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  fence_token text,
  reason text NOT NULL DEFAULT 'retry_exhausted',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS queue_dlq_key_idx ON queue_dlq (key);
CREATE INDEX IF NOT EXISTS queue_dlq_job_id_idx ON queue_dlq (job_id);

CREATE TABLE IF NOT EXISTS queue_backend_meta (
  id integer PRIMARY KEY DEFAULT 1 NOT NULL,
  backend text NOT NULL DEFAULT 'pg-boss',
  ready boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT queue_backend_meta_singleton CHECK (id = 1),
  CONSTRAINT queue_backend_meta_backend_check CHECK (
    backend IN ('pg-boss', 'graphile-worker')
  )
);

INSERT INTO queue_backend_meta (id, backend, ready)
VALUES (1, 'pg-boss', false)
ON CONFLICT (id) DO NOTHING;
`;

export async function ensureQueueSchema(sql: Sql): Promise<void> {
  await sql.unsafe(ENSURE_SQL);
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
