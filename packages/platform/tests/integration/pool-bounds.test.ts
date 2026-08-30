/**
 * obs-pool — bounded per-handler Postgres connection usage (goal
 * mtfxh0ho-aveqis step 5).
 *
 * The audit found 16 migrated job handlers each opening `createSql` pools of
 * max 10 against production `max_connections=100`; bursts fail with
 * "sorry, too many clients already" (queue_jobs last_error, 2026-08-28).
 *
 * Contract:
 *   - createSql default max is env-tunable (HOLO_DB_POOL_MAX) and LOWERED to 3
 *   - explicit options.max still wins
 *   - withDbRetry retries postgres "too many clients" (53300) failures with
 *     bounded exponential backoff and rethrows non-retryable errors untouched
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createSql, withDbRetry } from '../../src/db/client';

const created: Array<{ end: () => Promise<void> }> = [];

afterAll(async () => {
  for (const sql of created.splice(0)) {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
});

function makeSqlForMaxAssertions() {
  const sql = createSql('postgres://localhost:5432/holocron_pool_probe');
  created.push(sql);
  return sql;
}

describe('createSql pool bounds', () => {
  it('defaults max to the bounded 3 (down from 10)', () => {
    delete process.env.HOLO_DB_POOL_MAX;
    const sql = makeSqlForMaxAssertions();
    expect(sql.options.max).toBe(3);
  });

  it('honors HOLO_DB_POOL_MAX when set', () => {
    process.env.HOLO_DB_POOL_MAX = '7';
    try {
      const sql = makeSqlForMaxAssertions();
      expect(sql.options.max).toBe(7);
    } finally {
      delete process.env.HOLO_DB_POOL_MAX;
    }
  });

  it('explicit options.max still wins over the env default', () => {
    process.env.HOLO_DB_POOL_MAX = '7';
    try {
      const sql = createSql('postgres://localhost:5432/holocron_pool_probe', { max: 2 });
      created.push(sql);
      expect(sql.options.max).toBe(2);
    } finally {
      delete process.env.HOLO_DB_POOL_MAX;
    }
  });
});

describe('withDbRetry — bounded backoff on pool exhaustion', () => {
  it('retries a "too many clients" failure and succeeds within attempts', async () => {
    let attempts = 0;
    const result = await withDbRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          const err = new Error('sorry, too many clients already') as Error & { code?: string };
          err.code = '53300';
          throw err;
        }
        return 'ok';
      },
      { attempts: 5, baseDelayMs: 1 },
    );
    expect(attempts).toBe(3);
    expect(result).toBe('ok');
  });

  it('rethrows the error once attempts are exhausted (fail closed, never silent)', async () => {
    let attempts = 0;
    await expect(
      withDbRetry(
        async () => {
          attempts += 1;
          const err = new Error('sorry, too many clients already') as Error & { code?: string };
          err.code = '53300';
          throw err;
        },
        { attempts: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow('too many clients');
    expect(attempts).toBe(3);
  });

  it('does NOT retry non-exhaustion errors — rethrown on first occurrence', async () => {
    let attempts = 0;
    await expect(
      withDbRetry(
        async () => {
          attempts += 1;
          throw new Error('relation "x" does not exist');
        },
        { attempts: 5, baseDelayMs: 1 },
      ),
    ).rejects.toThrow('does not exist');
    expect(attempts).toBe(1);
  });
});
