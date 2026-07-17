/**
 * AC-2 / TC-2: poison job exhausts retries and lands in DLQ (live Postgres).
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *     pnpm vitest run services/platform/tests/integration/queue-dlq.test.ts
 */
import { beforeAll, describe, expect, it } from 'vitest';

const PLATFORM_IT = Boolean(process.env.PLATFORM_IT);
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';
const itLive = PLATFORM_IT ? it : it.skip;

const POISON_KEY = 'it-poison-1';
const MAX_ATTEMPTS = 3;

describe('AC-2: retry/backoff reaches DLQ', () => {
  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    const { ensureQueueSchema } = await import('../../src/queue/schema.ts');
    const { createSql } = await import('../../src/db/client.ts');
    const sql = createSql(DATABASE_URL);
    try {
      await ensureQueueSchema(sql);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  itLive(
    'poison past retries: dlq_count === 1 and job.status === "dead_letter"',
    async () => {
      const { seedPoisonJob, runUntilTerminal, resetDlq, getJob } = await import(
        '../../src/queue/dlq.ts'
      );

      await resetDlq(DATABASE_URL);
      await seedPoisonJob({
        key: POISON_KEY,
        maxAttempts: MAX_ATTEMPTS,
        databaseUrl: DATABASE_URL,
      });

      const result = await runUntilTerminal({
        key: POISON_KEY,
        databaseUrl: DATABASE_URL,
      });

      expect(result.status, 'terminal status is dead_letter').toBe('dead_letter');
      expect(result.dlq_count, 'dlq_count === 1').toBe(1);
      expect(result.attempts, 'attempts >= max_attempts').toBeGreaterThanOrEqual(MAX_ATTEMPTS);

      const job = await getJob(POISON_KEY, DATABASE_URL);
      expect(job, 'job row must exist (no silent drop)').not.toBeNull();
      expect(job!.status).toBe('dead_letter');
      expect(job!.attempts).toBeGreaterThanOrEqual(MAX_ATTEMPTS);

      // Prove DLQ table row in real Postgres
      const { createSql } = await import('../../src/db/client.ts');
      const sql = createSql(DATABASE_URL);
      try {
        const rows = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count FROM queue_dlq WHERE key = ${POISON_KEY}
        `;
        expect(Number(rows[0]?.count ?? 0)).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
    60_000
  );
});
