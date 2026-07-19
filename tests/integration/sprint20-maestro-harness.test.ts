import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';

const harness = 'scripts/e2e/run-maestro-reference-flow.sh';

/**
 * Baseline env mirroring .github/workflows/ci-e2e.yml (lines 41–56), with every
 * precondition valid except the single variable under test.
 */
function validHarnessEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    MAESTRO_DEVICE: 'iPhone 17',
    DATABASE_URL: 'postgres://127.0.0.1:5432/holocron_nonprod',
    FLEET_URL: 'http://127.0.0.1:4545',
    PLATFORM_URL: 'http://127.0.0.1:4111',
    EXPO_PUBLIC_PLATFORM_URL: 'http://127.0.0.1:4111',
    EXPO_PUBLIC_RN_API_KEY: 'test-rn-api-key',
    EXPO_PUBLIC_REFERENCE_FLOW: 'true',
    ZERO_ADMIN_PASSWORD: 'test-zero-admin',
    // Non-empty path that is not under test; individual cases override/clear.
    EXPO_DEV_BUILD_PATH: '/tmp/holocron-e2e-placeholder.app',
    ...overrides,
  };
}

function runHarness(args: string[], env: NodeJS.ProcessEnv): ReturnType<typeof spawnSync> {
  return spawnSync(harness, args, {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
}

describe('Sprint 20 Maestro harness', () => {
  beforeAll(() => {
    if (!PLATFORM_IT) {
      throw new Error(
        'PLATFORM_IT=1 required for Maestro harness fail-closed lane — refusing skip-to-green'
      );
    }
  });

  it('fails closed when the named simulator contract is absent', () => {
    const result = runHarness(['--check'], {
      ...process.env,
      MAESTRO_DEVICE: '',
      DATABASE_URL: 'postgres://127.0.0.1:5432/holocron_nonprod',
      FLEET_URL: 'http://127.0.0.1:4545',
      PLATFORM_URL: 'http://127.0.0.1:4111',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('MAESTRO_DEVICE');
  });

  describe('Expo development build', () => {
    it('fails closed when the Expo build path is missing', () => {
      const artifactDir = mkdtempSync(join(tmpdir(), 'maestro-harness-missing-build-'));
      try {
        const result = runHarness(
          ['--check'],
          validHarnessEnv({
            EXPO_DEV_BUILD_PATH: '',
            E2E_ARTIFACT_DIR: artifactDir,
          })
        );
        expect(result.status).not.toBe(0);
        // Harness fail() text (either branch is accepted by AC-1 case 1).
        const stderr = result.stderr ?? '';
        const requiredMsg = 'EXPO_DEV_BUILD_PATH is required';
        const missingMsg = 'Expo development build does not exist';
        expect(
          stderr.includes(requiredMsg) || stderr.includes(missingMsg),
          `expected stderr to include "${requiredMsg}" or "${missingMsg}", got: ${stderr}`
        ).toBe(true);
        expect(existsSync(join(artifactDir, 'junit.xml'))).toBe(false);
        expect(stderr).not.toContain('"ok":true');
      } finally {
        rmSync(artifactDir, { recursive: true, force: true });
      }
    });

    it(
      'fails closed when EXPO_DEV_BUILD_PATH is not a real bundle',
      { timeout: 120_000 },
      () => {
        // empty_bundle_directory fixture: exists, passes a bare directory probe,
        // but is not an installable .app bundle.
        const emptyBundleDir = mkdtempSync(join(tmpdir(), 'not-a-real-build-'));
        const artifactDir = mkdtempSync(join(tmpdir(), 'maestro-harness-bad-bundle-'));
        try {
          const result = runHarness(
            ['--run'],
            validHarnessEnv({
              EXPO_DEV_BUILD_PATH: emptyBundleDir,
              E2E_ARTIFACT_DIR: artifactDir,
            })
          );
          expect(result.status).not.toBe(0);
          // Literal harness fail() / install path — never a green empty start.
          // Current harness rejects non-file paths with this fail() text before
          // maestro runs; if install is reached, simctl-install.txt must record failure.
          const stderr = result.stderr ?? '';
          const simctlInstall = join(artifactDir, 'simctl-install.txt');
          const rejectedAsMissing = stderr.includes('Expo development build does not exist');
          const installAttempted = existsSync(simctlInstall);
          expect(
            rejectedAsMissing || installAttempted,
            `expected fail-closed build rejection or simctl-install evidence, stderr=${stderr}`
          ).toBe(true);
          if (installAttempted) {
            // Real xcrun simctl install was attempted and must not be a silent success
            // path into maestro (junit is written only after install).
            expect(result.status).not.toBe(0);
          }
          expect(existsSync(join(artifactDir, 'junit.xml'))).toBe(false);
          expect(stderr).not.toContain('"status":"OK"');
        } finally {
          rmSync(emptyBundleDir, { recursive: true, force: true });
          rmSync(artifactDir, { recursive: true, force: true });
        }
      }
    );
  });

  describe('backend', () => {
    it('fails closed when DATABASE_URL is required', () => {
      const result = runHarness(
        ['--check'],
        validHarnessEnv({
          DATABASE_URL: '',
        })
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'DATABASE_URL is required; no database substitute is allowed'
      );
    });

    it('fails closed when FLEET_URL is required', () => {
      const result = runHarness(
        ['--check'],
        validHarnessEnv({
          FLEET_URL: '',
        })
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('FLEET_URL is required; no inference substitute is allowed');
    });

    it('fails closed when DATABASE_URL does not target holocron_nonprod', () => {
      // Pattern-only guard — URL is not reachable and must be rejected before connect.
      const result = runHarness(
        ['--check'],
        validHarnessEnv({
          DATABASE_URL: 'postgres://127.0.0.1:5432/holocron_prod',
        })
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('DATABASE_URL must target holocron_nonprod');
    });
  });
});
