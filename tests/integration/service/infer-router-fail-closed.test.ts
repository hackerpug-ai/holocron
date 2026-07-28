/**
 * AC-2 / TC-4..5 (infer-1): Router rejects unknown roles and unhealthy endpoints fail-closed.
 *
 * NEGATIVE CONTROL (would fail if):
 * - Unknown role accepted so fallback to default model occurs
 * - Health probe skipped so unhealthy endpoint returned
 * - RoleUnavailableError absent so silent fallback to cloud occurs
 * - Degradation action ignored so fallback to alternative provider
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-router-fail-closed.test.ts
 */
import { describe, expect, it } from 'vitest';
import { PLATFORM_IT } from './harness';
import { installNetworkCapture, writeInferArtifact } from './infer-network-capture';
import { loadResolveModel } from './infer-resolve-loader';

const itLive = PLATFORM_IT ? it : it.skip;

const DEGRADATION_ACTIONS = new Set(['surface-unavailable', 'queue-and-retry', 'fail-closed']);

describe('AC-2: resolveModel fail-closed on unknown role / unhealthy endpoint', () => {
  itLive('unknown role throws UnknownFleetRoleError (code UNKNOWN_FLEET_ROLE)', async () => {
    const capture = installNetworkCapture();
    try {
      const { resolveModel, UnknownFleetRoleError } = await loadResolveModel();

      let caught: unknown;
      try {
        await resolveModel('unknown-role');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(UnknownFleetRoleError);
      const err = caught as InstanceType<typeof UnknownFleetRoleError>;
      expect(err.code).toBe('UNKNOWN_FLEET_ROLE');
      expect(err.role).toBe('unknown-role');
      // No silent cloud fallback
      expect(capture.deepseekCount()).toBe(0);

      writeInferArtifact('AC-2-unknown-role.json', {
        code: err.code,
        message: err.message,
        deepseekCount: capture.deepseekCount(),
      });
    } finally {
      capture.restore();
    }
  });

  itLive('unhealthy endpoint throws RoleUnavailableError with degradationAction', async () => {
    const capture = installNetworkCapture();
    try {
      const { resolveModel, RoleUnavailableError } = await loadResolveModel();

      let caught: unknown;
      try {
        await resolveModel('divergent', {
          endpointOverride: 'http://127.0.0.1:1',
          allowEscape: false,
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(RoleUnavailableError);
      const err = caught as InstanceType<typeof RoleUnavailableError>;
      expect(err.code).toBe('ROLE_UNAVAILABLE');
      expect(err.role).toBe('divergent');
      expect(DEGRADATION_ACTIONS.has(err.degradationAction)).toBe(true);
      // Never cloud on fleet-down
      expect(capture.deepseekCount()).toBe(0);

      writeInferArtifact('AC-2-role-unavailable.json', {
        code: err.code,
        degradationAction: err.degradationAction,
        endpoint: err.endpoint,
        message: err.message,
        deepseekCount: capture.deepseekCount(),
      });
    } finally {
      capture.restore();
    }
  });

  itLive('fleet-down never returns a model object or cloud endpoint', async () => {
    const capture = installNetworkCapture();
    try {
      const { resolveModel } = await loadResolveModel();

      let resolved: unknown = null;
      let threw = false;
      try {
        resolved = await resolveModel('divergent', {
          endpointOverride: 'http://127.0.0.1:1',
        });
      } catch {
        threw = true;
      }

      expect(threw).toBe(true);
      expect(resolved).toBeNull();
      expect(capture.deepseekCount()).toBe(0);
    } finally {
      capture.restore();
    }
  });
});
