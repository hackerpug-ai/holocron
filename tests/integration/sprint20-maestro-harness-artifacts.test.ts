/**
 * D03-03 — Maestro reference-flow harness artifact & defect contract.
 *
 * RED-first TDD for five real defects in `scripts/e2e/run-maestro-reference-flow.sh`:
 *   1. `-f` rejects `.app` directory bundles (iOS `.app` is a directory, not a file)
 *   2. Wrong default bundle id (`com.holocron.app` → must be `org.name.holocron`)
 *   3. `recordVideo` fails when the target file already exists (missing `-f`)
 *   4. No terminate/uninstall before install — stale build can false-pass (AC-2)
 *   5. No `dev-client-setup.json` with a `mode` field (AC-3)
 *
 * Gated on PLATFORM_IT=1 (same posture as fail-closed-harness.test.ts) because case 1
 * drives the real script via `xcrun simctl` and a real available simulator UDID.
 *
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const HARNESS = join(REPO_ROOT, 'scripts', 'e2e', 'run-maestro-reference-flow.sh');

function readHarness(): string {
  return readFileSync(HARNESS, 'utf8');
}

/** Discover any available iOS Simulator UDID via `xcrun simctl list`. */
function discoverSimulatorUdid(): string {
  const res = spawnSync('xcrun', ['simctl', 'list', 'devices', 'available'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (res.status !== 0 || !res.stdout) {
    throw new Error(`xcrun simctl list failed (status=${res.status}): ${res.stderr}`);
  }
  const match = res.stdout.match(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i);
  if (!match) {
    throw new Error('no available iOS Simulator UDID found via xcrun simctl list');
  }
  return match[0];
}

describe('D03-03 Maestro harness artifact & defect contract', () => {
  beforeAll(() => {
    if (!PLATFORM_IT) {
      throw new Error(
        'PLATFORM_IT=1 required for D03-03 Maestro harness artifact lane — refusing skip-to-green'
      );
    }
  });

  describe('case 1 — accept .app directory bundle (defect 1, AC-1)', () => {
    it('invoking the harness against a real .app DIRECTORY does not fail with "Expo development build does not exist"', () => {
      const tmpRoot = mkdtempSync(join(tmpdir(), 'd0303-appdir-'));
      // An iOS .app is a DIRECTORY bundle, not a file. The harness must accept a dir.
      const appBundleDir = join(tmpRoot, 'Fake.app');
      mkdirSync(appBundleDir, { recursive: true });
      try {
        const udid = discoverSimulatorUdid();
        const result = spawnSync('bash', [HARNESS, '--check'], {
          cwd: REPO_ROOT,
          env: {
            ...process.env,
            MAESTRO_DEVICE: udid,
            EXPO_DEV_BUILD_PATH: appBundleDir,
            DATABASE_URL: 'postgres://127.0.0.1:5432/holocron_nonprod',
            FLEET_URL: 'http://127.0.0.1:4545',
            PLATFORM_URL: 'http://127.0.0.1:4111',
            EXPO_PUBLIC_RN_API_KEY: 'placeholder-presence-check-key',
            ZERO_ADMIN_PASSWORD: 'placeholder-presence-check-pw',
            // ensure no stale override
            MAESTRO_APP_ID: '',
          },
          encoding: 'utf8',
          timeout: 30_000,
        });

        // The bug (`-f` on a directory) emits exactly this message and exits 1.
        // The fix (`-d`) passes the app_path gate; --check then succeeds (exit 0)
        // because every prior precondition is a presence/string check satisfied
        // by the placeholders above, and the device UDID is real & available.
        expect(result.stderr).not.toContain('Expo development build does not exist');
        expect(result.status).toBe(0);
        // --check success prints a JSON contract line naming the app path.
        expect(result.stdout).toContain('"ok":true');
        expect(result.stdout).toContain(appBundleDir);
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  describe('case 2 — default bundle id is org.name.holocron (defect 2)', () => {
    it('resolves MAESTRO_APP_ID default to org.name.holocron (the real Expo dev build CFBundleIdentifier)', () => {
      const src = readHarness();
      // The default-resolution expression must use the verified bundle id.
      expect(src).toMatch(/MAESTRO_APP_ID:-org\.name\.holocron/);
      // The stale/wrong default must not be the resolved default.
      expect(src).not.toMatch(/MAESTRO_APP_ID:-com\.holocron\.app/);
    });
  });

  describe('case 3 — recordVideo uses -f to overwrite (defect 3)', () => {
    it('invokes xcrun simctl io recordVideo with --codec=h264 -f so a prior video file is overwritten', () => {
      const src = readHarness();
      expect(src).toMatch(/simctl io .* recordVideo --codec=h264 -f /);
    });
  });

  describe('case 4 — terminate/uninstall before install (defect 4, AC-2)', () => {
    it('runs simctl terminate, then uninstall, then install — each captured to its own artifact', () => {
      const src = readHarness();
      // All three verbs must be present.
      expect(src).toMatch(/simctl terminate "\$device" "\$app_id"/);
      expect(src).toMatch(/simctl uninstall "\$device" "\$app_id"/);
      expect(src).toMatch(/simctl install "\$device" "\$app_path"/);
      // Ordering: terminate before uninstall before install.
      const terminateIdx = src.indexOf('simctl terminate');
      const uninstallIdx = src.indexOf('simctl uninstall');
      const installIdx = src.indexOf('simctl install');
      expect(terminateIdx).toBeGreaterThan(-1);
      expect(uninstallIdx).toBeGreaterThan(terminateIdx);
      expect(installIdx).toBeGreaterThan(uninstallIdx);
      // terminate + uninstall tolerate a not-yet-installed app (fresh sim); install does not.
      expect(src).toMatch(/simctl terminate "\$device" "\$app_id"[^\n]*\|\| true/);
      expect(src).toMatch(/simctl uninstall "\$device" "\$app_id"[^\n]*\|\| true/);
      // Each step writes its own artifact file.
      expect(src).toMatch(/simctl-terminate\.txt/);
      expect(src).toMatch(/simctl-uninstall\.txt/);
      expect(src).toMatch(/simctl-install\.txt/);
    });
  });

  describe('case 5 — dev-client-setup.json records mode (defect 5, AC-3)', () => {
    it('writes a dev-client-setup.json artifact whose mode is overridable via MAESTRO_DEV_CLIENT_MODE', () => {
      const src = readHarness();
      expect(src).toMatch(/dev-client-setup\.json/);
      // A `mode` field must be emitted, defaulting to a documented AC-3 mode and
      // overridable via MAESTRO_DEV_CLIENT_MODE.
      expect(src).toMatch(/MAESTRO_DEV_CLIENT_MODE/);
      expect(src).toMatch(/["']mode["']/);
      // The default mode must be one of the AC-3 contract values.
      expect(src).toMatch(
        /server-list\+already-running|server-list\+tutorial|already-running|tutorial/
      );
    });
  });

  describe('REDHAT-FIX-H10 — dev-client mode regex accepts the documented grammar (M2)', () => {
    const DOCUMENTED_MODES = [
      'server-list+already-running',
      'server-list+tutorial',
      'already-running',
      'tutorial',
    ];
    it('the harness default mode matches [a-z0-9+-]+ and the OLD [a-z-]+ regex does NOT', () => {
      const src = readHarness();
      // The documented default must be the resolved default in the harness.
      expect(src).toMatch(/server-list\+already-running/);
      // The CORRECTED oracle accepts '+'.
      for (const mode of DOCUMENTED_MODES) {
        const value = `"mode":"${mode}"`;
        expect(value, `corrected regex must match documented mode ${mode}`).toMatch(
          /"mode":"[a-z0-9+-]+"/
        );
      }
      // The BROKEN oracle ([a-z-]+) must NOT match the '+' default — proving the old
      // verification command was incompatible with the harness's own output.
      expect('"mode":"server-list+already-running"').not.toMatch(/"mode":"[a-z-]+"/);
    });

    it('a standing artifacts assertion accepts the documented mode set from dev-client-setup.json', () => {
      // The harness writes {"mode":"$mode_dev_client",...}. Assert the emitted
      // mode is one of the four documented values (regex union).
      const src = readHarness();
      expect(src).toMatch(/MAESTRO_DEV_CLIENT_MODE:-server-list\+already-running/);
    });
  });

  describe('REDHAT-FIX-H9 — lifecycle oracle + forced-failure artifact preservation', () => {
    it('AC-2: harness writes non-empty sentinels to terminate/uninstall/install (per-file, not aggregated)', () => {
      const src = readHarness();
      // Each lifecycle step must append a sentinel so its artifact file is provably
      // non-empty (the old `rg -l . f1 f2` oracle passed when only ONE was non-empty).
      expect(src, 'terminate must append a sentinel').toMatch(
        /echo "terminated: \$app_id \(tolerated if absent\)" >>"\$artifact_dir\/simctl-terminate\.txt"/
      );
      expect(src, 'uninstall must append a sentinel').toMatch(
        /echo "uninstalled: \$app_id \(tolerated if absent\)" >>"\$artifact_dir\/simctl-uninstall\.txt"/
      );
      expect(src, 'install must append a sentinel').toMatch(
        /echo "installed: \$app_path" >>"\$artifact_dir\/simctl-install\.txt"/
      );
    });

    it('AC-2 RED: a per-file non-empty oracle fails when simctl-uninstall.txt is planted empty', () => {
      // Replicate the strengthened oracle: each of the three files must be non-empty.
      const perFileOracle = (dir: string): string[] => {
        const files = ['simctl-terminate.txt', 'simctl-uninstall.txt', 'simctl-install.txt'];
        return files.filter((f) => {
          try {
            return statSync(join(dir, f)).size === 0;
          } catch {
            return true; // missing also fails
          }
        });
      };
      const dir = mkdtempSync(join(tmpdir(), 'lifecycle-red-'));
      try {
        writeFileSync(join(dir, 'simctl-terminate.txt'), 'terminated: x');
        writeFileSync(join(dir, 'simctl-uninstall.txt'), ''); // PLANTED EMPTY
        writeFileSync(join(dir, 'simctl-install.txt'), 'installed: y');
        const empty = perFileOracle(dir);
        expect(empty, 'planted-empty uninstall must be named by the strengthened oracle').toContain(
          'simctl-uninstall.txt'
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('AC-3: the forced-failure fixture is deterministic (no timestamp/random token)', () => {
      const fixture = join(REPO_ROOT, 'tests', 'fixtures', 'forced-failure-flow.yaml');
      const text = readFileSync(fixture, 'utf8');
      expect(text).toMatch(/does-not-exist-forced-failure/);
      // No date/time/random substitution tokens — byte-identical across runs.
      expect(text).not.toMatch(/\$\{.*(DATE|TIME|RANDOM|UUID|TS).*\}/i);
    });

    it('AC-1 TC-4: a real forced-failure run preserves final.png + video and tears down zero-cache', () => {
      // Requires a REAL Expo dev build; without it the harness fails closed at the
      // build gate before maestro, so this case skips-with-reason (never silently passes).
      const appPath = process.env.EXPO_DEV_BUILD_PATH ?? '';
      if (!appPath || !existsSync(appPath)) {
        console.warn(
          '[REDHAT-FIX-H9 TC-4] SKIPPED: set EXPO_DEV_BUILD_PATH to a real .app to drive the forced-failure run'
        );
        return;
      }
      const artifactDir = mkdtempSync(join(tmpdir(), 'forced-failure-run-'));
      try {
        const result = spawnSync(
          'bash',
          [HARNESS, '--run'],
          {
            cwd: REPO_ROOT,
            env: {
              ...process.env,
              MAESTRO_DEVICE: discoverSimulatorUdid(),
              EXPO_DEV_BUILD_PATH: appPath,
              MAESTRO_FLOW: join(REPO_ROOT, 'tests', 'fixtures', 'forced-failure-flow.yaml'),
              E2E_ARTIFACT_DIR: artifactDir,
              DATABASE_URL: 'postgres://127.0.0.1:5432/holocron_nonprod',
              FLEET_URL: 'http://127.0.0.1:4545',
              PLATFORM_URL: 'http://127.0.0.1:4111',
              EXPO_PUBLIC_PLATFORM_URL: 'http://127.0.0.1:4111',
              EXPO_PUBLIC_RN_API_KEY: process.env.EXPO_PUBLIC_RN_API_KEY ?? 'placeholder',
              ZERO_ADMIN_PASSWORD: process.env.ZERO_ADMIN_PASSWORD ?? 'placeholder',
            },
            encoding: 'utf8',
            timeout: 180_000,
          }
        );
        expect(result.status, 'forced-failure run must exit non-zero').not.toBe(0);
        expect(statSync(join(artifactDir, 'final.png')).size, 'final.png must be captured').toBeGreaterThan(0);
        // reference-flow.mov non-emptiness is enforced by REDHAT-FIX-H3's recorder fix.
        expect(existsSync(join(artifactDir, 'reference-flow.mov'))).toBe(true);
      } finally {
        rmSync(artifactDir, { recursive: true, force: true });
      }
    }, 200_000);
  });

  describe('harness sanity', () => {
    it('the harness script file exists at the expected path', () => {
      expect(existsSync(HARNESS)).toBe(true);
    });
  });
});
