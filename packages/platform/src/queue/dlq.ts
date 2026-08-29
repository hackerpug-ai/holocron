/**
 * Dead-letter + retry/backoff path (queue-1 / AC-2).
 *
 * Poison jobs exhaust max_attempts with exponential backoff, then land in
 * queue_dlq with terminal status dead_letter. Never silently dropped.
 *
 * RED-pinned exports: seedPoisonJob, runUntilTerminal, resetDlq, getJob.
 */
import { randomUUID } from 'node:crypto';
import { withQueueSql } from './schema.ts';

export type SeedPoisonResult = {
  id: string;
  key: string;
  max_attempts: number;
};

export type TerminalResult = {
  status: string;
  attempts: number;
  dlq_count: number;
};

export type JobRow = {
  status: string;
  attempts: number;
};

/** Base backoff in ms; doubles each attempt (cap 30s for tests). */
const BASE_BACKOFF_MS = 50;
const MAX_BACKOFF_MS = 30_000;

function backoffMs(attempt: number): number {
  const ms = BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1);
  return Math.min(MAX_BACKOFF_MS, ms);
}

/**
 * Seed a poison job that always fails, with bounded retries (max_attempts).
 */
export async function seedPoisonJob(opts: {
  key: string;
  maxAttempts: number;
  databaseUrl?: string;
}): Promise<SeedPoisonResult> {
  const maxAttempts = Math.max(1, opts.maxAttempts);
  return withQueueSql(opts.databaseUrl, async (sql) => {
    // Upsert-ish: clear prior row for this key so RED re-runs are clean.
    await sql`DELETE FROM queue_dlq WHERE key = ${opts.key}`;
    await sql`DELETE FROM queue_jobs WHERE key = ${opts.key}`;

    const rows = await sql<{ id: string }[]>`
      INSERT INTO queue_jobs (
        key, name, lane, priority, payload, status, max_attempts, poison, attempts
      )
      VALUES (
        ${opts.key},
        ${'poison-job'},
        ${'background'},
        ${10},
        ${sql.json({ poison: true, key: opts.key } as never)},
        'pending',
        ${maxAttempts},
        true,
        0
      )
      RETURNING id::text AS id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error('seedPoisonJob: insert returned no id');
    return { id, key: opts.key, max_attempts: maxAttempts };
  });
}

/**
 * Drive the worker until the poison job exhausts retries or lands in DLQ.
 * Simulates failure on each lease; applies backoff; dead-letters at cap.
 */
export async function runUntilTerminal(opts: {
  key: string;
  databaseUrl?: string;
}): Promise<TerminalResult> {
  return withQueueSql(opts.databaseUrl, async (sql) => {
    const maxLoops = 50;
    for (let i = 0; i < maxLoops; i++) {
      const current = await sql<
        {
          id: string;
          status: string;
          attempts: number;
          max_attempts: number;
          available_at: Date;
        }[]
      >`
        SELECT
          id::text AS id,
          status,
          attempts,
          max_attempts,
          available_at
        FROM queue_jobs
        WHERE key = ${opts.key}
        LIMIT 1
      `;
      const job = current[0];
      if (!job) {
        throw new Error(`runUntilTerminal: job key=${opts.key} not found`);
      }

      if (job.status === 'dead_letter') {
        const dlq = await countDlq(sql, opts.key);
        return { status: 'dead_letter', attempts: job.attempts, dlq_count: dlq };
      }
      if (job.status === 'completed') {
        const dlq = await countDlq(sql, opts.key);
        return { status: 'completed', attempts: job.attempts, dlq_count: dlq };
      }

      // Wait until available_at if still in backoff window.
      const availableAt = new Date(job.available_at).getTime();
      const now = Date.now();
      if (job.status === 'pending' && availableAt > now) {
        const wait = Math.min(availableAt - now, 200);
        await sleep(wait);
        continue;
      }

      // Lease the job (priority not relevant for single poison key).
      const fence = `fence-${randomUUID()}`;
      const owner = `dlq-worker-${process.pid}`;
      const leased = await sql.begin(async (tx) => {
        const rows = await tx<{ id: string; attempts: number; max_attempts: number }[]>`
          SELECT id::text AS id, attempts, max_attempts
          FROM queue_jobs
          WHERE key = ${opts.key}
            AND status = 'pending'
            AND available_at <= now()
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `;
        const row = rows[0];
        if (!row) return null;
        await tx`
          UPDATE queue_jobs
          SET
            status = 'leased',
            fence_token = ${fence},
            lease_owner = ${owner},
            lease_expires_at = now() + interval '30 seconds',
            updated_at = now()
          WHERE id = ${row.id}::uuid
        `;
        return row;
      });

      if (!leased) {
        // Might be mid-backoff or already terminal; small yield.
        await sleep(20);
        continue;
      }

      // Poison always fails.
      const nextAttempts = leased.attempts + 1;
      const error = `poison failure attempt=${nextAttempts}`;

      if (nextAttempts >= leased.max_attempts) {
        // Terminal: dead-letter — write DLQ row + mark job (never silent drop).
        await sql.begin(async (tx) => {
          await tx`
            UPDATE queue_jobs
            SET
              status = 'dead_letter',
              attempts = ${nextAttempts},
              last_error = ${error},
              lease_owner = NULL,
              lease_expires_at = NULL,
              completed_at = now(),
              updated_at = now()
            WHERE id = ${leased.id}::uuid
          `;
          const full = await tx<
            {
              key: string | null;
              name: string;
              lane: string;
              priority: number;
              payload: unknown;
              max_attempts: number;
              fence_token: string | null;
            }[]
          >`
            SELECT key, name, lane, priority, payload, max_attempts, fence_token
            FROM queue_jobs WHERE id = ${leased.id}::uuid
          `;
          const f = full[0]!;
          await tx`
            INSERT INTO queue_dlq (
              job_id, key, name, lane, priority, payload,
              attempts, max_attempts, last_error, fence_token, reason
            )
            VALUES (
              ${leased.id}::uuid,
              ${f.key},
              ${f.name},
              ${f.lane},
              ${f.priority},
              ${tx.json((f.payload ?? {}) as never)},
              ${nextAttempts},
              ${f.max_attempts},
              ${error},
              ${f.fence_token ?? fence},
              ${'retry_exhausted'}
            )
          `;
        });
        const dlq = await countDlq(sql, opts.key);
        return { status: 'dead_letter', attempts: nextAttempts, dlq_count: dlq };
      }

      // Retry with backoff — stay pending, never drop.
      const delay = backoffMs(nextAttempts);
      await sql`
        UPDATE queue_jobs
        SET
          status = 'pending',
          attempts = ${nextAttempts},
          last_error = ${error},
          lease_owner = NULL,
          lease_expires_at = NULL,
          fence_token = NULL,
          available_at = now() + (${delay}::double precision * interval '1 millisecond'),
          updated_at = now()
        WHERE id = ${leased.id}::uuid
      `;
    }

    // Safety: if we exhausted loops, force-read current state (fail closed, not silent).
    const final = await sql<{ status: string; attempts: number }[]>`
      SELECT status, attempts FROM queue_jobs WHERE key = ${opts.key} LIMIT 1
    `;
    const dlq = await countDlq(sql, opts.key);
    return {
      status: final[0]?.status ?? 'unknown',
      attempts: final[0]?.attempts ?? 0,
      dlq_count: dlq,
    };
  });
}

export async function resetDlq(databaseUrl?: string): Promise<void> {
  await withQueueSql(databaseUrl, async (sql) => {
    await sql`DELETE FROM queue_dlq WHERE true`;
    await sql`
      DELETE FROM queue_jobs
      WHERE poison = true
         OR name = 'poison-job'
         OR key LIKE 'red-poison%'
         OR key LIKE 'poison%'
    `;
  });
}

export async function getJob(key: string, databaseUrl?: string): Promise<JobRow | null> {
  return withQueueSql(databaseUrl, async (sql) => {
    const rows = await sql<{ status: string; attempts: number }[]>`
      SELECT status, attempts FROM queue_jobs WHERE key = ${key} LIMIT 1
    `;
    const row = rows[0];
    return row ? { status: row.status, attempts: row.attempts } : null;
  });
}

async function countDlq(
  sql: Parameters<Parameters<typeof withQueueSql>[1]>[0],
  key: string
): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM queue_dlq WHERE key = ${key}
  `;
  return Number(rows[0]?.count ?? 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
