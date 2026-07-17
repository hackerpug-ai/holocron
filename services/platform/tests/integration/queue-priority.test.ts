/**
 * AC-1 / TC-1: interactive dequeues before background (live Postgres leased queue).
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *     pnpm vitest run services/platform/tests/integration/queue-priority.test.ts
 */
import { beforeAll, describe, expect, it } from 'vitest';

const PLATFORM_IT = Boolean(process.env.PLATFORM_IT);
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';
const itLive = PLATFORM_IT ? it : it.skip;

describe('AC-1: priority lanes — interactive before background', () => {
  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    // Ensure migrations / schema exist via module ensure path.
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
    'mixed queue: dequeue_order[0] === "interactive" with priority + fence_token',
    async () => {
      const {
        enqueue,
        dequeue,
        resetPriorityLanes,
      } = await import('../../src/queue/priority.ts');

      await resetPriorityLanes(DATABASE_URL);

      const background = await enqueue({
        name: 'background-mission-seed',
        lane: 'background',
        payload: { kind: 'standing' },
        databaseUrl: DATABASE_URL,
      });
      const interactive = await enqueue({
        name: 'interactive-chat-seed',
        lane: 'interactive',
        payload: { kind: 'chat' },
        databaseUrl: DATABASE_URL,
      });

      expect(background.lane).toBe('background');
      expect(interactive.lane).toBe('interactive');
      expect(interactive.priority).toBe(100);
      expect(background.priority).toBe(10);

      const first = await dequeue(DATABASE_URL);
      const second = await dequeue(DATABASE_URL);

      expect(first, 'must dequeue first job').not.toBeNull();
      expect(first!.lane, 'interactive must win first lease').toBe('interactive');
      expect(first!.priority, 'lease records priority=100').toBe(100);
      expect(first!.fence_token, 'lease records fence_token').toBeTruthy();
      expect(typeof first!.fence_token).toBe('string');
      expect(first!.fence_token!.length).toBeGreaterThan(0);

      expect(second, 'must dequeue second job').not.toBeNull();
      expect(second!.lane).toBe('background');
      expect(second!.priority).toBe(10);
      expect(second!.fence_token).toBeTruthy();
    },
    30_000
  );
});
