/**
 * queue-4 / AC-4 / TC-4:
 *
 * GIVEN a poison job seed exists with bounded retries (max_attempts=3)
 * WHEN the RED suite forces retries past the cap
 * THEN the job lands in the dead-letter path and is not silently dropped
 *      (dlq_count === 1, job.status === "dead_letter")
 *
 * RED against current mainline:
 * - DLQ module missing (services/platform/src/queue/dlq)
 * - no dead_letter / queue_dlq tables
 * - process-local queue has no retry/backoff/DLQ path
 *
 * NEGATIVE CONTROL (would fail if):
 * - stub always succeeds
 * - empty DLQ accepted
 * - mock dead letter
 * - silent drop (no row, no terminal status)
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *     pnpm vitest run tests/integration/service/RED/queue-dlq.RED.test.ts
 */
import { beforeAll, describe, expect } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  itLive,
  loadDlqApi,
  readDlqState,
  withQueueLock,
  writeQueueRedArtifact,
} from './queue-red-harness';

const POISON_KEY = 'red-poison-1';
const MAX_ATTEMPTS = 3;

describe('AC-4 / TC-4: poison job lands in DLQ (dead_letter)', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('poison past retries: dlq_count === 1 and job.status === "dead_letter"', async () => {
    await withQueueLock(async () => {
      let loadError: string | null = null;
      let runResult: {
        status: string;
        attempts: number;
        dlq_count: number;
      } | null = null;

      try {
        const api = await loadDlqApi();
        if (api.resetDlq) {
          await api.resetDlq(DEFAULT_DATABASE_URL);
        }
        await api.seedPoisonJob({
          key: POISON_KEY,
          maxAttempts: MAX_ATTEMPTS,
          databaseUrl: DEFAULT_DATABASE_URL,
        });
        runResult = await api.runUntilTerminal({
          key: POISON_KEY,
          databaseUrl: DEFAULT_DATABASE_URL,
        });
      } catch (err) {
        loadError = err instanceof Error ? err.message : String(err);
      }

      const { createSql } = await import('../../../../services/platform/src/db/client');
      const sql = createSql(DEFAULT_DATABASE_URL);
      let dbState: Awaited<ReturnType<typeof readDlqState>>;
      try {
        dbState = await readDlqState(sql, POISON_KEY);
      } finally {
        await sql.end({ timeout: 5 });
      }

      const dlq_count = runResult?.dlq_count ?? dbState.dlq_count;
      const job_status = runResult?.status ?? dbState.job_status;

      writeQueueRedArtifact('AC-4-dlq-poison.json', {
        ac: 'AC-4',
        tc: 'TC-4',
        key: POISON_KEY,
        max_attempts: MAX_ATTEMPTS,
        loadError,
        runResult,
        dbState,
        dlq_count,
        job_status,
        must_observe: {
          'DLQ API loads': loadError === null,
          'dlq_count === 1': dlq_count === 1,
          'job.status === "dead_letter"': job_status === 'dead_letter',
        },
        must_not_observe: {
          'silent drop (dlq_count === 0)': dlq_count === 0,
          'unbounded retry (no terminal status)': job_status === null || job_status === 'pending',
        },
      });

      expect(dlq_count, `dlq_count === 1 (loadError=${loadError})`).toBe(1);
      expect(job_status, 'job.status === "dead_letter"').toBe('dead_letter');
      expect(dlq_count, 'must not silently drop poison job').toBeGreaterThan(0);
      expect(loadError, `DLQ API must load (queue-1): ${loadError}`).toBeNull();
    });
  });
});
