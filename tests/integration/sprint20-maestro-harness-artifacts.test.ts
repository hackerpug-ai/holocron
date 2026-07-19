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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

  describe('harness sanity', () => {
    it('the harness script file exists at the expected path', () => {
      expect(existsSync(HARNESS)).toBe(true);
    });
  });
});
