/**
 * Priority-lane leased queue (queue-1 / AC-1).
 *
 * Interactive work always dequeues before background missions. Each lease
 * records priority + fencing metadata in real Postgres (queue_jobs).
 *
 * RED-pinned exports: enqueue, dequeue, resetPriorityLanes (optional).
 */
import { randomUUID } from 'node:crypto';
import { LANE_PRIORITY, type JobLane } from './backend.ts';
import { withQueueSql } from './schema.ts';

export type PriorityJob = {
  id: string;
  lane: 'interactive' | 'background';
  name: string;
  /** Numeric priority recorded on the lease row (interactive=100, background=10). */
  priority?: number;
  /** Fencing token minted at lease time. */
  fence_token?: string | null;
  status?: string;
};

export type EnqueueInput = {
  name: string;
  lane: 'interactive' | 'background';
  payload?: Record<string, unknown>;
  databaseUrl?: string;
  /** Optional stable key (tests / idempotency). */
  key?: string;
  maxAttempts?: number;
};

/**
 * Enqueue a job into the durable queue. Interactive jobs get priority=100.
 */
export async function enqueue(job: EnqueueInput): Promise<PriorityJob> {
  const lane: JobLane = job.lane === 'interactive' ? 'interactive' : 'background';
  const priority = LANE_PRIORITY[lane];
  const payload = job.payload ?? {};
  const key = job.key ?? null;
  const maxAttempts = job.maxAttempts ?? 3;

  return withQueueSql(job.databaseUrl, async (sql) => {
    const rows = await sql<
      {
        id: string;
        lane: string;
        name: string;
        priority: number;
        status: string;
      }[]
    >`
      INSERT INTO queue_jobs (name, lane, priority, payload, status, max_attempts, key)
      VALUES (
        ${job.name},
        ${lane},
        ${priority},
        ${sql.json(payload as never)},
        'pending',
        ${maxAttempts},
        ${key}
      )
      RETURNING id::text AS id, lane, name, priority, status
    `;
    const row = rows[0];
    if (!row) {
      throw new Error('enqueue failed: no row returned');
    }
    return {
      id: row.id,
      lane: row.lane as PriorityJob['lane'],
      name: row.name,
      priority: row.priority,
      status: row.status,
    };
  });
}

/**
 * Dequeue next job honoring interactive-before-background (priority DESC).
 * Uses FOR UPDATE SKIP LOCKED for multi-worker safety. Mints a fence_token.
 */
export async function dequeue(databaseUrl?: string): Promise<PriorityJob | null> {
  const owner = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
  const fence = `fence-${randomUUID()}`;
  const leaseSeconds = 60;

  return withQueueSql(databaseUrl, async (sql) => {
    // Reclaim expired leases so work is never stuck forever.
    await sql`
      UPDATE queue_jobs
      SET
        status = 'pending',
        lease_owner = NULL,
        lease_expires_at = NULL,
        fence_token = NULL,
        updated_at = now()
      WHERE status = 'leased'
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at < now()
    `;

    const rows = await sql.begin(async (tx) => {
      const candidates = await tx<
        {
          id: string;
          lane: string;
          name: string;
          priority: number;
        }[]
      >`
        SELECT id::text AS id, lane, name, priority
        FROM queue_jobs
        WHERE status = 'pending'
          AND available_at <= now()
        ORDER BY priority DESC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      const job = candidates[0];
      if (!job) return [] as typeof candidates;

      await tx`
        UPDATE queue_jobs
        SET
          status = 'leased',
          fence_token = ${fence},
          lease_owner = ${owner},
          lease_expires_at = now() + make_interval(secs => ${leaseSeconds}),
          updated_at = now()
        WHERE id = ${job.id}::uuid
      `;
      return candidates;
    });

    const job = rows[0];
    if (!job) return null;

    return {
      id: job.id,
      lane: job.lane as PriorityJob['lane'],
      name: job.name,
      priority: job.priority,
      fence_token: fence,
      status: 'leased',
    };
  });
}

/**
 * Clear priority-suite seed rows (and any leased/pending jobs) for RED isolation.
 */
export async function resetPriorityLanes(databaseUrl?: string): Promise<void> {
  await withQueueSql(databaseUrl, async (sql) => {
    // Remove DLQ rows first (FK), then jobs used by priority suite.
    await sql`DELETE FROM queue_dlq WHERE true`;
    await sql`
      DELETE FROM queue_jobs
      WHERE name LIKE '%seed%'
         OR name LIKE 'background-mission%'
         OR name LIKE 'interactive-chat%'
         OR status IN ('pending', 'leased', 'completed', 'failed', 'dead_letter', 'cancelled')
    `;
  });
}
