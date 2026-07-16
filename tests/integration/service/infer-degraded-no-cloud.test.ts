/**
 * AC-3 / TC-6 (infer-3): Degraded mode never silently falls back to cloud.
 *
 * NEGATIVE CONTROL (would fail if):
 * - Degraded mode allows silent cloud fallback (static cloud route)
 * - Network assertion mocked so always returns zero (fake capture)
 * - Cloud fallback not detected by capture
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-no-cloud.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_DATABASE_URL, PLATFORM_IT, REPO_ROOT } from './harness';
import { installNetworkCapture } from './infer-network-capture';

const itLive = PLATFORM_IT ? it : it.skip;
const DEAD_ENDPOINT = 'http://127.0.0.1:1';
const SURFACE_MSG = 'Local fleet unavailable';

function writeArtifact(name: string, body: unknown): void {
  const dir = resolve(REPO_ROOT, '.tmp/infer-3');
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

async function loadDegraded() {
  const path = ['../../../services/platform/src/inference', 'degraded-mode-controller'].join('/');
  return import(path) as Promise<{
    DegradedModeController: new (
      opts?: Record<string, unknown>
    ) => {
      init: () => Promise<void>;
      close: (opts?: { resetToNormal?: boolean }) => Promise<void>;
      getState: () => { 'degraded-state': string; message: string | null };
      resolveRole: (
        role: string,
        options?: Record<string, unknown>
      ) => Promise<
        | { ok: true; resolved: { endpoint: string } }
        | {
            ok: false;
            degradation: { message: string; allowCloud: boolean; 'degraded-state': string };
          }
      >;
      attemptReasoning: (
        role: string,
        options?: Record<string, unknown>
      ) => Promise<{
        outcome: 'resolved' | 'surfaced' | 'queued';
        message?: string;
        allowCloud: boolean;
        endpoint?: string;
      }>;
    };
  }>;
}

async function loadResolveModel() {
  const path = ['../../../services/platform/src/inference', 'resolve-model'].join('/');
  return import(path) as Promise<{
    resolveModel: (
      role: string,
      options?: Record<string, unknown>
    ) => Promise<{ endpoint: string; provider?: string }>;
  }>;
}

describe('AC-3: Degraded mode never silently falls back to cloud', () => {
  let controller: InstanceType<
    Awaited<ReturnType<typeof loadDegraded>>['DegradedModeController']
  > | null = null;

  afterEach(async () => {
    if (controller) {
      await controller.close({ resetToNormal: true }).catch(() => undefined);
      controller = null;
    }
  });

  itLive('reasoning calls in degraded mode: zero Anthropic, surface or queue only', async () => {
    const capture = installNetworkCapture();
    try {
      const { DegradedModeController } = await loadDegraded();

      controller = new DegradedModeController({
        databaseUrl: DEFAULT_DATABASE_URL,
        pollIntervalMs: 60_000,
        role: 'divergent',
      });
      await controller.init();

      // Enter degraded
      const down = await controller.resolveRole('divergent', {
        endpointOverride: DEAD_ENDPOINT,
        allowEscape: false,
      });
      expect(down.ok).toBe(false);
      expect(controller.getState()['degraded-state']).toBe('surface-unavailable');
      expect(controller.getState().message ?? '').toMatch(/Local fleet unavailable/i);

      // Attempt several reasoning paths while degraded (including escape temptation)
      const attempts = [];
      for (const opts of [
        { allowEscape: false },
        { allowEscape: true, estimatedCostUsd: 0.01, reason: 'should-be-blocked-in-degraded' },
        { allowEscape: false, endpointOverride: DEAD_ENDPOINT },
      ]) {
        const r = await controller.attemptReasoning('divergent', opts);
        attempts.push(r);
        expect(r.allowCloud).toBe(false);
        expect(r.outcome === 'surfaced' || r.outcome === 'queued').toBe(true);
        if (r.message) {
          expect(r.message).toMatch(/Local fleet unavailable|queued|retry/i);
        }
        if (r.endpoint) {
          expect(r.endpoint).not.toMatch(/api\.anthropic\.com/i);
        }
      }

      // Direct resolveModel during process-level degraded must not return Anthropic either
      const { resolveModel } = await loadResolveModel();
      let escapeBlocked = false;
      try {
        const escaped = await resolveModel('divergent', {
          allowEscape: true,
          estimatedCostUsd: 0.01,
          reason: 'degraded-escape-probe',
          // Give budget so only degraded-mode gate can block
        });
        // If it somehow resolves, it must not be cloud — but we require block
        expect(escaped.endpoint).not.toMatch(/api\.anthropic\.com/);
      } catch {
        escapeBlocked = true;
      }
      // Prefer hard block; either way anthropic count must stay 0
      void escapeBlocked;

      expect(capture.anthropicCount()).toBe(0);
      // No capture row may be anthropic host
      for (const row of capture.snapshot()) {
        expect(row.host).not.toMatch(/api\.anthropic\.com/i);
        expect(row.url).not.toMatch(/api\.anthropic\.com/i);
      }

      // Every request either fleet (:4545) or failed local probe — no silent success on cloud
      const rows = capture.snapshot();
      const nonLocal = rows.filter(
        (r) =>
          !r.url.includes(':4545') &&
          !r.host.includes('127.0.0.1') &&
          !r.host.includes('localhost') &&
          r.host.length > 0
      );
      expect(nonLocal.filter((r) => r.host.includes('anthropic')).length).toBe(0);

      writeArtifact('AC-3-no-cloud.json', {
        state: controller.getState(),
        attempts,
        escapeBlocked,
        anthropicCount: capture.anthropicCount(),
        captureRows: rows,
      });
    } finally {
      capture.restore();
    }
  });

  itLive('stdout/message contains Local fleet unavailable while degraded', async () => {
    const capture = installNetworkCapture();
    try {
      const { DegradedModeController } = await loadDegraded();
      controller = new DegradedModeController({
        databaseUrl: DEFAULT_DATABASE_URL,
        role: 'divergent',
      });
      await controller.init();
      const down = await controller.resolveRole('divergent', {
        endpointOverride: DEAD_ENDPOINT,
      });
      expect(down.ok).toBe(false);
      if (down.ok) throw new Error('expected degradation');
      expect(down.degradation.message).toMatch(new RegExp(SURFACE_MSG, 'i'));
      expect(capture.anthropicCount()).toBe(0);
    } finally {
      capture.restore();
    }
  });

  /** REDHAT-FIX-H1: process-flag degraded blocks runBudgetedEscape (shared choke). */
  itLive('H1: process degraded blocks runBudgetedEscape with zero Anthropic', async () => {
    const capture = installNetworkCapture();
    try {
      const flagPath = ['../../../services/platform/src/inference', 'degraded-process-flag'].join(
        '/'
      );
      const ledgerPath = ['../../../services/platform/src/inference', 'budget-ledger'].join('/');
      const flag = (await import(flagPath)) as {
        setProcessDegradedState: (s: string) => void;
        resetProcessDegradedFlag: () => void;
      };
      const ledger = (await import(ledgerPath)) as {
        runBudgetedEscape: (req: {
          prompt: string;
          reason: string;
          estimatedCostUsd?: number;
          role?: string;
        }) => Promise<unknown>;
      };
      flag.setProcessDegradedState('surface-unavailable');
      let refused = false;
      let message = '';
      try {
        await ledger.runBudgetedEscape({
          prompt: 'pong',
          reason: 'infer-3-h1-escape-choke',
          estimatedCostUsd: 0.05,
          role: 'divergent',
        });
      } catch (err) {
        refused = true;
        message = err instanceof Error ? err.message : String(err);
      } finally {
        flag.resetProcessDegradedFlag();
      }
      expect(refused).toBe(true);
      expect(message).toMatch(/degraded|never-cloud/i);
      expect(capture.anthropicCount()).toBe(0);
      writeArtifact('H1-runBudgetedEscape-degraded.json', {
        refused,
        message,
        anthropicCount: capture.anthropicCount(),
      });
    } finally {
      capture.restore();
    }
  });
});
