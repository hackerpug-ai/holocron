/**
 * queue-3 / AC-3 / TC-3 (T-PLAT-011) — interactive work dequeues before
 * background work when the 16 migrated jobs are loaded with lane metadata.
 *
 * Seeds a mixed priority load drawn from the migrated job registry and proves
 * against real Postgres that the leased queue (queue-1) serves interactive
 * jobs before background missions.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *     pnpm vitest run tests/integration/service/jobs-priority.test.ts
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const PLATFORM_IT = Boolean(process.env.PLATFORM_IT);
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';
const itLive = PLATFORM_IT ? it : it.skip;

type PriorityModule = {
  enqueue: (j: {
    name: string;
    lane: 'interactive' | 'background';
    payload?: Record<string, unknown>;
    databaseUrl?: string;
    key?: string;
  }) => Promise<{ lane: 'interactive' | 'background'; priority: number }>;
  dequeue: (databaseUrl?: string) => Promise<{
    lane: 'interactive' | 'background';
    priority: number;
    fence_token?: string;
  } | null>;
  resetPriorityLanes: (databaseUrl?: string) => Promise<void>;
};
type RegistryModule = {
  MIGRATED_JOBS: ReadonlyArray<{
    name: string;
    lane: 'interactive' | 'background';
    category: string;
  }>;
};

async function loadPriority(): Promise<PriorityModule> {
  const abs = resolve(
    process.env.HOLO_ROOT ?? process.cwd(),
    'services/platform/src/queue/priority.ts'
  );
  return (await import(pathToFileURL(abs).href)) as PriorityModule;
}
async function loadRegistry(): Promise<RegistryModule> {
  const abs = resolve(
    process.env.HOLO_ROOT ?? process.cwd(),
    'services/platform/src/queue/jobs-registry.ts'
  );
  return (await import(pathToFileURL(abs).href)) as RegistryModule;
}

describe('AC-3: migrated jobs — interactive dequeues before background', () => {
  itLive(
    'mixed_priority_load: dequeue_order[0] === "interactive" across the 16-job inventory',
    async () => {
      const priority = await loadPriority();
      const { MIGRATED_JOBS } = await loadRegistry();

      // Inventory must carry both lanes.
      const interactiveJobs = MIGRATED_JOBS.filter((j) => j.lane === 'interactive');
      const backgroundJobs = MIGRATED_JOBS.filter((j) => j.lane === 'background');
      expect(interactiveJobs.length, 'registry has interactive jobs').toBeGreaterThan(0);
      expect(backgroundJobs.length, 'registry has background jobs').toBeGreaterThan(0);
      expect(MIGRATED_JOBS.length, '16 migrated jobs').toBe(16);

      await priority.resetPriorityLanes(DATABASE_URL);

      // Seed background FIRST, then interactive — interactive must still win.
      const bg = backgroundJobs[0]!;
      const ix = interactiveJobs[0]!;
      await priority.enqueue({
        name: bg.name,
        lane: 'background',
        payload: { category: bg.category },
        databaseUrl: DATABASE_URL,
      });
      await priority.enqueue({
        name: ix.name,
        lane: 'interactive',
        payload: { category: ix.category },
        databaseUrl: DATABASE_URL,
      });

      const order: Array<'interactive' | 'background'> = [];
      for (let i = 0; i < 2; i++) {
        const job = await priority.dequeue(DATABASE_URL);
        if (!job) break;
        order.push(job.lane);
      }

      expect(order[0], 'interactive dequeues first').toBe('interactive');
      expect(order[1], 'background dequeues second').toBe('background');
      expect(order.length, 'both jobs dequeued').toBe(2);
    },
    30_000
  );
});
