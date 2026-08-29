/**
 * S31-03 AC-1 / AC-2 — monotonic fence tokens + stale-holder refusal.
 *
 * Real Postgres + real holo CLI. No mocks of Postgres or the CLI dispatcher.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     pnpm vitest run packages/platform/tests/integration/sprint31-fence-monotonic.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  PLATFORM_IT,
  REPO_ROOT,
} from '../../../../tests/integration/service/harness';
import {
  beginEffect,
  compareFenceTokens,
  dispatchAndAck,
  isStaleFenceTokenError,
  resetDurable,
  StaleFenceTokenError,
} from '../../src/queue/durable-effect.ts';

if (!PLATFORM_IT) {
  throw new Error('sprint31-fence-monotonic requires PLATFORM_IT=1 (real Postgres)');
}

const BUN_BIN = process.env.BUN_BIN ?? 'bun';
const HOLO_CLI = resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts');
const DATABASE_URL = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-03');
const UUID_FENCE_RE = /^fence-[0-9a-f-]{36}$/i;

const itLive = PLATFORM_IT ? it : it.skip;

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resolve(EVIDENCE_DIR, name),
    typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`,
    'utf8'
  );
}

function runHolo(
  args: string[],
  opts?: { env?: Record<string, string | undefined> }
): {
  status: number | null;
  stdout: string;
  stderr: string;
  parsed: Record<string, unknown> | null;
} {
  const result = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL,
      ...opts?.env,
    },
    timeout: 60_000,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  return { status: result.status, stdout, stderr, parsed };
}

type AuditShape = {
  outbox?: { fenceToken?: string | null };
  effect?: { fenceToken?: string | null };
  inbox?: { fenceToken?: string | null };
  counts?: { effects?: number; outbox?: number; inbox?: number };
  effect_count?: number;
};

function tokensOf(audit: AuditShape): {
  outbox: string | null | undefined;
  effect: string | null | undefined;
  inbox: string | null | undefined;
} {
  return {
    outbox: audit.outbox?.fenceToken,
    effect: audit.effect?.fenceToken,
    inbox: audit.inbox?.fenceToken,
  };
}

describe('S31-03 AC-1: one key, one monotonic token per lifecycle', () => {
  beforeAll(() => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
  });

  itLive(
    'oneKeyCarriesOneMonotonicToken',
    () => {
      const key = 'fence-mono-1';

      // Assert 0 effect rows BEFORE lifecycle 1.
      const reset0 = runHolo(['queue:reset', key, '--json']);
      expect(reset0.status, reset0.stderr).toBe(0);
      const pre = runHolo(['queue:audit', key, '--json']);
      writeEvidence('ac1-pre-audit.json', pre);
      expect((pre.parsed as AuditShape | null)?.effect_count ?? 0).toBe(0);

      // Lifecycle 1.
      const life1 = runHolo(['queue:effect', '--key', key, '--json']);
      expect(life1.status, life1.stderr + life1.stdout).toBe(0);
      writeEvidence('ac1-lifecycle1-effect.json', life1);
      const audit1 = runHolo(['queue:audit', key, '--json']);
      writeEvidence('ac1-lifecycle1-audit.json', audit1);
      expect(audit1.status, audit1.stderr).toBe(0);
      const a1 = audit1.parsed as AuditShape;
      const t1 = tokensOf(a1);
      expect(t1.outbox, 'lifecycle1 outbox token').toBeTruthy();
      expect(t1.effect, 'lifecycle1 effect token').toBeTruthy();
      expect(t1.inbox, 'lifecycle1 inbox token').toBeTruthy();
      expect(t1.outbox).toBe(t1.effect);
      expect(t1.effect).toBe(t1.inbox);
      expect(t1.outbox).not.toMatch(UUID_FENCE_RE);
      expect(a1.effect_count ?? a1.counts?.effects).toBe(1);

      // Reset + lifecycle 2.
      const reset1 = runHolo(['queue:reset', key, '--json']);
      expect(reset1.status, reset1.stderr).toBe(0);
      const life2 = runHolo(['queue:effect', '--key', key, '--json']);
      expect(life2.status, life2.stderr + life2.stdout).toBe(0);
      writeEvidence('ac1-lifecycle2-effect.json', life2);
      const audit2 = runHolo(['queue:audit', key, '--json']);
      writeEvidence('ac1-lifecycle2-audit.json', audit2);
      expect(audit2.status, audit2.stderr).toBe(0);
      const a2 = audit2.parsed as AuditShape;
      const t2 = tokensOf(a2);
      expect(t2.outbox).toBeTruthy();
      expect(t2.effect).toBeTruthy();
      expect(t2.inbox).toBeTruthy();
      expect(t2.outbox).toBe(t2.effect);
      expect(t2.effect).toBe(t2.inbox);
      expect(t2.outbox).not.toMatch(UUID_FENCE_RE);
      expect(a2.effect_count ?? a2.counts?.effects).toBe(1);

      // T2 strictly greater than T1 under declared BigInt ordering.
      const token1 = t1.outbox ?? '';
      const token2 = t2.outbox ?? '';
      expect(token1.length > 0 && token2.length > 0).toBe(true);
      expect(compareFenceTokens(token2, token1), `T2 (${token2}) must be > T1 (${token1})`).toBe(1);

      writeEvidence('ac1-token-compare.json', {
        t1: token1,
        t2: token2,
        compare: compareFenceTokens(token2, token1),
      });
    },
    60_000
  );
});

describe('S31-03 AC-2: superseded holder is refused', () => {
  afterAll(async () => {
    await resetDurable({ key: 'fence-stale-1', databaseUrl: DATABASE_URL }).catch(() => {});
  });

  itLive(
    'staleHolderIsRefused',
    async () => {
      const key = 'fence-stale-1';
      await resetDurable({ key, databaseUrl: DATABASE_URL });

      // Capture T1 from real allocation (consumer A holds this).
      const begun1 = await beginEffect({
        key,
        name: 'stale-holder-probe',
        payload: { n: 1 },
        databaseUrl: DATABASE_URL,
      });
      const t1 = begun1.fenceToken;
      expect(t1, 'T1 allocated').toBeTruthy();
      if (!t1) throw new Error('T1 missing');

      // Complete lifecycle 1 so effect carries T1, then advance to T2 via
      // reset + full second lifecycle (persisted token becomes T2).
      await dispatchAndAck({ key, databaseUrl: DATABASE_URL, name: 'stale-holder-probe' });
      await resetDurable({ key, databaseUrl: DATABASE_URL });

      const begun2 = await beginEffect({
        key,
        name: 'stale-holder-probe',
        payload: { n: 2 },
        databaseUrl: DATABASE_URL,
      });
      const t2 = begun2.fenceToken;
      expect(t2, 'T2 allocated').toBeTruthy();
      if (!t2) throw new Error('T2 missing');
      expect(compareFenceTokens(t2, t1), 'T2 > T1').toBe(1);

      // Complete lifecycle 2 → effect row carries T2.
      await dispatchAndAck({ key, databaseUrl: DATABASE_URL, name: 'stale-holder-probe' });

      // Consumer A applies presenting T1 → STALE_FENCE_TOKEN.
      let caught: unknown = null;
      try {
        await dispatchAndAck({
          key,
          databaseUrl: DATABASE_URL,
          name: 'stale-holder-probe',
          presentedFenceToken: t1,
        });
      } catch (err) {
        caught = err;
      }

      expect(caught, 'must raise STALE_FENCE_TOKEN').toBeTruthy();
      expect(isStaleFenceTokenError(caught)).toBe(true);
      expect(caught).toBeInstanceOf(StaleFenceTokenError);
      const stale = caught as StaleFenceTokenError;
      expect(stale.code).toBe('STALE_FENCE_TOKEN');
      expect(stale.presentedToken).toBe(t1);
      expect(stale.currentToken).toBe(t2);

      // queue_effects still holds exactly 1 row carrying T2.
      const audit = runHolo(['queue:audit', key, '--json']);
      writeEvidence('ac2-stale-audit.json', {
        t1,
        t2,
        error: {
          code: stale.code,
          presentedToken: stale.presentedToken,
          currentToken: stale.currentToken,
          message: stale.message,
        },
        audit: audit.parsed,
      });
      const a = audit.parsed as AuditShape;
      expect(a.effect_count ?? a.counts?.effects).toBe(1);
      expect(a.effect?.fenceToken).toBe(t2);
    },
    60_000
  );
});
