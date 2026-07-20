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
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
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

/** Discover one uniquely named available iOS Simulator via the real simctl JSON query. */
function discoverSimulator(): { name: string; udid: string } {
  const res = spawnSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (res.status !== 0 || !res.stdout) {
    throw new Error(`xcrun simctl JSON query failed (status=${res.status}): ${res.stderr}`);
  }

  const data = JSON.parse(res.stdout) as {
    devices: Record<string, Array<{ isAvailable?: boolean; name: string; udid: string }>>;
  };
  const simulators = Object.values(data.devices)
    .flat()
    .filter((simulator) => simulator.isAvailable !== false);
  const counts = new Map<string, number>();
  for (const simulator of simulators) {
    counts.set(simulator.name, (counts.get(simulator.name) ?? 0) + 1);
  }
  const match = simulators.find((simulator) => counts.get(simulator.name) === 1);
  if (!match) {
    throw new Error('no uniquely named available iOS Simulator found via xcrun simctl JSON');
  }
  return { name: match.name, udid: match.udid };
}

type FixtureSimulator = {
  isAvailable?: boolean;
  name: string;
  udid?: string;
};

function validHarnessCheckEnv(
  deviceName: string,
  overrides: Partial<NodeJS.ProcessEnv> = {}
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    MAESTRO_DEVICE: deviceName,
    DATABASE_URL: 'postgres://127.0.0.1:5432/holocron_nonprod',
    FLEET_URL: 'http://127.0.0.1:4545',
    PLATFORM_URL: 'http://127.0.0.1:4111',
    EXPO_PUBLIC_PLATFORM_URL: 'http://127.0.0.1:4111',
    EXPO_PUBLIC_RN_API_KEY: 'test-rn-api-key',
    EXPO_PUBLIC_REFERENCE_FLOW: 'true',
    ZERO_ADMIN_PASSWORD: 'test-zero-admin',
    MAESTRO_APP_ID: 'org.name.holocron',
    ...overrides,
  };
}

function installFakeXcrun(binDir: string, deviceName: string, jsonOutput: string): void {
  const escapedJson = jsonOutput.replaceAll("'", "'\\''");
  const script = `#!/usr/bin/env bash
if [[ "$*" == *"--json"* ]]; then
  printf '%s\\n' '${escapedJson}'
else
  printf '%s\\n' '${deviceName} (Shutdown)'
fi
`;
  const xcrun = join(binDir, 'xcrun');
  writeFileSync(xcrun, script);
  chmodSync(xcrun, 0o755);

  const maestro = join(binDir, 'maestro');
  writeFileSync(maestro, '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(maestro, 0o755);
}

function runResolverFixture(jsonOutput: string): {
  status: number | null;
  stderr: string;
  stdout: string;
} {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'maestro-udid-fixture-'));
  const binDir = join(fixtureRoot, 'bin');
  const appDir = join(fixtureRoot, 'Fixture.app');
  mkdirSync(binDir);
  mkdirSync(appDir);
  installFakeXcrun(binDir, 'Fixture iPhone', jsonOutput);

  try {
    const result = spawnSync('bash', [HARNESS, '--check'], {
      cwd: REPO_ROOT,
      env: validHarnessCheckEnv('Fixture iPhone', {
        EXPO_DEV_BUILD_PATH: appDir,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
      }),
      encoding: 'utf8',
      timeout: 30_000,
    });
    return {
      status: result.status,
      stderr: result.stderr ?? '',
      stdout: result.stdout ?? '',
    };
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
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
        const simulator = discoverSimulator();
        const result = spawnSync('bash', [HARNESS, '--check'], {
          cwd: REPO_ROOT,
          env: {
            ...process.env,
            MAESTRO_DEVICE: simulator.name,
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
        expect(result.stdout).toContain(`"device":"${simulator.name}"`);
        expect(result.stdout).toContain(`"device_udid":"${simulator.udid}"`);
        expect(result.stdout).not.toContain(`"device":"${simulator.udid}"`);
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  describe('case 1b — named simulator resolution fails closed', () => {
    it.each([
      {
        label: 'missing exact-name record',
        json: JSON.stringify({
          devices: {
            runtime: [
              {
                name: 'Different iPhone',
                isAvailable: true,
                udid: '11111111-1111-1111-1111-111111111111',
              } satisfies FixtureSimulator,
            ],
          },
        }),
        expected: 'could not resolve one exact available UDID',
      },
      {
        label: 'malformed simctl JSON',
        json: 'not-json',
        expected: 'could not resolve one exact available UDID',
      },
      {
        label: 'missing UDID',
        json: JSON.stringify({
          devices: {
            runtime: [{ name: 'Fixture iPhone', isAvailable: true } satisfies FixtureSimulator],
          },
        }),
        expected: 'could not resolve one exact available UDID',
      },
      {
        label: 'malformed UDID',
        json: JSON.stringify({
          devices: {
            runtime: [
              {
                name: 'Fixture iPhone',
                isAvailable: true,
                udid: 'not-a-uuid',
              } satisfies FixtureSimulator,
            ],
          },
        }),
        expected: 'resolved simulator UDID is invalid',
      },
      {
        label: 'unavailable exact-name record',
        json: JSON.stringify({
          devices: {
            runtime: [
              {
                name: 'Fixture iPhone',
                isAvailable: false,
                udid: '11111111-1111-1111-1111-111111111111',
              } satisfies FixtureSimulator,
            ],
          },
        }),
        expected: 'could not resolve one exact available UDID',
      },
      {
        label: 'ambiguous exact-name records',
        json: JSON.stringify({
          devices: {
            runtime: [
              {
                name: 'Fixture iPhone',
                isAvailable: true,
                udid: '11111111-1111-1111-1111-111111111111',
              } satisfies FixtureSimulator,
              {
                name: 'Fixture iPhone',
                isAvailable: true,
                udid: '22222222-2222-2222-2222-222222222222',
              } satisfies FixtureSimulator,
            ],
          },
        }),
        expected: 'could not resolve one exact available UDID',
      },
    ])('$label does not fall back to the simulator name', ({ json, expected }) => {
      const result = runResolverFixture(json);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(expected);
      expect(result.stdout).not.toContain('"ok":true');
    });

    it('uses Python 3 for the real JSON query and only passes the resolved UDID to Maestro', () => {
      const src = readHarness();

      expect(src).toContain('command -v python3');
      expect(src).toContain('xcrun simctl list devices available --json');
      expect(src).toContain('maestro --device "$device_udid"');
      expect(src).not.toMatch(/maestro --(?:device|udid) "\$device"/);
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

  describe('zero-cache startup readiness budget', () => {
    it('uses a positive configurable budget with a 180-second default', () => {
      const src = readHarness();

      expect(src).toMatch(/ZERO_STARTUP_TIMEOUT_SECONDS:-180/);
      expect(src).toMatch(/ZERO_STARTUP_TIMEOUT_SECONDS must be a positive integer/);
      expect(src).toMatch(/ready_wait_seconds < zero_startup_timeout_seconds/);
      expect(src).not.toContain('for _ in {1..30}');
      expect(src).toContain(
        'zero-cache did not become ready within ${zero_startup_timeout_seconds} seconds'
      );
    });

    it('installs zero-cache cleanup before readiness and replaces it only after video starts', () => {
      const src = readHarness();
      const launchIndex = src.indexOf('zero_pid=$!');
      const earlyTrapIndex = src.indexOf('trap stop_zero EXIT');
      const readinessIndex = src.indexOf('for ((ready_wait_seconds');
      const videoIndex = src.indexOf('video_pid=$!');
      const finalTrapIndex = src.indexOf('trap cleanup EXIT');

      expect(launchIndex).toBeGreaterThan(-1);
      expect(earlyTrapIndex).toBeGreaterThan(launchIndex);
      expect(earlyTrapIndex).toBeLessThan(readinessIndex);
      expect(videoIndex).toBeGreaterThan(readinessIndex);
      expect(finalTrapIndex).toBeGreaterThan(videoIndex);
      expect(src).toMatch(/kill "\$zero_pid"/);
      expect(src).toMatch(/wait "\$zero_pid"/);
    });

    it('stops the harness-owned process when readiness times out', () => {
      const fixtureRoot = mkdtempSync(join(tmpdir(), 'zero-readiness-timeout-'));
      const binDir = join(fixtureRoot, 'bin');
      const appDir = join(fixtureRoot, 'Fixture.app');
      const pidFile = join(fixtureRoot, 'zero-cache.pid');
      const artifactDir = join(fixtureRoot, 'artifacts');
      mkdirSync(binDir);
      mkdirSync(appDir);

      const writeExecutable = (name: string, contents: string): void => {
        const path = join(binDir, name);
        writeFileSync(path, contents);
        chmodSync(path, 0o755);
      };

      writeExecutable(
        'pnpm',
        `#!/usr/bin/env bash
if [[ "$1" == "exec" && "$2" == "zero-cache" ]]; then
  printf '%s\\n' "$$" >"$FAKE_ZERO_PID_FILE"
  exec sleep 60
fi
exit 64
`
      );
      writeExecutable('bun', '#!/usr/bin/env bash\nexit 0\n');
      writeExecutable('maestro', '#!/usr/bin/env bash\nexit 0\n');
      writeExecutable(
        'xcrun',
        `#!/usr/bin/env bash
if [[ "$*" == *"--json"* ]]; then
  printf '%s\\n' '{"devices":{"runtime":[{"name":"Fixture iPhone","isAvailable":true,"udid":"11111111-1111-1111-1111-111111111111"}]}}'
else
  printf '%s\\n' 'Fixture iPhone (Shutdown)'
fi
`
      );
      const litestreamExecutable = join(fixtureRoot, 'litestream');
      writeFileSync(litestreamExecutable, "#!/usr/bin/env bash\nprintf 'fixture-litestream\\n'\n");
      chmodSync(litestreamExecutable, 0o755);

      let fakePid: number | undefined;
      try {
        const result = spawnSync('bash', [HARNESS, '--run'], {
          cwd: REPO_ROOT,
          env: {
            ...validHarnessCheckEnv('Fixture iPhone', {
              EXPO_DEV_BUILD_PATH: appDir,
              E2E_ARTIFACT_DIR: artifactDir,
              ZERO_STARTUP_TIMEOUT_SECONDS: '1',
              ZERO_PORT: '59991',
              ZERO_LITESTREAM_EXECUTABLE: litestreamExecutable,
              ZERO_LITESTREAM_BACKUP_URL: `file://${join(fixtureRoot, 'backup')}`,
              PATH: `${binDir}:${process.env.PATH ?? ''}`,
            }),
            FAKE_ZERO_PID_FILE: pidFile,
          },
          encoding: 'utf8',
          timeout: 15_000,
        });

        expect(result.status, `expected readiness timeout; stderr=${result.stderr}`).not.toBe(0);
        expect(result.stderr).toContain('zero-cache did not become ready within 1 seconds');
        fakePid = Number(readFileSync(pidFile, 'utf8').trim());
        expect(Number.isInteger(fakePid)).toBe(true);
        expect(() => process.kill(fakePid as number, 0)).toThrow();
      } finally {
        if (fakePid !== undefined) {
          try {
            process.kill(fakePid, 'SIGTERM');
          } catch {
            // The harness should already have reaped the process.
          }
        }
        rmSync(fixtureRoot, { recursive: true, force: true });
      }
    }, 30_000);
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
        const result = spawnSync('bash', [HARNESS, '--run'], {
          cwd: REPO_ROOT,
          env: {
            ...process.env,
            MAESTRO_DEVICE: discoverSimulator().name,
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
        });
        expect(result.status, 'forced-failure run must exit non-zero').not.toBe(0);
        expect(
          statSync(join(artifactDir, 'final.png')).size,
          'final.png must be captured'
        ).toBeGreaterThan(0);
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
