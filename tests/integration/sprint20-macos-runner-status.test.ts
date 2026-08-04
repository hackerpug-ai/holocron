/**
 * Sprint 20 D03-02 — macOS e2e runner status (simulator + Expo dev build probes).
 *
 * Live probes require PLATFORM_IT=1 on a macOS host with xcrun.
 * Fail-closed unit-style cases always run (no live runner required).
 *
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-macos-runner-status.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = process.cwd();
const HOLO = 'services/platform/src/cli/holo.ts';
const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const itLive = PLATFORM_IT ? it : it.skip;

function runHolo(
  args: string[],
  env: Partial<NodeJS.ProcessEnv> = {}
): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync('bun', [HOLO, ...args], {
    cwd: REPO,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

function writeStatusFile(dir: string, payload: unknown): string {
  const file = join(dir, 'runner-status.json');
  writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

describe('Sprint 20 macOS e2e runner status (D03-02)', () => {
  it('TC-4: e2e lane fails closed when EXPO_DEV_BUILD_PATH is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'd03-02-runner-'));
    const statusFile = writeStatusFile(dir, {
      online: true,
      runners: [
        {
          name: 'macos-e2e-1',
          status: 'online',
          labels: ['self-hosted', 'holocron', 'e2e'],
        },
      ],
    });

    const r = runHolo(['ci', 'runner:status', '--json', '--lane', 'e2e'], {
      HOLO_RUNNER_STATUS_FILE: statusFile,
      MAESTRO_DEVICE: process.env.MAESTRO_DEVICE || 'iPhone 17',
      EXPO_DEV_BUILD_PATH: join(dir, 'does-not-exist.app'),
      // Prevent accidental GitHub API fallback.
      GITHUB_TOKEN: '',
      GH_TOKEN: '',
    });

    expect(r.status).not.toBe(0);
    const body = JSON.parse(r.stdout || '{}') as {
      online?: boolean;
      ok?: boolean;
      build_present?: boolean;
      simulator_present?: boolean;
      errors?: string[];
      lane?: string;
    };
    expect(body.lane).toBe('e2e');
    expect(body.online).toBe(false);
    expect(body.ok).toBe(false);
    expect(body.build_present).toBe(false);
    expect((body.errors ?? []).join(' ').toLowerCase()).toMatch(/build/);
  });

  it('TC-4b: e2e lane fails closed when MAESTRO_DEVICE is unset', () => {
    const dir = mkdtempSync(join(tmpdir(), 'd03-02-runner-'));
    const statusFile = writeStatusFile(dir, {
      online: true,
      runners: [
        {
          name: 'macos-e2e-1',
          status: 'online',
          labels: ['self-hosted', 'holocron', 'e2e'],
        },
      ],
    });
    // Create a fake-valid .app so only simulator fails.
    const app = join(dir, 'holocron.app');
    mkdirSync(app);
    writeFileSync(join(app, 'Info.plist'), '<?xml version="1.0"?><plist></plist>');

    const r = runHolo(['ci', 'runner:status', '--json', '--lane', 'e2e'], {
      HOLO_RUNNER_STATUS_FILE: statusFile,
      MAESTRO_DEVICE: '',
      EXPO_DEV_BUILD_PATH: app,
      GITHUB_TOKEN: '',
      GH_TOKEN: '',
    });

    expect(r.status).not.toBe(0);
    const body = JSON.parse(r.stdout || '{}') as {
      online?: boolean;
      simulator_present?: boolean;
      errors?: string[];
    };
    expect(body.online).toBe(false);
    expect(body.simulator_present).toBe(false);
    expect((body.errors ?? []).join(' ')).toMatch(/MAESTRO_DEVICE|simulator/i);
  });

  it('integration lane ignores simulator/build probes (backward compatible)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'd03-02-runner-'));
    const statusFile = writeStatusFile(dir, {
      online: true,
      runners: [
        {
          name: 'mini-1',
          status: 'online',
          labels: ['self-hosted', 'holocron', 'integration'],
        },
      ],
    });

    const r = runHolo(['ci', 'runner:status', '--json', '--lane', 'integration'], {
      HOLO_RUNNER_STATUS_FILE: statusFile,
      MAESTRO_DEVICE: '',
      EXPO_DEV_BUILD_PATH: '',
      GITHUB_TOKEN: '',
      GH_TOKEN: '',
    });

    expect(r.status).toBe(0);
    const body = JSON.parse(r.stdout || '{}') as {
      online?: boolean;
      lane?: string;
      simulator_present?: boolean;
    };
    expect(body.online).toBe(true);
    expect(body.lane).toBe('integration');
    expect(body.simulator_present).toBeUndefined();
  });

  it('e2e lane fails closed without e2e label even if integration labels present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'd03-02-runner-'));
    const statusFile = writeStatusFile(dir, {
      online: true,
      runners: [
        {
          name: 'integration-only',
          status: 'online',
          labels: ['self-hosted', 'holocron', 'integration'],
        },
      ],
    });
    const app = join(dir, 'holocron.app');
    mkdirSync(app);
    writeFileSync(join(app, 'Info.plist'), '<?xml version="1.0"?><plist></plist>');

    const r = runHolo(['ci', 'runner:status', '--json', '--lane', 'e2e'], {
      HOLO_RUNNER_STATUS_FILE: statusFile,
      MAESTRO_DEVICE: 'iPhone 17',
      EXPO_DEV_BUILD_PATH: app,
      GITHUB_TOKEN: '',
      GH_TOKEN: '',
    });

    expect(r.status).not.toBe(0);
    const body = JSON.parse(r.stdout || '{}') as {
      online?: boolean;
      errors?: string[];
    };
    expect(body.online).toBe(false);
    expect((body.errors ?? []).join(' ')).toMatch(/required labels|e2e/);
  });

  itLive('TC-1 live: e2e lane online when runner file + real sim + real build present', () => {
    const device = process.env.MAESTRO_DEVICE || 'iPhone 17';
    const buildPath = process.env.EXPO_DEV_BUILD_PATH;
    // Residual go-no-go runs with PLATFORM_IT=1 but without a Maestro/Expo
    // coldboot substrate. Fail-closed TC-4 already covers missing build; live
    // TC-1 only runs when an operator supplies a real .app path.
    if (!buildPath || !existsSync(buildPath)) {
      console.warn(
        '[D03-02 TC-1] SKIPPED: set EXPO_DEV_BUILD_PATH to a real .app (scripts/e2e/build-expo-dev-client.sh)'
      );
      return;
    }

    const dir = mkdtempSync(join(tmpdir(), 'd03-02-runner-live-'));
    const statusFile = writeStatusFile(dir, {
      online: true,
      runners: [
        {
          name: 'macos-e2e-live',
          status: 'online',
          labels: ['self-hosted', 'holocron', 'e2e', 'integration'],
        },
      ],
    });

    const r = runHolo(['ci', 'runner:status', '--json', '--lane', 'e2e'], {
      HOLO_RUNNER_STATUS_FILE: statusFile,
      MAESTRO_DEVICE: device,
      EXPO_DEV_BUILD_PATH: buildPath,
      GITHUB_TOKEN: '',
      GH_TOKEN: '',
    });

    expect(r.status).toBe(0);
    const body = JSON.parse(r.stdout || '{}') as {
      online?: boolean;
      simulator_present?: boolean;
      simulator_name?: string;
      build_present?: boolean;
      build_path?: string;
      required_labels?: string[];
    };
    expect(body.online).toBe(true);
    expect(body.simulator_present).toBe(true);
    expect(body.simulator_name).toBe(device);
    expect(body.build_present).toBe(true);
    expect(body.required_labels).toEqual(
      expect.arrayContaining(['self-hosted', 'holocron', 'e2e'])
    );
  });

  it('provision + build scripts are present and executable contracts exist', () => {
    const provision = join(REPO, 'scripts/e2e/provision-ios-simulator.sh');
    const build = join(REPO, 'scripts/e2e/build-expo-dev-client.sh');
    expect(existsSync(provision)).toBe(true);
    expect(existsSync(build)).toBe(true);
    // --help-ish: running with bash -n validates syntax
    const p = spawnSync('bash', ['-n', provision], { encoding: 'utf8' });
    const b = spawnSync('bash', ['-n', build], { encoding: 'utf8' });
    expect(p.status).toBe(0);
    expect(b.status).toBe(0);
  });
});
