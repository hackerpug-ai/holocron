/**
 * AC-4 / TC-7..8 (infer-3): Research mission degrades to sense-only; retry-queue for ASSAY/CHALLENGE.
 *
 * NEGATIVE CONTROL (would fail if):
 * - Research mission continues full execution in degraded mode (bypass)
 * - Retry-queue not populated for failed steps (empty queue)
 * - Mission mode not set to 'sense-only' (wrong mode)
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-research-mission.test.ts
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
      getState: () => { 'degraded-state': string };
      startResearchMission: (missionId: string) => Promise<{
        missionId: string;
        mode: string;
        extractionState: string;
      }>;
      handleResearchStepUnavailable: (
        missionId: string,
        stepType: 'ASSAY' | 'CHALLENGE' | 'SENSE' | 'GENERATE' | 'MAP' | 'COMMIT',
        err: {
          code: string;
          role: string;
          endpoint: string;
          degradationAction: string;
          message: string;
        }
      ) => Promise<{
        mode: string;
        extractionState: string;
        'degraded-state': string;
        queued: boolean;
      }>;
      getResearchMission: (missionId: string) => Promise<{
        mode: string;
        extractionState: string;
        'degraded-state': string;
      }>;
      countRetryQueue: (missionId: string, stepTypes?: string[]) => Promise<number>;
      resolveRole: (role: string, options?: Record<string, unknown>) => Promise<{ ok: boolean }>;
    };
    RoleUnavailableError?: never;
  }>;
}

async function loadResolveModel() {
  const path = ['../../../services/platform/src/inference', 'resolve-model'].join('/');
  return import(path) as Promise<{
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
    resolveModel: (role: string, options?: Record<string, unknown>) => Promise<unknown>;
  }>;
}

describe('AC-4: Research mission degrades to sense-only with retry-queue', () => {
  let controller: InstanceType<
    Awaited<ReturnType<typeof loadDegraded>>['DegradedModeController']
  > | null = null;

  afterEach(async () => {
    if (controller) {
      await controller.close({ resetToNormal: true }).catch(() => undefined);
      controller = null;
    }
  });

  itLive(
    'ASSAY + CHALLENGE fleet-down → sense-only, retry-queue ≥ 2, extraction running',
    async () => {
      const capture = installNetworkCapture();
      try {
        const { DegradedModeController } = await loadDegraded();
        const { RoleUnavailableError, resolveModel } = await loadResolveModel();

        controller = new DegradedModeController({
          databaseUrl: DEFAULT_DATABASE_URL,
          pollIntervalMs: 60_000,
          role: 'divergent',
        });
        await controller.init();

        const missionId = `mission-infer3-${Date.now()}`;
        const started = await controller.startResearchMission(missionId);
        expect(started.mode).toBe('full');
        expect(started.extractionState).toBe('running');

        // Real RoleUnavailableError from resolveModel on dead fleet
        let assayErr: InstanceType<typeof RoleUnavailableError>;
        try {
          await resolveModel('divergent', {
            endpointOverride: DEAD_ENDPOINT,
            allowEscape: false,
          });
          throw new Error('expected RoleUnavailableError for ASSAY');
        } catch (err) {
          expect(err).toBeInstanceOf(RoleUnavailableError);
          assayErr = err as InstanceType<typeof RoleUnavailableError>;
        }
        expect(assayErr.code).toBe('ROLE_UNAVAILABLE');

        const afterAssay = await controller.handleResearchStepUnavailable(
          missionId,
          'ASSAY',
          assayErr
        );
        expect(afterAssay.mode).toBe('sense-only');
        expect(afterAssay.extractionState).toBe('running');
        expect(afterAssay['degraded-state']).toBe('surface-unavailable');
        expect(afterAssay.queued).toBe(true);

        let challengeErr: InstanceType<typeof RoleUnavailableError>;
        try {
          await resolveModel('convergent', {
            endpointOverride: DEAD_ENDPOINT,
            allowEscape: false,
          });
          throw new Error('expected RoleUnavailableError for CHALLENGE');
        } catch (err) {
          expect(err).toBeInstanceOf(RoleUnavailableError);
          challengeErr = err as InstanceType<typeof RoleUnavailableError>;
        }

        const afterChallenge = await controller.handleResearchStepUnavailable(
          missionId,
          'CHALLENGE',
          challengeErr
        );
        expect(afterChallenge.mode).toBe('sense-only');
        expect(afterChallenge.extractionState).toBe('running');
        expect(afterChallenge.extractionState).not.toBe('failed');
        expect(afterChallenge['degraded-state']).toBe('surface-unavailable');

        const mission = await controller.getResearchMission(missionId);
        expect(mission.mode).toBe('sense-only');
        expect(mission.mode).not.toBe('full');
        expect(mission.extractionState).toBe('running');
        expect(mission['degraded-state']).toBe('surface-unavailable');

        const retryCount = await controller.countRetryQueue(missionId, ['ASSAY', 'CHALLENGE']);
        expect(retryCount).toBeGreaterThanOrEqual(2);

        expect(controller.getState()['degraded-state']).toBe('surface-unavailable');
        expect(capture.anthropicCount()).toBe(0);

        writeArtifact('AC-4-research-mission.json', {
          missionId,
          mission,
          afterAssay,
          afterChallenge,
          retryCount,
          degradedState: controller.getState()['degraded-state'],
          anthropicCount: capture.anthropicCount(),
        });
      } finally {
        capture.restore();
      }
    }
  );
});
