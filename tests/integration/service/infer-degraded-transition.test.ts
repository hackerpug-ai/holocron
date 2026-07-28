/**
 * AC-1 / TC-1..3 (infer-3): DegradedModeController executes degradationAction
 * on RoleUnavailableError and surfaces reduced mode (never cloud).
 *
 * NEGATIVE CONTROL (would fail if):
 * - DegradedModeController omitted so RoleUnavailableError propagates uncaught
 * - degradationAction not read from manifest so default fallback to stub occurs
 * - Network assertion mocked so cloud fallback undetected
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-transition.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_DATABASE_URL, PLATFORM_IT, REPO_ROOT } from './harness';
import { installNetworkCapture } from './infer-network-capture';

const itLive = PLATFORM_IT ? it : it.skip;

const SURFACE_MSG = 'Local fleet unavailable — running in reduced mode';
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
        degradationAction?: string | null;
      };
      resolveRole: (
        role: string,
        options?: Record<string, unknown>
      ) => Promise<
        | { ok: true; resolved: { endpoint: string; role: string } }
        | {
            ok: false;
            degradation: {
              'degraded-state': string;
              message: string;
              degradationAction: string;
              allowCloud: boolean;
            };
            error?: { code: string; role: string; degradationAction: string };
          }
      >;
      handleUnavailable: (
        err: {
          code: string;
          role: string;
          endpoint: string;
          degradationAction: string;
          message: string;
        },
        context?: Record<string, unknown>
      ) => Promise<{
        'degraded-state': string;
        message: string;
        degradationAction: string;
        allowCloud: boolean;
      }>;
    };
    SURFACE_UNAVAILABLE_MESSAGE: string;
    loadResolveModel?: never;
  }>;
}

async function loadResolveModel() {
  const path = ['../../../services/platform/src/inference', 'resolve-model'].join('/');
  return import(path) as Promise<{
    resolveModel: (role: string, options?: Record<string, unknown>) => Promise<unknown>;
    RoleUnavailableError: new (
      role: string,
      endpoint: string,
      degradationAction: string,
      causeMessage: string
    ) => Error & {
      code: string;
      role: string;
      endpoint: string;
      degradationAction: string;
    };
  }>;
}

describe('AC-1: Controller executes degradationAction on RoleUnavailableError', () => {
  let controller: Awaited<ReturnType<typeof loadDegraded>> extends {
    DegradedModeController: new (o?: Record<string, unknown>) => infer C;
  }
    ? C
    : never;

  afterEach(async () => {
    if (controller) {
      await controller.close({ resetToNormal: true }).catch(() => undefined);
    }
  });

  itLive(
    'catches RoleUnavailableError, sets surface-unavailable, surfaces message, zero Anthropic',
    async () => {
      const capture = installNetworkCapture();
      try {
        const { DegradedModeController, SURFACE_UNAVAILABLE_MESSAGE } = await loadDegraded();
        const { RoleUnavailableError } = await loadResolveModel();

        controller = new DegradedModeController({
          databaseUrl: DEFAULT_DATABASE_URL,
          pollIntervalMs: 60_000,
          role: 'divergent',
        });
        await controller.init();

        // Fleet-down via dead endpoint (real probe fails closed — not a mocked error)
        const result = await controller.resolveRole('divergent', {
          endpointOverride: DEAD_ENDPOINT,
          allowEscape: false,
        });

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('expected degradation, got resolved model');

        // RoleUnavailableError was caught (not uncaught)
        expect(result.error?.code).toBe('ROLE_UNAVAILABLE');
        expect(result.degradation.degradationAction).toBe('surface-unavailable');
        expect(result.degradation['degraded-state']).toBe('surface-unavailable');
        expect(result.degradation.message).toContain(SURFACE_MSG);
        expect(result.degradation.message).toBe(SURFACE_UNAVAILABLE_MESSAGE);
        expect(result.degradation.allowCloud).toBe(false);

        const state = controller.getState();
        expect(state['degraded-state']).toBe('surface-unavailable');
        expect(state.message).toContain(SURFACE_MSG);
        expect(state['degraded-state']).not.toBe('normal');

        // Never-cloud during degradation
        expect(capture.deepseekCount()).toBe(0);

        // Prove RoleUnavailableError type still carries degradationAction from manifest
        expect(result.error?.degradationAction).toBe('surface-unavailable');
        expect(result.error).toBeInstanceOf(RoleUnavailableError);

        writeArtifact('AC-1-transition.json', {
          ok: result.ok,
          degradation: result.degradation,
          state,
          deepseekCount: capture.deepseekCount(),
          captureRows: capture.snapshot(),
        });
      } finally {
        capture.restore();
      }
    }
  );

  itLive('handleUnavailable alone transitions state without cloud', async () => {
    const capture = installNetworkCapture();
    try {
      const { DegradedModeController } = await loadDegraded();
      const { RoleUnavailableError } = await loadResolveModel();

      controller = new DegradedModeController({
        databaseUrl: DEFAULT_DATABASE_URL,
        pollIntervalMs: 60_000,
      });
      await controller.init();

      const err = new RoleUnavailableError(
        'divergent',
        DEAD_ENDPOINT,
        'surface-unavailable',
        'health probe failed (test inject)'
      );
      const degradation = await controller.handleUnavailable(err, { surface: 'chat' });

      expect(degradation['degraded-state']).toBe('surface-unavailable');
      expect(degradation.message).toContain(SURFACE_MSG);
      expect(controller.getState()['degraded-state']).toBe('surface-unavailable');
      expect(capture.deepseekCount()).toBe(0);

      writeArtifact('AC-1-handle-unavailable.json', {
        degradation,
        state: controller.getState(),
        deepseekCount: capture.deepseekCount(),
      });
    } finally {
      capture.restore();
    }
  });
});
