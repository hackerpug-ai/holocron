/**
 * AC-2 / TC-4..5 (infer-3): Health-probe polling detects endpoint return and auto-resumes.
 *
 * NEGATIVE CONTROL (would fail if):
 * - Health probe skipped so auto-resume never triggers
 * - Health probe mocked to always return unhealthy (static false)
 * - Endpoint status not verified before resume
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-resume.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_DATABASE_URL, PLATFORM_IT, REPO_ROOT } from './harness';
import { installNetworkCapture } from './infer-network-capture';

const itLive = PLATFORM_IT ? it : it.skip;
const DEAD_ENDPOINT = 'http://127.0.0.1:1';

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
      getState: () => {
        'degraded-state': string;
        'resume-state': string;
        message: string | null;
      };
      resolveRole: (
        role: string,
        options?: Record<string, unknown>
      ) => Promise<
        | { ok: true; resolved: { endpoint: string; role: string; provider?: string } }
        | { ok: false; degradation: { 'degraded-state': string; message: string } }
      >;
      /** Force degraded without waiting for resolve (tests). */
      forceDegraded?: (opts: {
        role: string;
        endpoint: string;
        degradationAction: string;
      }) => Promise<void>;
      /**
       * Override which endpoint the resume probe uses (tests: dead → live).
       * Production probes the role's real fleet endpoint.
       */
      setProbeEndpointOverride?: (endpoint: string | null) => void;
      pollOnce: () => Promise<{ ok: boolean; resumed: boolean; endpoint?: string }>;
      startPolling: () => void;
      stopPolling: () => void;
    };
  }>;
}

describe('AC-2: Health-probe polling detects endpoint return and auto-resumes', () => {
  let controller: InstanceType<
    Awaited<ReturnType<typeof loadDegraded>>['DegradedModeController']
  > | null = null;

  afterEach(async () => {
    if (controller) {
      controller.stopPolling?.();
      await controller.close({ resetToNormal: true }).catch(() => undefined);
      controller = null;
    }
  });

  itLive('pollOnce resumes to normal when fleet endpoint returns (real :4545 probe)', async () => {
    const capture = installNetworkCapture();
    try {
      const { DegradedModeController } = await loadDegraded();

      controller = new DegradedModeController({
        databaseUrl: DEFAULT_DATABASE_URL,
        pollIntervalMs: 200,
        role: 'divergent',
      });
      await controller.init();

      // Enter degraded via real dead probe
      const down = await controller.resolveRole('divergent', {
        endpointOverride: DEAD_ENDPOINT,
        allowEscape: false,
      });
      expect(down.ok).toBe(false);
      expect(controller.getState()['degraded-state']).toBe('surface-unavailable');

      // Resume probe targets the real live fleet (not a mocked always-healthy stub)
      controller.setProbeEndpointOverride?.(null); // use manifest endpoint :4545

      const poll = await controller.pollOnce();
      expect(poll.ok).toBe(true);
      expect(poll.resumed).toBe(true);

      const state = controller.getState();
      expect(state['degraded-state']).toBe('normal');
      expect(state['resume-state']).toBe('normal');
      expect(state['degraded-state']).not.toBe('surface-unavailable');

      // After resume, resolveModel routes to fleet :4545 (no cloud)
      const up = await controller.resolveRole('divergent', { allowEscape: false });
      expect(up.ok).toBe(true);
      if (!up.ok) throw new Error('expected resolved after resume');
      expect(up.resolved.endpoint).toMatch(/:4545/);
      expect(up.resolved.endpoint).not.toMatch(/api\.deepseek\.com/);
      expect(up.resolved.provider ?? 'fleet').not.toBe('deepseek');

      // Fleet probe traffic present after resume
      expect(capture.fleetCount()).toBeGreaterThanOrEqual(1);
      expect(capture.deepseekCount()).toBe(0);

      writeArtifact('AC-2-resume.json', {
        poll,
        state,
        resolved: up.resolved,
        fleetCount: capture.fleetCount(),
        deepseekCount: capture.deepseekCount(),
        captureRows: capture.snapshot(),
      });
    } finally {
      capture.restore();
    }
  });

  itLive('does not resume while endpoint still down (real failed probe)', async () => {
    const capture = installNetworkCapture();
    try {
      const { DegradedModeController } = await loadDegraded();

      controller = new DegradedModeController({
        databaseUrl: DEFAULT_DATABASE_URL,
        pollIntervalMs: 200,
        role: 'divergent',
      });
      await controller.init();

      const down = await controller.resolveRole('divergent', {
        endpointOverride: DEAD_ENDPOINT,
        allowEscape: false,
      });
      expect(down.ok).toBe(false);

      // Keep probe pointed at dead endpoint — must stay degraded
      controller.setProbeEndpointOverride?.(DEAD_ENDPOINT);
      const poll = await controller.pollOnce();
      expect(poll.ok).toBe(false);
      expect(poll.resumed).toBe(false);
      expect(controller.getState()['degraded-state']).toBe('surface-unavailable');
      expect(controller.getState()['resume-state']).not.toBe('normal');
      expect(capture.deepseekCount()).toBe(0);

      writeArtifact('AC-2-no-premature-resume.json', {
        poll,
        state: controller.getState(),
        deepseekCount: capture.deepseekCount(),
      });
    } finally {
      capture.restore();
    }
  });
});
