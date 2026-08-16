/**
 * Queue backend lifecycle — real Postgres regression for scheduler heartbeats.
 *
 * Repeated readiness heartbeats must reuse the process-owned pg-boss instance.
 * Creating a new instance every 30 seconds leaks Postgres sessions until the
 * cluster refuses new work.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createSql } from '../../src/db/client.ts';
import { startQueueBackend, stopQueueBackend } from '../../src/queue/backend.ts';

const DATABASE_URL = process.env.DATABASE_URL;

async function pgBossConnectionCount(): Promise<number> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
  const sql = createSql(DATABASE_URL);
  try {
    const rows = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND application_name = 'holocron-pg-boss'
    `;
    return rows[0]?.count ?? 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

describe('queue backend heartbeat lifecycle (real Postgres)', () => {
  afterAll(async () => {
    await stopQueueBackend();
  });

  it('reuses one pg-boss instance across repeated and concurrent starts', async () => {
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

    const baseline = await pgBossConnectionCount();
    const first = await startQueueBackend(DATABASE_URL);
    expect(first.ready, first.error ?? first.detail).toBe(true);
    const afterFirst = await pgBossConnectionCount();
    expect(afterFirst).toBeGreaterThan(baseline);

    const second = await startQueueBackend(DATABASE_URL);
    expect(second.ready, second.error ?? second.detail).toBe(true);
    const afterSecond = await pgBossConnectionCount();
    expect(afterSecond).toBe(afterFirst);

    const concurrent = await Promise.all([
      startQueueBackend(DATABASE_URL),
      startQueueBackend(DATABASE_URL),
      startQueueBackend(DATABASE_URL),
    ]);
    expect(concurrent.every((result) => result.ready)).toBe(true);
    expect(await pgBossConnectionCount()).toBe(afterFirst);
  });
});
