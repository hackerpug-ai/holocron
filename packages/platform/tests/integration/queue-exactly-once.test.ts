/**
 * queue-2 / S31-03 — exactly-once observable effects (happy path + dedupe).
 *
 * Crash recovery is proven by real SIGKILL in sprint31-fence-kill9.test.ts.
 * This suite covers complete lifecycle + duplicate-ack dedupe without any
 * in-process crashAt injection (removed in S31-03).
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     pnpm vitest run packages/platform/tests/integration/queue-exactly-once.test.ts
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const PLATFORM_IT = Boolean(process.env.PLATFORM_IT);
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';
const itLive = PLATFORM_IT ? it : it.skip;

const NAME = 'durable-effect';
const PAYLOAD = { n: 1, kind: 'seeded-effect' } as const;

type DurableModule = {
  beginEffect: (opts: {
    key: string;
    name: string;
    payload?: Record<string, unknown>;
    databaseUrl?: string;
  }) => Promise<{ committed: boolean; fenceToken: string | null }>;
  dispatchAndAck: (opts: {
    key: string;
    databaseUrl?: string;
  }) => Promise<{ deduped: boolean; fenceToken: string | null }>;
  auditEffect: (opts: { key: string; databaseUrl?: string }) => Promise<{
    counts: { effects: number; outbox: number; inbox: number };
    fenceToken: string | null;
    outbox: { status: string | null; fenceToken: string | null };
    effect: { fenceToken: string | null };
    inbox: { outcome: string | null; fenceToken: string | null };
  }>;
  resetDurable: (opts: { key: string; databaseUrl?: string }) => Promise<void>;
};

async function loadDurable(): Promise<DurableModule> {
  const abs = resolve(
    process.env.HOLO_ROOT ?? process.cwd(),
    'packages/platform/src/queue/durable-effect.ts'
  );
  return (await import(pathToFileURL(abs).href)) as DurableModule;
}

describe('exactly-once observable effects (no crashAt)', () => {
  itLive(
    'full lifecycle → one effect, identical tokens across outbox/effect/inbox',
    async () => {
      const m = await loadDurable();
      const key = `effect-once-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
      await m.resetDurable({ key, databaseUrl: DATABASE_URL });

      await m.beginEffect({
        key,
        name: NAME,
        payload: { ...PAYLOAD },
        databaseUrl: DATABASE_URL,
      });
      await m.dispatchAndAck({ key, databaseUrl: DATABASE_URL });

      const audit = await m.auditEffect({ key, databaseUrl: DATABASE_URL });
      expect(audit.counts.effects).toBe(1);
      expect(audit.counts.outbox).toBe(1);
      expect(audit.counts.inbox).toBe(1);
      expect(audit.outbox.fenceToken).toBeTruthy();
      expect(audit.outbox.fenceToken).toBe(audit.effect.fenceToken);
      expect(audit.effect.fenceToken).toBe(audit.inbox.fenceToken);
      expect(audit.outbox.fenceToken).not.toMatch(/^fence-[0-9a-f-]{36}$/i);
      expect(audit.outbox.status).toBe('acked');
    },
    30_000
  );

  itLive(
    'duplicate ack after success is deduped — still exactly one',
    async () => {
      const m = await loadDurable();
      const key = `effect-dedupe-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
      await m.resetDurable({ key, databaseUrl: DATABASE_URL });

      await m.beginEffect({
        key,
        name: NAME,
        payload: { ...PAYLOAD },
        databaseUrl: DATABASE_URL,
      });
      await m.dispatchAndAck({ key, databaseUrl: DATABASE_URL });
      const second = await m.dispatchAndAck({ key, databaseUrl: DATABASE_URL });
      expect(second.deduped, 'second ack is deduped').toBe(true);

      const audit = await m.auditEffect({ key, databaseUrl: DATABASE_URL });
      expect(audit.counts.effects).toBe(1);
      expect(audit.counts.inbox).toBe(1);
      expect(audit.fenceToken).toBeTruthy();
    },
    30_000
  );
});
