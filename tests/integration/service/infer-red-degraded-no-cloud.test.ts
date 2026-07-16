/**
 * infer-4 / AC-3 / TC-3 (T-INFER-014): Degraded mode never falls back to cloud.
 *
 * GIVEN DegradedModeController in surface-unavailable (fleet down)
 * WHEN reasoning / resolveRole / attemptReasoning / allowEscape temptation
 * THEN allowCloud=false, surface or queue only, anthropicCount === 0.
 *
 * NEGATIVE CONTROL (would fail if):
 * - Degraded mode silently routes to api.anthropic.com
 * - Network assertion mocked so always returns zero
 * - Controller stubbed/empty so test passes without real degradation
 * - resolveModel escape permitted while process degraded
 *
 * RED (no DegradedModeController): vitest non-zero — controller undefined.
 * GREEN (infer-3+): exit 0, zero cloud under degradation.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-red-degraded-no-cloud.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_DATABASE_URL, PLATFORM_IT, REPO_ROOT } from './harness';
import { installNetworkCapture } from './infer-network-capture';
import { loadResolveModel } from './infer-resolve-loader';

const itLive = PLATFORM_IT ? it : it.skip;
const DEAD_ENDPOINT = 'http://127.0.0.1:1';
const SURFACE_MSG = 'Local fleet unavailable';
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/infer-4');

function writeArtifact(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
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

describe('infer-4 AC-3: degraded mode never falls back to cloud (real capture)', () => {
  let controller: InstanceType<
    Awaited<ReturnType<typeof loadDegraded>>['DegradedModeController']
  > | null = null;

  afterEach(async () => {
    if (controller) {
      await controller.close({ resetToNormal: true }).catch(() => undefined);
      controller = null;
    }
  });

  itLive('DegradedModeController is defined (not no-controller RED state)', async () => {
    const mod = await loadDegraded();
    expect(typeof mod.DegradedModeController).toBe('function');
  });

  itLive(
    'degraded surface-unavailable: zero Anthropic; surface/queue only; allowCloud=false',
    async () => {
      const capture = installNetworkCapture();
      try {
        const { DegradedModeController } = await loadDegraded();
        controller = new DegradedModeController({
          databaseUrl: DEFAULT_DATABASE_URL,
          pollIntervalMs: 60_000,
          role: 'divergent',
        });
        await controller.init();

        // Enter degraded via dead fleet endpoint (real probe, fail closed)
        const down = await controller.resolveRole('divergent', {
          endpointOverride: DEAD_ENDPOINT,
          allowEscape: false,
        });
        expect(down.ok).toBe(false);
        if (down.ok) throw new Error('expected degradation');
        expect(down.degradation.allowCloud).toBe(false);
        expect(controller.getState()['degraded-state']).toBe('surface-unavailable');
        expect(controller.getState().message ?? '').toMatch(/Local fleet unavailable/i);
        expect(down.degradation.message).toMatch(new RegExp(SURFACE_MSG, 'i'));

        // Multiple reasoning attempts while degraded — including escape temptation
        const attempts: Array<{
          outcome: string;
          allowCloud: boolean;
          message?: string;
          endpoint?: string;
        }> = [];
        for (const opts of [
          { allowEscape: false },
          {
            allowEscape: true,
            estimatedCostUsd: 0.01,
            reason: 'infer-4-degraded-escape-temptation',
          },
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

        // Direct resolveModel escape while process-level degraded must not hit cloud
        const { resolveModel } = await loadResolveModel();
        let escapeBlocked = false;
        let escapeEndpoint: string | undefined;
        try {
          const escaped = await resolveModel('divergent', {
            allowEscape: true,
            estimatedCostUsd: 0.01,
            reason: 'infer-4-degraded-escape-probe',
          });
          escapeEndpoint = escaped.endpoint;
          expect(escaped.endpoint).not.toMatch(/api\.anthropic\.com/i);
        } catch {
          escapeBlocked = true;
        }

        // Un-fakeable network assertion
        expect(capture.anthropicCount()).toBe(0);
        expect(capture.countForHost('api.anthropic.com')).toBe(0);
        for (const row of capture.snapshot()) {
          expect(row.host).not.toMatch(/api\.anthropic\.com/i);
          expect(row.url).not.toMatch(/api\.anthropic\.com/i);
        }
        const rows = capture.snapshot();
        const anthropicRows = rows.filter(
          (r) =>
            r.host.toLowerCase().includes('api.anthropic.com') ||
            r.url.toLowerCase().includes('api.anthropic.com')
        );
        expect(anthropicRows.length).toBe(0);

        writeArtifact('AC-3-degraded-no-cloud.json', {
          state: controller.getState(),
          down,
          attempts,
          escapeBlocked,
          escapeEndpoint: escapeEndpoint ?? null,
          anthropicCount: capture.anthropicCount(),
          captureRows: rows,
        });
      } finally {
        capture.restore();
      }
    }
  );

  itLive('message contains Local fleet unavailable; anthropicCount stays 0', async () => {
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
      expect(down.degradation.allowCloud).toBe(false);
      expect(capture.anthropicCount()).toBe(0);

      writeArtifact('AC-3-surface-message.json', {
        message: down.degradation.message,
        allowCloud: down.degradation.allowCloud,
        state: controller.getState(),
        anthropicCount: capture.anthropicCount(),
      });
    } finally {
      capture.restore();
    }
  });
});
