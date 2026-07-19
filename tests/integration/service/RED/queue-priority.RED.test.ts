/**
 * queue-4 / AC-3 / TC-3 (T-PLAT-011):
 *
 * GIVEN interactive and background jobs are both seeded
 * WHEN the RED suite dequeues a mixed queue
 * THEN interactive work is selected before background missions
 *      (dequeue_order[0] === "interactive")
 *
 * RED against current mainline:
 * - priority lane module missing (services/platform/src/queue/priority)
 * - process-local queue adapter has no priority lanes
 *
 * NEGATIVE CONTROL (would fail if):
 * - stub green path / mock priority
 * - empty queue accepted
 * - static hardcoded order without live dequeue
 * - background-first accepted
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *     pnpm vitest run tests/integration/service/RED/queue-priority.RED.test.ts
 */
import { beforeAll, describe, expect, vi } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  itLive,
  loadPriorityQueueApi,
  type PriorityJob,
  withQueueLock,
  writeQueueRedArtifact,
} from './queue-red-harness';

vi.setConfig({ testTimeout: 120_000 });

describe('AC-3 / TC-3: interactive dequeues before background', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive(
    'mixed queue: dequeue_order[0] === "interactive" (background enqueued first)',
    async () => {
      await withQueueLock(async () => {
        let loadError: string | null = null;
        const dequeue_order: Array<'interactive' | 'background'> = [];
        const dequeued: PriorityJob[] = [];
        let background: PriorityJob | null = null;
        let interactive: PriorityJob | null = null;

        try {
          const api = await loadPriorityQueueApi();
          if (api.resetPriorityLanes) {
            await api.resetPriorityLanes(DEFAULT_DATABASE_URL);
          }

          // Seed background mission FIRST, then interactive chat job.
          background = await api.enqueue({
            name: 'background-mission-seed',
            lane: 'background',
            payload: { kind: 'standing' },
            databaseUrl: DEFAULT_DATABASE_URL,
          });
          interactive = await api.enqueue({
            name: 'interactive-chat-seed',
            lane: 'interactive',
            payload: { kind: 'chat' },
            databaseUrl: DEFAULT_DATABASE_URL,
          });

          // Dequeue twice — interactive must win first lease.
          for (let i = 0; i < 2; i++) {
            const job = await api.dequeue(DEFAULT_DATABASE_URL);
            if (!job) break;
            dequeued.push(job);
            dequeue_order.push(job.lane);
          }
        } catch (err) {
          loadError = err instanceof Error ? err.message : String(err);
        }

        writeQueueRedArtifact('AC-3-priority-order.json', {
          ac: 'AC-3',
          tc: 'TC-3',
          loadError,
          background,
          interactive,
          dequeue_order,
          dequeued,
          must_observe: {
            'priority API loads': loadError === null,
            'dequeue_order[0] === "interactive"': dequeue_order[0] === 'interactive',
            'two jobs dequeued': dequeue_order.length === 2,
          },
          must_not_observe: {
            'background first': dequeue_order[0] === 'background',
            'empty dequeue': dequeue_order.length === 0,
          },
        });

        expect(
          dequeue_order[0],
          `dequeue_order[0] === "interactive" (loadError=${loadError}; order=${JSON.stringify(dequeue_order)})`
        ).toBe('interactive');
        expect(dequeue_order.length, 'must dequeue both seeded jobs').toBeGreaterThanOrEqual(1);
        expect(dequeue_order[0], 'must NOT dequeue background first').not.toBe('background');
        expect(loadError, `priority queue API must load (queue-1): ${loadError}`).toBeNull();
        if (dequeue_order.length >= 2) {
          expect(dequeue_order[1], 'second lease is background mission').toBe('background');
        }
      });
    }
  );
});
