/**
 * Composed library harness (HUMAN-TESTING-GATE-VERIFICATION.md sanctioned) — NOT a test runner.
 *
 * Drives the REAL production priority module (services/platform/src/queue/priority.ts) against
 * REAL Postgres for SPRINT.md Human Testing Gate step 5:
 *   load a background mission → load an interactive chat job → dequeue.
 *   MUST observe: interactive dequeues first.
 *
 * The STEP is recorded wiring_gap (production-invocation-not-documented) — no `holo` operator CLI
 * exists for enqueue/dequeue; only the library API. See GATE-RESULTS.md.
 *
 * Usage: bun drive-priority.ts
 */
import {
  enqueue,
  dequeue,
  resetPriorityLanes,
} from '../../../../../../../services/platform/src/queue/priority';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';

await resetPriorityLanes(DATABASE_URL);

// Load background mission FIRST (so a broken unordered queue would return it first).
const bg = await enqueue({
  name: 'background-mission',
  lane: 'background',
  payload: { kind: 'mission', id: 'bg-1' },
  databaseUrl: DATABASE_URL,
});
// Then load the interactive chat job.
const interactive = await enqueue({
  name: 'interactive-chat',
  lane: 'interactive',
  payload: { kind: 'chat', id: 'int-1' },
  databaseUrl: DATABASE_URL,
});

const first = await dequeue(DATABASE_URL);
const second = await dequeue(DATABASE_URL);

const order = [first?.lane ?? null, second?.lane ?? null];
const interactive_first = first?.lane === 'interactive' && second?.lane === 'background';

const payload = {
  driver: 'drive-priority',
  database_url: DATABASE_URL,
  seeded: { background: bg, interactive },
  dequeue_order: order,
  first_dequeue: first,
  second_dequeue: second,
  interactive_first,
  contract: 'dequeue_order[0] === "interactive"',
};
console.log(JSON.stringify(payload, null, 2));
process.exit(interactive_first ? 0 : 1);
