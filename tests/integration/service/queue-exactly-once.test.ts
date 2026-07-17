/**
 * queue-2 / AC-1 / TC-1..TC-3 — exactly-once observable effects across kill-9.
 *
 * Proves against real Postgres that a SIGKILL at each queue boundary
 * (commit / dispatch / ack), followed by a replay of the SAME idempotency key,
 * leaves exactly ONE observable side effect and ONE outbox/inbox dedupe
 * record — never zero and never two.
 *
 * The crash is modelled by aborting the real Postgres transaction at the named
 * boundary (sql.begin throws → rollback), which is exactly what kill-9 does to
 * uncommitted work. This is NOT a stub: the negative control (stub always
 * returns success without rows) fails because every assertion reads real row
 * counts from Postgres.
 *
 * The platform module is loaded via pathToFileURL (opaque to tsgo) so the
 * platform's `.ts` import extensions are not pulled into the root tsconfig
 * graph — same pattern as tests/integration/service/RED/queue-red-harness.ts.
 *
 * Run (all boundaries):
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *     pnpm vitest run tests/integration/service/queue-exactly-once.test.ts
 *
 * Run a single boundary (TC-2 / TC-3):
 *   ... pnpm vitest run tests/integration/service/queue-exactly-once.test.ts --boundary=after-commit
 *   ... pnpm vitest run tests/integration/service/queue-exactly-once.test.ts --boundary=after-dispatch
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const PLATFORM_IT = Boolean(process.env.PLATFORM_IT);
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';
const itLive = PLATFORM_IT ? it : it.skip;

type Boundary = 'before-commit' | 'after-commit-before-dispatch' | 'after-dispatch-before-ack';

const ALL_BOUNDARIES: Boundary[] = [
  'before-commit',
  'after-commit-before-dispatch',
  'after-dispatch-before-ack',
];

// TC-2/TC-3 pass --boundary=<x>; vitest ignores unknown flags, so read argv.
const boundaryArg = (process.argv.find((a) => a.startsWith('--boundary=')) ?? '').split('=')[1] as
  | Boundary
  | undefined;
const SELECTED: Boundary[] = boundaryArg ? [boundaryArg] : ALL_BOUNDARIES;

const NAME = 'durable-effect';
const PAYLOAD = { n: 1, kind: 'seeded-effect' } as const;

function keyFor(b: Boundary): string {
  return `effect-kill9-${b}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
}

// Loose module shape (avoids a static `typeof import('...ts')` that would pull
// the platform file into the root tsconfig graph — same approach as the RED
// harness, which loads via pathToFileURL and types loosely).
type DurableModule = {
  beginEffect: (opts: {
    key: string;
    name: string;
    payload?: Record<string, unknown>;
    databaseUrl?: string;
    crashAt?: 'before-commit' | 'after-commit-before-dispatch' | 'after-dispatch-before-ack' | null;
  }) => Promise<unknown>;
  dispatchAndAck: (opts: {
    key: string;
    databaseUrl?: string;
    crashAt?: 'before-commit' | 'after-commit-before-dispatch' | 'after-dispatch-before-ack' | null;
  }) => Promise<{ deduped: boolean }>;
  auditEffect: (opts: { key: string; databaseUrl?: string }) => Promise<{
    counts: { effects: number; outbox: number; inbox: number };
    fenceToken: string | null;
    outbox: { status: string | null };
    inbox: { outcome: string | null };
  }>;
  resetDurable: (opts: { key: string; databaseUrl?: string }) => Promise<void>;
};

async function loadDurable(): Promise<DurableModule> {
  const abs = resolve(
    process.env.HOLO_ROOT ?? process.cwd(),
    'services/platform/src/queue/durable-effect.ts'
  );
  return (await import(pathToFileURL(abs).href)) as DurableModule;
}

/** Map the test's boundary name to the module's crashAt, then run one pass. */
async function attemptWithCrash(b: Boundary, key: string): Promise<void> {
  const m = await loadDurable();
  if (b === 'before-commit') {
    await m.beginEffect({
      key,
      name: NAME,
      payload: { ...PAYLOAD },
      databaseUrl: DATABASE_URL,
      crashAt: 'before-commit',
    });
    return;
  }
  await m.beginEffect({ key, name: NAME, payload: { ...PAYLOAD }, databaseUrl: DATABASE_URL });
  if (b === 'after-dispatch-before-ack') {
    await m.dispatchAndAck({
      key,
      databaseUrl: DATABASE_URL,
      crashAt: 'after-dispatch-before-ack',
    });
  }
  // 'after-commit-before-dispatch': dispatch never happens.
}

async function replay(key: string): Promise<void> {
  const m = await loadDurable();
  await m.beginEffect({ key, name: NAME, payload: { ...PAYLOAD }, databaseUrl: DATABASE_URL });
  await m.dispatchAndAck({ key, databaseUrl: DATABASE_URL });
}

describe('AC-1: exactly-once observable effects survive kill-9 at every boundary', () => {
  for (const b of SELECTED) {
    itLive(
      `kill-9 at ${b} + replay → exactly one effect, one outbox, one inbox, fence_token set`,
      async () => {
        const m = await loadDurable();
        const key = keyFor(b);

        await m.resetDurable({ key, databaseUrl: DATABASE_URL });
        await attemptWithCrash(b, key);
        await replay(key);

        const audit = await m.auditEffect({ key, databaseUrl: DATABASE_URL });

        // MUST observe: exactly one of each, fence_token non-empty.
        expect(audit.counts.effects, `[${b}] effect_count === 1`).toBe(1);
        expect(audit.counts.outbox, `[${b}] outbox_count === 1`).toBe(1);
        expect(audit.counts.inbox, `[${b}] inbox_dedupe_count === 1`).toBe(1);
        expect(audit.fenceToken, `[${b}] fence_token is non-empty`).toBeTruthy();
        expect(typeof audit.fenceToken).toBe('string');
        expect(audit.fenceToken!.length).toBeGreaterThan(0);

        // MUST NOT observe: zero or two effects.
        expect(audit.counts.effects, `[${b}] must NOT be zero`).not.toBe(0);
        expect(audit.counts.effects, `[${b}] must NOT be two`).not.toBe(2);

        expect(audit.outbox.status, `[${b}] outbox acked`).toBe('acked');
        expect(audit.inbox.outcome, `[${b}] inbox outcome present`).toMatch(/^(applied|deduped)$/);
      },
      30_000
    );
  }

  itLive(
    'duplicate ack after success is deduped — still exactly one (proves the UNIQUE guard)',
    async () => {
      const m = await loadDurable();
      const key = `effect-dedupe-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
      await m.resetDurable({ key, databaseUrl: DATABASE_URL });

      await m.beginEffect({ key, name: NAME, payload: { ...PAYLOAD }, databaseUrl: DATABASE_URL });
      await m.dispatchAndAck({ key, databaseUrl: DATABASE_URL });
      const second = await m.dispatchAndAck({ key, databaseUrl: DATABASE_URL });
      expect(second.deduped, 'second ack is deduped').toBe(true);

      const audit = await m.auditEffect({ key, databaseUrl: DATABASE_URL });
      expect(audit.counts.effects, 'still exactly one effect').toBe(1);
      expect(audit.counts.inbox, 'still exactly one inbox row').toBe(1);
      expect(audit.fenceToken).toBeTruthy();
    },
    30_000
  );
});
