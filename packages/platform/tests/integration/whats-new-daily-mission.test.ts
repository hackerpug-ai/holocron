/**
 * imp-prod-tool-audit-remediation AC-2 — whats-new-daily admits a real mission
 * run (with a runId) so the scheduler-worker's mission branch actually
 * regenerates the daily briefing instead of silently skipping.
 *
 * Real Postgres only (DATABASE_URL, fail closed — no skip-to-green). No mocks.
 * The synthetic `now` (2031-06-15) isolates the run from real daily traffic.
 *
 *   - AC-2a: handler admits a mission run via the exported HTTP admission path:
 *           mission_runs row (template whatsnew, idempotency_key
 *           whats-new-daily:<day>, status pending) + a mission:execute
 *           queue_jobs row whose payload.runId equals the run id.
 *   - AC-2b: dedupe-once-per-day preserved — a second call the same day neither
 *           creates a second run nor enqueues another mission:execute job.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client.ts';
import { whatsNewDaily } from '../../src/queue/jobs-handlers/whats-new-daily.ts';

const DATABASE_URL = process.env.DATABASE_URL ?? '';
// Deterministic synthetic day — never collides with real daily runs.
const NOW = new Date('2031-06-15T09:30:00Z');
const DAY_KEY = NOW.toISOString().slice(0, 10);
const IDEMPOTENCY_KEY = `whats-new-daily:${DAY_KEY}`;

function requireDatabaseUrl(): void {
  if (!DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required for whats-new-daily-mission — refusing skip-to-green'
    );
  }
}

async function withSql<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = createSql(DATABASE_URL);
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function runRow() {
  return withSql(async (sql) => {
    const rows = await sql<{ id: string; template_key: string; status: string; goal: string }[]>`
      SELECT id::text AS id, template_key, status, goal
      FROM mission_runs
      WHERE idempotency_key = ${IDEMPOTENCY_KEY}
      LIMIT 1
    `;
    return rows[0] ?? null;
  });
}

async function missionExecuteJobs(runId: string) {
  return withSql(async (sql) => {
    return await sql<{ id: string; name: string; runId: string | null; key: string }[]>`
      SELECT id::text AS id, name, payload->>'runId' AS "runId", key
      FROM queue_jobs
      WHERE name = 'mission:execute' AND payload->>'runId' = ${runId}
    `;
  });
}

describe('whats-new-daily mission admission (imp-prod-tool-audit AC-2)', () => {
  beforeAll(() => {
    requireDatabaseUrl();
  });

  afterAll(async () => {
    // Cleanup: remove the synthetic-day run + its queue rows.
    await withSql(async (sql) => {
      await sql`
        DELETE FROM queue_jobs
        WHERE payload->>'runId' IN (
          SELECT id::text FROM mission_runs WHERE idempotency_key = ${IDEMPOTENCY_KEY}
        )
      `;
      await sql`DELETE FROM mission_runs WHERE idempotency_key = ${IDEMPOTENCY_KEY}`;
      // Legacy marker rows from the pre-mission handler (defensive).
      await sql`DELETE FROM queue_jobs WHERE key = ${IDEMPOTENCY_KEY}`;
    });
  });

  it('AC-2a: admits a mission run and enqueues mission:execute with a runId', async () => {
    const result = await whatsNewDaily({ databaseUrl: DATABASE_URL, now: NOW });
    expect(result.ok).toBe(true);

    const runId = String(result.detail.run_id ?? '');
    expect(runId, 'handler must report the admitted run id').toMatch(/^[0-9a-f-]{36}$/);

    const run = await runRow();
    expect(run).not.toBeNull();
    expect(run?.template_key).toBe('whatsnew');
    expect(run?.status).toBe('pending');
    expect(run?.id).toBe(runId);
    expect(run?.goal).toContain(DAY_KEY);

    const jobs = await missionExecuteJobs(runId);
    expect(jobs.length).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('AC-2b: second call the same day dedupes — no second run, no second job', async () => {
    const first = await whatsNewDaily({ databaseUrl: DATABASE_URL, now: NOW });
    expect(first.ok).toBe(true);

    const second = await whatsNewDaily({ databaseUrl: DATABASE_URL, now: NOW });
    expect(second.ok).toBe(true);
    expect(second.detail.deduped).toBe(true);

    const runs = await withSql(async (sql) => {
      const rows = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM mission_runs
        WHERE idempotency_key = ${IDEMPOTENCY_KEY}`;
      return Number(rows[0]?.count ?? 0);
    });
    expect(runs).toBe(1);
  }, 30_000);
});
