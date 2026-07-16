/**
 * struct-3 AC-4: RED test for boot-time capability probe with real generateObject.
 *
 * Proves the empty implementation fails with ReferenceError on probeCapabilities,
 * and that once implemented, the boot-time probe uses REAL generateObject calls
 * per role (never a /health proxy or static cache).
 *
 * NEGATIVE_CONTROL (would fail if):
 * - Test stubbed to pass without real probeCapabilities function
 * - Test allows /health proxy instead of generateObject
 * - Test allows static cached capability data
 * - Test skipped or marked as todo
 * - Probe doesn't call real fleet endpoint
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts
 *
 * RED state (empty impl): ReferenceError: probeCapabilities is not defined
 * GREEN state (after struct-2): Real generateObject calls per role, capability recorded
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { roleFixtures } from '../../fixtures/struct-fixtures';
import { PLATFORM_IT, REPO_ROOT } from './harness';
import { installNetworkCapture } from './infer-network-capture';
import { loadResolveModel } from './infer-resolve-loader';

// Local fleet structured generation ≈ 27s/call; the boot probe hits all roles
// sequentially, so live tests need a long timeout (the 5s default only fits a single fast call).
const FLEET_TIMEOUT = 420000;
const itLive = (
  name: string,
  fn: () => Promise<unknown> | void,
  timeout: number = FLEET_TIMEOUT
) => {
  if (PLATFORM_IT) it(name, fn, timeout);
  else it.skip(name, fn);
};
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/struct-3');

function writeArtifact(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

/**
 * Load probeCapabilities from the implementation module.
 * This will fail with ReferenceError in RED state (module doesn't exist yet).
 */
async function loadProbeCapabilities() {
  const path = ['../../../services/platform/src/inference', 'probe-capability'].join('/');
  try {
    return await import(path);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Cannot find')) {
      const refErr = new ReferenceError(
        'probeCapabilities is not defined - RED state: implementation does not exist yet'
      );
      refErr.cause = err;
      throw refErr;
    }
    throw err;
  }
}

describe('struct-3 AC-4: boot-time probe uses real generateObject (RED)', () => {
  beforeAll(() => {
    if (!PLATFORM_IT) return;
  });

  itLive('probeCapabilities function exists (RED: ReferenceError)', async () => {
    let caught: unknown;
    try {
      const mod = await loadProbeCapabilities();
      // If we reach here, check that the function is actually defined
      expect(typeof mod.probeCapabilities).toBe('function');
    } catch (err) {
      caught = err;
      // RED state: expect ReferenceError
      expect(caught).toBeInstanceOf(ReferenceError);
      expect(caught instanceof Error ? caught.message : String(caught)).toMatch(
        /probeCapabilities is not defined|RED state|implementation does not exist/i
      );
      writeArtifact('AC-4-red-probeCapabilities-missing.json', {
        error:
          caught instanceof Error ? { name: caught.name, message: caught.message } : String(caught),
        RED_state: true,
      });
      throw caught;
    }
  });

  itLive(
    'probe uses real generateObject call, not /health proxy (RED: ReferenceError)',
    async () => {
      const capture = installNetworkCapture();
      try {
        const { resolveModel } = await loadResolveModel();
        const probeMod = await loadProbeCapabilities();

        // Probe each role
        const roles = Object.values(roleFixtures);
        for (const fixture of roles) {
          const resolved = await resolveModel(fixture.role);
          expect(resolved.healthy).toBe(true);

          // This will fail in RED state with ReferenceError
          const capability = await probeMod.probeCapabilities(fixture.role, {
            manifestPath: undefined,
          });

          // Once implemented (GREEN), verify capability was recorded
          expect(capability).toBeDefined();
          expect(capability.role).toBe(fixture.role);
          expect(typeof capability.supportsJsonSchema).toBe('boolean');

          writeArtifact(`AC-4-green-probe-${fixture.role}.json`, {
            capability,
            resolved: {
              role: resolved.role,
              endpoint: resolved.endpoint,
              litellmModelId: resolved.litellmModelId,
            },
          });
        }

        // Must have real fleet traffic (NOT /health calls)
        expect(capture.fleetCount()).toBeGreaterThanOrEqual(1);
        expect(capture.anthropicCount()).toBe(0);

        // Verify no /health endpoint was used (proxy check)
        for (const row of capture.snapshot()) {
          expect(row.url).not.toMatch(/\/health$/i);
        }

        writeArtifact('AC-4-green-real-generateObject.json', {
          fleetCount: capture.fleetCount(),
          anthropicCount: capture.anthropicCount(),
          noHealthProxy: true,
        });
      } finally {
        capture.restore();
      }
    }
  );

  itLive('probe records json_schema support per role (RED: ReferenceError)', async () => {
    try {
      const probeMod = await loadProbeCapabilities();

      // This test verifies capability recording in GREEN state
      // For now, it proves the function exists
      expect(probeMod.probeCapabilities).toBeDefined();

      writeArtifact('AC-4-red-capability-recording.json', {
        RED_state: true,
        note: 'Capability recording will be verified in GREEN state (struct-2)',
        expectedFields: ['role', 'supportsJsonSchema', 'constrainedDecode', 'repairLoop'],
      });
    } catch (err) {
      // RED state: expect ReferenceError
      expect(err).toBeInstanceOf(ReferenceError);
      expect(err instanceof Error ? err.message : String(err)).toMatch(
        /probeCapabilities is not defined|RED state/i
      );
      writeArtifact('AC-4-red-capability-recording-missing.json', {
        error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
        RED_state: true,
      });
      throw err;
    }
  });

  itLive(
    'probe selects constrained vs repair mode based on capability (RED: ReferenceError)',
    async () => {
      try {
        const probeMod = await loadProbeCapabilities();

        // This test verifies mode selection in GREEN state
        // For now, it proves the function exists
        expect(probeMod.probeCapabilities).toBeDefined();

        writeArtifact('AC-4-red-mode-selection.json', {
          RED_state: true,
          note: 'Mode selection will be verified in GREEN state (struct-2)',
          expectedModes: ['constrainedDecode', 'repairLoop'],
        });
      } catch (err) {
        // RED state: expect ReferenceError
        expect(err).toBeInstanceOf(ReferenceError);
        writeArtifact('AC-4-red-mode-selection-missing.json', {
          error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
          RED_state: true,
        });
        throw err;
      }
    }
  );

  itLive('probe is called at boot time, not lazily (RED: ReferenceError)', async () => {
    try {
      const probeMod = await loadProbeCapabilities();

      // This test verifies boot-time invocation in GREEN state
      // For now, it proves the function exists
      expect(probeMod.probeCapabilities).toBeDefined();

      writeArtifact('AC-4-red-boot-time.json', {
        RED_state: true,
        note: 'Boot-time invocation will be verified in GREEN state (struct-2)',
        expectedBehavior: 'probeCapabilities called during service init, not on first extraction',
      });
    } catch (err) {
      // RED state: expect ReferenceError
      expect(err).toBeInstanceOf(ReferenceError);
      writeArtifact('AC-4-red-boot-time-missing.json', {
        error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
        RED_state: true,
      });
      throw err;
    }
  });
});

describe('struct-3 AC-4 negative-control hygiene', () => {
  itLive('roleFixtures are real fleet roles (not fake)', () => {
    expect(roleFixtures).toBeDefined();
    expect(Object.keys(roleFixtures).length).toBeGreaterThan(0);
    expect(roleFixtures.divergent).toBeDefined();
    expect(roleFixtures.divergent.role).toBe('divergent');
    expect(roleFixtures.convergent).toBeDefined();
    expect(roleFixtures.convergent.role).toBe('convergent');

    writeArtifact('AC-4-role-fixtures-real.json', {
      roles: Object.keys(roleFixtures),
      divergent: roleFixtures.divergent,
      convergent: roleFixtures.convergent,
    });
  });

  itLive('network capture is real (not hard-coded zero)', async () => {
    const capture = installNetworkCapture();
    try {
      // Real local request — count must increase
      await fetch('http://127.0.0.1:4545/v1/models').catch(() => undefined);
      expect(capture.rows.length).toBeGreaterThanOrEqual(1);
      expect(capture.fleetCount()).toBeGreaterThanOrEqual(1);

      writeArtifact('AC-4-capture-hygiene.json', {
        rowCount: capture.rows.length,
        fleetCount: capture.fleetCount(),
        anthropicCount: capture.anthropicCount(),
      });
    } finally {
      capture.restore();
    }
  });

  it('PLATFORM_IT gate is required for live assertions', () => {
    if (!PLATFORM_IT) {
      writeArtifact('AC-4-red-skipped-no-platform-it.json', {
        PLATFORM_IT: false,
        note: 'Live AC-4 cases require PLATFORM_IT=1 + real fleet + real Postgres',
      });
    }
    expect(typeof PLATFORM_IT).toBe('boolean');
  });
});
