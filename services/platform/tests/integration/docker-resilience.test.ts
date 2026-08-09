import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { acquireDisposableDockerLock } from './helpers/docker-lifecycle.ts';

const ROOT = resolve(import.meta.dirname, '../../../..');

const readRepoFile = (relativePath: string): string =>
  readFileSync(resolve(ROOT, relativePath), 'utf8');

type ComposeService = {
  logging?: {
    driver?: string;
    options?: Record<string, string>;
  };
};

describe('Docker disk resilience contracts', () => {
  it('serializes storage-heavy restore runs across processes', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'holocron-docker-lock-'));
    const lockPath = resolve(directory, 'restore.lockdir');
    try {
      const first = acquireDisposableDockerLock(lockPath, 0);
      expect(() => acquireDisposableDockerLock(lockPath, 0)).toThrow(/held by pid/);
      first.release();

      const second = acquireDisposableDockerLock(lockPath, 0);
      second.release();
      expect(existsSync(lockPath)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    'services/platform/deploy/compose/compose.yaml',
    'services/platform/deploy/compose/langfuse.compose.yaml',
  ])('%s bounds every service log', (relativePath) => {
    const compose = parse(readRepoFile(relativePath)) as {
      services?: Record<string, ComposeService>;
    };

    expect(Object.keys(compose.services ?? {}).length).toBeGreaterThan(0);
    for (const [name, service] of Object.entries(compose.services ?? {})) {
      expect(service.logging?.driver, `${name} logging driver`).toBe('local');
      expect(service.logging?.options?.['max-size'], `${name} max-size`).toBe('10m');
      expect(service.logging?.options?.['max-file'], `${name} max-file`).toBe('3');
    }
  });

  it('bounds generated restore targets and labels them for TTL cleanup', () => {
    const source = readRepoFile('scripts/provision-fresh-restore-target.sh');

    expect(source).toContain('HOLO_DOCKER_MIN_FREE_GIB');
    expect(source).toContain('io.holocron.lifecycle: ephemeral');
    expect(source).toContain('io.holocron.owner-pid:');
    expect(source).toContain('io.holocron.expires-at:');
    expect(source).toMatch(/logging:\s*\n\s*driver: local/);
  });

  it('keeps the Docker daemon build cache and default logs bounded', () => {
    const policy = JSON.parse(
      readRepoFile('services/platform/deploy/docker/daemon-resilience.json')
    ) as Record<string, unknown>;

    expect(policy).toMatchObject({
      builder: { gc: { enabled: true, defaultKeepStorage: '5GB' } },
      'log-driver': 'local',
      'log-opts': { 'max-size': '10m', 'max-file': '3' },
    });
  });

  it('installs a five-minute guard that only sweeps labeled ephemeral volumes', () => {
    const plistPath = resolve(
      ROOT,
      'services/platform/deploy/launchd/holocron-docker-disk-guard.plist'
    );
    const guardPath = resolve(ROOT, 'scripts/docker-disk-guard.sh');
    const installer = readRepoFile('scripts/install-docker-resilience.sh');

    expect(existsSync(plistPath)).toBe(true);
    expect(existsSync(guardPath)).toBe(true);
    const lint = spawnSync('/usr/bin/plutil', ['-lint', plistPath], {
      encoding: 'utf8',
    });
    expect(lint.status, lint.stderr || lint.stdout).toBe(0);

    const plist = readFileSync(plistPath, 'utf8');
    expect(plist).toMatch(/<key>StartInterval<\/key>\s*<integer>300<\/integer>/);

    const guard = readFileSync(guardPath, 'utf8');
    const lifecycle = readRepoFile(
      'services/platform/tests/integration/helpers/docker-lifecycle.ts'
    );
    expect(guard).toMatch(/builder prune/);
    expect(guard).toContain('io.holocron.lifecycle=ephemeral');
    expect(guard).toContain('io.holocron.owner-pid');
    expect(guard).toContain('.Config.Labels');
    expect(guard).toMatch(/container rm -f -v/);
    expect(lifecycle).toMatch(/\['rm', '-f', '-v'/);
    expect(guard).not.toMatch(/docker\s+volume\s+prune/);
    expect(installer).toContain('daemon-resilience.json');
    expect(installer).toContain('holocron-docker-disk-guard.plist');
  });

  it('cleans QA25 and D06 namespaces explicitly after every test run', () => {
    const qa25 = readRepoFile(
      'services/platform/tests/integration/sprint28-s28r3-qa25-gate-fix.test.ts'
    );
    const d06 = readRepoFile(
      'services/platform/tests/integration/sprint29-compose-contract.test.ts'
    );

    expect(qa25).toContain('acquireDisposableDockerLock');
    expect(qa25).toContain('cleanupDisposableDockerHost');
    expect(qa25).toMatch(/finally\s*{[\s\S]*cleanupDisposableDockerHost\(REPO_ROOT, host/);
    expect(d06).toContain('cleanupDockerVolumes');
    expect(d06).toMatch(/cleanupDockerVolumes\(\[[\s\S]*project.*postgres/);
  });
});
