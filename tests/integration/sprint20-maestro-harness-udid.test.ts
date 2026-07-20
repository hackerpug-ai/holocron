import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HARNESS = join(REPO_ROOT, 'scripts', 'e2e', 'run-maestro-reference-flow.sh');
const APP_ID = 'org.name.holocron';

type Simulator = {
  isAvailable?: boolean;
  name: string;
  udid: string;
};

function listAvailableSimulators(): Simulator[] {
  const result = spawnSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (result.status !== 0) {
    throw new Error(`xcrun simctl JSON query failed: ${result.stderr}`);
  }

  const data = JSON.parse(result.stdout) as {
    devices: Record<string, Simulator[]>;
  };
  return Object.values(data.devices)
    .flat()
    .filter((simulator) => simulator.isAvailable !== false);
}

function validCheckEnv(
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
    MAESTRO_APP_ID: APP_ID,
    ...overrides,
  };
}

function runCheck(env: NodeJS.ProcessEnv) {
  return spawnSync('bash', [HARNESS, '--check'], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

function installFakeXcrun(binDir: string, deviceName: string, devices: Simulator[]): void {
  const payload = JSON.stringify({
    devices: { 'com.apple.CoreSimulator.SimRuntime.fixture': devices },
  });
  const escapedPayload = payload.replaceAll("'", "'\\''");
  const script = `#!/usr/bin/env bash
if [[ "$*" == *"--json"* ]]; then
  printf '%s\\n' '${escapedPayload}'
else
  printf '%s\\n' '${deviceName} (Shutdown)'
fi
`;
  const xcrun = join(binDir, 'xcrun');
  writeFileSync(xcrun, script);
  chmodSync(xcrun, 0o755);
}

describe('Sprint 20 Maestro harness name-to-UDID resolution', () => {
  beforeAll(() => {
    if (!PLATFORM_IT) {
      throw new Error(
        'PLATFORM_IT=1 required for Maestro harness UDID resolution scenarios — refusing skip-to-green'
      );
    }
  });

  it('resolves a real available simulator name to one UDID for Maestro', () => {
    const simulators = listAvailableSimulators();
    const counts = new Map<string, number>();
    for (const simulator of simulators) {
      counts.set(simulator.name, (counts.get(simulator.name) ?? 0) + 1);
    }
    const simulator = simulators.find((candidate) => counts.get(candidate.name) === 1);
    if (!simulator) {
      throw new Error(
        'no uniquely named available simulator found for the live resolution scenario'
      );
    }

    const appDir = mkdtempSync(join(tmpdir(), 'maestro-udid-app-'));
    try {
      const result = runCheck(
        validCheckEnv(simulator.name, {
          EXPO_DEV_BUILD_PATH: appDir,
        })
      );

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(`"device":"${simulator.name}"`);
      expect(result.stdout).toContain(`"device_udid":"${simulator.udid}"`);
      expect(result.stdout).not.toContain(`"device":"${simulator.udid}"`);
    } finally {
      rmSync(appDir, { recursive: true, force: true });
    }
  });

  it.each([
    {
      label: 'no exact available match',
      devices: [] as Simulator[],
      expected: 'could not resolve one exact available UDID',
    },
    {
      label: 'ambiguous exact available match',
      devices: [
        { name: 'Fixture iPhone', udid: '11111111-1111-1111-1111-111111111111' },
        { name: 'Fixture iPhone', udid: '22222222-2222-2222-2222-222222222222' },
      ],
      expected: 'could not resolve one exact available UDID',
    },
  ])('$label fails closed without a name-as-UDID fallback', ({ devices, expected }) => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'maestro-udid-resolution-'));
    const binDir = join(fixtureRoot, 'bin');
    const appDir = join(fixtureRoot, 'Fixture.app');
    mkdirSync(binDir);
    mkdirSync(appDir);
    installFakeXcrun(binDir, 'Fixture iPhone', devices);

    try {
      const result = runCheck(
        validCheckEnv('Fixture iPhone', {
          EXPO_DEV_BUILD_PATH: appDir,
          PATH: `${binDir}:${process.env.PATH ?? ''}`,
        })
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(expected);
      expect(result.stdout).not.toContain('"ok":true');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('keeps the configured name on simctl and passes only the resolved UDID to Maestro', () => {
    const source = readFileSync(HARNESS, 'utf8');

    expect(source).toContain('maestro --device "$device_udid"');
    expect(source).toContain('xcrun simctl bootstatus "$device"');
    expect(source).toContain('xcrun simctl uninstall "$device" "$app_id"');
    expect(source).toContain('xcrun simctl install "$device" "$app_path"');
    expect(source).toContain('"device":"%s","device_udid":"%s"');
    expect(source).not.toMatch(/maestro --(?:device|udid) "\$device"/);
  });
});
