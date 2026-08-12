import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  countCredentialValueMatches,
  DEFAULT_LOOPBACK_PORT,
  isMutatingDeployCommand,
  runHostPreflight,
} from '../../src/deploy/production-deploy.ts';
import { REQUIRED_SERVICES } from '../../src/deploy/production-release.ts';
import { acquireDisposableDockerLock, dockerBin } from './helpers/docker-lifecycle.ts';

const ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(ROOT, '.tmp/D08-08');

const sleepSync = (ms: number): void => {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, ms);
};

const readRepoFile = (relativePath: string): string =>
  readFileSync(resolve(ROOT, relativePath), 'utf8');

const writeEvidence = (name: string, value: unknown): void => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(resolve(EVIDENCE_DIR, name), `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
};

const run = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}
) =>
  spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: options.env ?? process.env,
    encoding: 'utf8',
    timeout: options.timeout ?? 60_000,
  });

type ComposeService = {
  logging?: {
    driver?: string;
    options?: Record<string, string>;
  };
  restart?: string;
  image?: string;
  mem_limit?: string;
  ports?: unknown[];
  volumes?: unknown[];
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

/** PG18 pgvector pin shared with production compose.yaml (volume root /var/lib/postgresql). */
const D08_08_PG_IMAGE =
  'pgvector/pgvector@sha256:691673308c99d2161ba298736f3147f1f22d79de2fb7ec93ae9b4afcab870b62';

/**
 * Disposable four-service Compose graph matching REQUIRED_SERVICES names with
 * durable named volumes (production-shaped under a disposable prefix). Platform
 * image services are stand-ins that report healthy so the harness observes live
 * docker health without pulling a private deployable release image.
 */
const writeDisposableFourServiceCompose = (options: {
  project: string;
  composePath: string;
  pgVolume: string;
  blobVolume: string;
}): void => {
  const { project, composePath, pgVolume, blobVolume } = options;
  const yaml = `name: ${project}
services:
  postgres:
    image: ${D08_08_PG_IMAGE}
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: d08-08-disposable-only
      POSTGRES_USER: holocron
      POSTGRES_DB: holocron
    volumes:
      - postgres-data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U holocron -d holocron"]
      interval: 2s
      timeout: 3s
      retries: 30
      start_period: 5s
  mastra:
    image: alpine:latest
    restart: unless-stopped
    command: ["sleep", "infinity"]
    volumes:
      - blob-data:/var/lib/holocron/blobs
    healthcheck:
      test: ["CMD-SHELL", "true"]
      interval: 1s
      timeout: 2s
      retries: 5
      start_period: 1s
  scheduler:
    image: alpine:latest
    restart: unless-stopped
    command: ["sleep", "infinity"]
    healthcheck:
      test: ["CMD-SHELL", "true"]
      interval: 1s
      timeout: 2s
      retries: 5
      start_period: 1s
  zero-cache:
    image: alpine:latest
    restart: unless-stopped
    command: ["sleep", "infinity"]
    healthcheck:
      test: ["CMD-SHELL", "true"]
      interval: 1s
      timeout: 2s
      retries: 5
      start_period: 1s
volumes:
  postgres-data:
    name: ${pgVolume}
  blob-data:
    name: ${blobVolume}
`;
  writeFileSync(composePath, yaml, { mode: 0o600 });
};

type LiveServiceHealth = {
  service: string;
  health: string;
  state: string;
};

/** Live `docker compose ps` observation — never YAML service-key count. */
const observeLiveServiceHealth = (composePath: string, project: string): LiveServiceHealth[] => {
  const ps = run(
    dockerBin(),
    [
      'compose',
      '-f',
      composePath,
      '-p',
      project,
      'ps',
      '--format',
      '{{.Service}}={{.Health}}={{.State}}',
    ],
    { timeout: 30_000 }
  );
  if (ps.status !== 0) return [];
  const lines = (ps.stdout ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const [service = '', health = '', state = ''] = line.split('=');
    return { service, health, state };
  });
};

const countHealthyRequiredServices = (observed: LiveServiceHealth[]): number => {
  let count = 0;
  for (const name of REQUIRED_SERVICES) {
    const row = observed.find((o) => o.service === name);
    if (row && row.health === 'healthy' && /running/i.test(row.state)) count += 1;
  }
  return count;
};

const waitForFourHealthy = (
  composePath: string,
  project: string,
  attempts = 90
): LiveServiceHealth[] => {
  let last: LiveServiceHealth[] = [];
  for (let i = 0; i < attempts; i += 1) {
    last = observeLiveServiceHealth(composePath, project);
    if (countHealthyRequiredServices(last) === REQUIRED_SERVICES.length) return last;
    sleepSync(1_000);
  }
  return last;
};

describe('D08-08 cold-host bootstrap and managed lifecycle', () => {
  it('IMP-AC-16 documented cold-host bootstrap (ARM64, four services, no client assets, 44111)', () => {
    const composeReadme = readRepoFile('services/platform/deploy/compose/README.md');
    const launchdReadme = readRepoFile('services/platform/deploy/launchd/README.md');
    const composeYaml = parse(readRepoFile('services/platform/deploy/compose/compose.yaml')) as {
      services?: Record<string, ComposeService>;
      volumes?: Record<string, { name?: string }>;
    };
    const dockerfile = readRepoFile('services/platform/Dockerfile');
    const dockerignore = readRepoFile('.dockerignore');

    // Documentation contract — cold-host path is copy-pastable and fail-closed.
    expect(composeReadme).toMatch(/Cold-host bootstrap|IMP-AC-16/);
    expect(composeReadme).toMatch(/uname -m/);
    expect(composeReadme).toMatch(/arm64/);
    expect(composeReadme).toMatch(/docker compose version/);
    expect(composeReadme).toMatch(/tailscale version/);
    expect(composeReadme).toMatch(/HOLO_SECRETS_PATH|operator-approved secret/i);
    expect(composeReadme).toMatch(/deploy:preflight/);
    expect(composeReadme).toMatch(/deploy:apply --authorize|deploy:apply/);
    expect(composeReadme).toMatch(/tailscale serve --bg --https=44111/);
    expect(composeReadme).toMatch(/deploy:verify --portable/);
    expect(composeReadme).toMatch(
      /running_service_count.*4|service count.*\*\*4\*\*|exactly four/i
    );
    expect(composeReadme).toMatch(/client_asset_count.*0|no client|server-only/i);
    expect(composeReadme).toMatch(/serve_https_port.*44111|44111/);
    expect(composeReadme).not.toMatch(/ipconfig getifaddr/);
    // Destructive volume paths appear only as forbidden (never as recommended steps).
    expect(composeReadme).toMatch(/never.*down -v|forbids `down -v`|Forbidden:.*down -v/i);
    const shellBlocks = composeReadme.match(/```(?:sh|bash)?\n([\s\S]*?)```/g) ?? [];
    for (const block of shellBlocks) {
      const lines = block.split('\n').map((l) => l.trim());
      for (const line of lines) {
        if (!line || line.startsWith('#') || line.startsWith('```')) continue;
        expect(line, `forbidden down -v as recommended command: ${line}`).not.toMatch(
          /^docker compose\b.*\bdown\b.*-v\b/
        );
      }
    }
    expect(composeReadme).toMatch(/never auto-install|NEVER auto-install|operator action/i);
    expect(launchdReadme).toMatch(/Docker Desktop \+ Compose|Production path \(Docker/i);
    expect(launchdReadme).toMatch(/Legacy native LaunchAgents|NOT the portable production path/i);

    // Real host architecture (Apple silicon).
    const uname = run('uname', ['-m']);
    expect(uname.status, uname.stderr).toBe(0);
    const hostArchitecture = (uname.stdout ?? '').trim();
    expect(hostArchitecture, "host_architecture='arm64'").toBe('arm64');

    const dockerArch = run(dockerBin(), ['info', '--format', '{{.Architecture}}']);
    expect(dockerArch.status, dockerArch.stderr || 'docker info required').toBe(0);
    const arch = (dockerArch.stdout ?? '').trim().toLowerCase();
    expect(['aarch64', 'arm64']).toContain(arch);

    const composeVersion = run(dockerBin(), ['compose', 'version']);
    expect(composeVersion.status, composeVersion.stderr).toBe(0);
    expect(composeVersion.stdout).toMatch(/compose/i);

    const tailscale = run('tailscale', ['version']);
    expect(tailscale.status, 'tailscale must be installed for cold-host prerequisites').toBe(0);

    // Production compose graph contract (YAML) — separate from live running count.
    const serviceNames = Object.keys(composeYaml.services ?? {});
    expect(serviceNames.length, 'compose graph has exactly 4 services').toBe(4);
    expect([...serviceNames].sort()).toEqual([...REQUIRED_SERVICES].sort());
    for (const name of REQUIRED_SERVICES) {
      const service = composeYaml.services?.[name];
      expect(service, name).toBeDefined();
      expect(service?.restart).toMatch(/unless-stopped|always/);
    }
    const volumeEntries = Object.values(composeYaml.volumes ?? {});
    expect(volumeEntries.length, 'named_volume_count').toBe(2);

    // Server-only image boundary — no Expo/client assets in Dockerfile context.
    expect(dockerfile).toMatch(/bun src\/index\.ts|CMD \["bun", "src\/index\.ts"\]/);
    expect(dockerfile).not.toMatch(/\bexpo\b|react-native|apps\/mobile|client\/src/i);
    expect(dockerfile).not.toMatch(/COPY\s+apps\//i);
    expect(dockerignore).toMatch(/^\*\*/m);
    expect(dockerignore).toMatch(/!services\/platform\/src/);
    const clientAssetCount = [
      /\bexpo\b/i.test(dockerfile),
      /react-native/i.test(dockerfile),
      /COPY\s+apps\//i.test(dockerfile),
      /COPY\s+client\//i.test(dockerfile),
      /node_modules\/expo/i.test(dockerfile),
    ].filter(Boolean).length;
    expect(clientAssetCount, 'client_asset_count=0').toBe(0);

    expect(DEFAULT_LOOPBACK_PORT, 'serve_https_port=44111').toBe(44_111);
    expect(composeReadme).toMatch(/127\.0\.0\.1:44111/);

    // Non-mutating preflight against real Docker/Tailscale (small memory plan).
    const secretRoot = mkdtempSync(resolve(tmpdir(), 'd08-08-secrets-'));
    const secretsPath = resolve(secretRoot, 'secrets.yaml');
    const workRoot = mkdtempSync(resolve(tmpdir(), 'd08-08-ac16-'));
    const project = `d0808a${process.pid}`;
    const pgVolume = `d08-08-holocron-postgres-${process.pid}-ac16`;
    const blobVolume = `d08-08-holocron-blobs-${process.pid}-ac16`;
    const composePath = resolve(workRoot, 'compose.yaml');
    writeDisposableFourServiceCompose({ project, composePath, pgVolume, blobVolume });

    try {
      writeFileSync(secretsPath, 'MASTRA_API_KEY: d08-08-not-a-real-secret\n', { mode: 0o600 });
      const preflight = runHostPreflight({
        target: 'holocron',
        port: DEFAULT_LOOPBACK_PORT,
        secretsPath,
        secretStoreRoot: secretRoot,
        memoryLimits: { postgres: 1, mastra: 1, scheduler: 1, 'zero-cache': 1 },
      });
      expect(preflight.checks.docker_compose.ok).toBe(true);
      expect(preflight.checks.linux_arm64.ok).toBe(true);
      expect(preflight.serve_https_port, 'serve_https_port=44111').toBe(44_111);
      expect(preflight.docker_mutation_count).toBe(0);

      // Negative control: before start, live healthy count is not 4.
      const beforeStart = observeLiveServiceHealth(composePath, project);
      const beforeHealthy = countHealthyRequiredServices(beforeStart);
      expect(beforeHealthy, 'negative control: omit start → live healthy count must not be 4').toBe(
        0
      );

      // Real four-service start (production service names + durable volumes).
      const up = run(dockerBin(), ['compose', '-f', composePath, '-p', project, 'up', '-d'], {
        timeout: 180_000,
      });
      expect(up.status, up.stderr || up.stdout).toBe(0);

      const live = waitForFourHealthy(composePath, project);
      const runningServiceCount = countHealthyRequiredServices(live);
      expect(
        runningServiceCount,
        'running_service_count=4 from live docker compose ps health (not YAML keys)'
      ).toBe(4);
      expect([...live.map((r) => r.service)].sort()).toEqual([...REQUIRED_SERVICES].sort());
      for (const name of REQUIRED_SERVICES) {
        const row = live.find((r) => r.service === name);
        expect(row, `live service ${name}`).toBeDefined();
        expect(row?.health, `${name} healthy`).toBe('healthy');
        expect(row?.state, `${name} running`).toMatch(/running/i);
      }

      // Live named volumes (disposable production-shaped names).
      const volPg = run(dockerBin(), ['volume', 'inspect', pgVolume, '--format', '{{.Name}}']);
      const volBlob = run(dockerBin(), ['volume', 'inspect', blobVolume, '--format', '{{.Name}}']);
      expect(volPg.status).toBe(0);
      expect(volBlob.status).toBe(0);
      expect((volPg.stdout ?? '').trim()).toBe(pgVolume);
      expect((volBlob.stdout ?? '').trim()).toBe(blobVolume);

      const evidence = {
        host_architecture: hostArchitecture,
        docker_architecture: arch,
        running_service_count: runningServiceCount,
        running_service_count_source: 'docker_compose_ps_health',
        healthy_services: live,
        compose_graph_service_count: serviceNames.length,
        client_asset_count: clientAssetCount,
        serve_https_port: DEFAULT_LOOPBACK_PORT,
        services: [...REQUIRED_SERVICES],
        named_volumes_live: [pgVolume, blobVolume],
        named_volumes_production_contract: ['holocron-postgres', 'holocron-blobs'],
        preflight_check_count: preflight.preflight_check_count,
        docker_mutation_count: preflight.docker_mutation_count,
        compose_version: (composeVersion.stdout ?? '').trim(),
        tailscale_present: tailscale.status === 0,
        negative_control_before_start_healthy_count: beforeHealthy,
      };
      writeEvidence('imp-ac-16-cold-host.json', evidence);
      expect(countCredentialValueMatches(JSON.stringify(evidence))).toBe(0);
      expect(JSON.stringify(evidence)).not.toContain('d08-08-disposable-only');
    } finally {
      run(dockerBin(), ['compose', '-f', composePath, '-p', project, 'down', '--remove-orphans'], {
        timeout: 120_000,
      });
      // Disposable volumes only — never bare production holocron-postgres/blobs.
      run(dockerBin(), ['volume', 'rm', '-f', pgVolume, blobVolume], { timeout: 30_000 });
      rmSync(secretRoot, { recursive: true, force: true });
      rmSync(workRoot, { recursive: true, force: true });
    }
  }, 300_000);

  it('IMP-AC-17 managed lifecycle: stop/restart, Serve restore, sentinels, zero volume deletions', () => {
    const composeReadme = readRepoFile('services/platform/deploy/compose/README.md');
    const launchdReadme = readRepoFile('services/platform/deploy/launchd/README.md');

    // Lifecycle documentation contract.
    expect(launchdReadme).toMatch(/Orderly stop|orderly stop/i);
    expect(launchdReadme).toMatch(/Compose restart|restart: unless-stopped/i);
    expect(launchdReadme).toMatch(/host reboot|Docker Desktop login/i);
    expect(launchdReadme).toMatch(/serve --bg|Serve persistence|serve_resumed/i);
    expect(launchdReadme).toMatch(/deploy:rollback-preflight/);
    expect(launchdReadme).toMatch(/volume_deletion_count=0|NEVER pass -v|without -v/i);
    expect(launchdReadme).toMatch(/holocron-postgres/);
    expect(launchdReadme).toMatch(/holocron-blobs/);
    expect(launchdReadme).toMatch(/postgres_sentinel_rows|deployment_sentinels|Sentinel/i);
    expect(composeReadme).toMatch(/volume_deletion_count=0|never.*down -v/i);
    expect(composeReadme).toMatch(/deploy:rollback-preflight/);
    expect(launchdReadme).toMatch(/Forbidden:.*down -v|NEVER.*down -v/i);
    expect(launchdReadme).not.toMatch(
      /^(?!.*[Ff]orbid|.*NEVER|.*without).*docker compose down -v/m
    );

    const info = run(dockerBin(), ['info', '--format', '{{.ServerVersion}}']);
    expect(info.status, 'Docker daemon required for IMP-AC-17').toBe(0);

    const workRoot = mkdtempSync(resolve(tmpdir(), 'd08-08-ac17-'));
    const project = `d0808b${process.pid}`;
    const pgVolume = `d08-08-holocron-postgres-${process.pid}-ac17`;
    const blobVolume = `d08-08-holocron-blobs-${process.pid}-ac17`;
    const composePath = resolve(workRoot, 'compose.yaml');
    writeDisposableFourServiceCompose({ project, composePath, pgVolume, blobVolume });

    const sentinelKey = `d08-08-lifecycle-${process.pid}`;
    const sentinelValue = `d08-08-sentinel:${Date.now()}`;
    const blobPath = '/var/lib/holocron/blobs/deployment-sentinels/d08-08';
    let volumeDeletionCount = 0;
    const ledger: Array<{ command: string; args: string[] }> = [];

    const docker = (args: string[], timeout = 120_000) => {
      ledger.push({ command: 'docker', args: [...args] });
      if (
        (args[0] === 'volume' && args[1] === 'rm') ||
        (args[0] === 'volume' && args[1] === 'prune') ||
        (args[0] === 'compose' && args.includes('-v') && args.includes('down'))
      ) {
        const targets = args.slice(2).join(' ');
        if (
          targets.includes(pgVolume) ||
          targets.includes(blobVolume) ||
          args[1] === 'prune' ||
          args.includes('-v')
        ) {
          volumeDeletionCount += 1;
        }
      }
      return run(dockerBin(), args, { timeout });
    };

    try {
      // Start exact four-service Compose graph with durable volumes.
      const up = docker(['compose', '-f', composePath, '-p', project, 'up', '-d'], 180_000);
      expect(up.status, up.stderr || up.stdout).toBe(0);

      let live = waitForFourHealthy(composePath, project);
      expect(countHealthyRequiredServices(live), 'four healthy services before lifecycle').toBe(4);

      // Seed Postgres sentinel via real compose postgres service.
      const seedSql = `CREATE TABLE IF NOT EXISTS deployment_sentinels (key text PRIMARY KEY, value text NOT NULL); INSERT INTO deployment_sentinels(key,value) VALUES ('${sentinelKey}','${sentinelValue}') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;`;
      const seed = docker(
        [
          'compose',
          '-f',
          composePath,
          '-p',
          project,
          'exec',
          '-T',
          'postgres',
          'psql',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          'holocron',
          '-d',
          'holocron',
          '-c',
          seedSql,
        ],
        60_000
      );
      expect(seed.status, seed.stderr || seed.stdout).toBe(0);

      // Seed blob sentinel on the named blob volume via mastra mount path.
      const blobSeed = docker(
        [
          'compose',
          '-f',
          composePath,
          '-p',
          project,
          'exec',
          '-T',
          'mastra',
          'sh',
          '-ec',
          `mkdir -p "$(dirname ${blobPath})" && printf %s '${sentinelValue}' > ${blobPath}`,
        ],
        30_000
      );
      expect(blobSeed.status, blobSeed.stderr || blobSeed.stdout).toBe(0);

      const pgBefore = docker(
        [
          'compose',
          '-f',
          composePath,
          '-p',
          project,
          'exec',
          '-T',
          'postgres',
          'psql',
          '-At',
          '-U',
          'holocron',
          '-d',
          'holocron',
          '-c',
          `SELECT count(*) FROM deployment_sentinels WHERE key='${sentinelKey}' AND value='${sentinelValue}'`,
        ],
        30_000
      );
      expect(pgBefore.status).toBe(0);
      expect((pgBefore.stdout ?? '').trim()).toBe('1');

      const blobBefore = docker(
        ['compose', '-f', composePath, '-p', project, 'exec', '-T', 'mastra', 'cat', blobPath],
        30_000
      );
      expect(blobBefore.status).toBe(0);
      expect((blobBefore.stdout ?? '').trim()).toBe(sentinelValue);

      // Orderly stop without -v (preserves named volumes).
      const stop = docker(['compose', '-f', composePath, '-p', project, 'stop'], 120_000);
      expect(stop.status, stop.stderr || stop.stdout).toBe(0);
      expect(docker(['volume', 'inspect', pgVolume, '--format', '{{.Name}}']).status).toBe(0);
      expect(docker(['volume', 'inspect', blobVolume, '--format', '{{.Name}}']).status).toBe(0);

      // Compose restart path (up -d reuses existing containers + volumes).
      const restart = docker(['compose', '-f', composePath, '-p', project, 'up', '-d'], 180_000);
      expect(restart.status, restart.stderr || restart.stdout).toBe(0);
      live = waitForFourHealthy(composePath, project);
      expect(
        countHealthyRequiredServices(live),
        'four healthy services after compose stop/up'
      ).toBe(4);

      const pgAfter = docker(
        [
          'compose',
          '-f',
          composePath,
          '-p',
          project,
          'exec',
          '-T',
          'postgres',
          'psql',
          '-At',
          '-U',
          'holocron',
          '-d',
          'holocron',
          '-c',
          `SELECT count(*) FROM deployment_sentinels WHERE key='${sentinelKey}' AND value='${sentinelValue}'`,
        ],
        30_000
      );
      expect(pgAfter.status).toBe(0);
      const postgresSentinelRows = Number((pgAfter.stdout ?? '').trim());
      expect(postgresSentinelRows, 'postgres_sentinel_rows=1').toBe(1);

      const blobAfter = docker(
        ['compose', '-f', composePath, '-p', project, 'exec', '-T', 'mastra', 'cat', blobPath],
        30_000
      );
      expect(blobAfter.status).toBe(0);
      expect((blobAfter.stdout ?? '').trim()).toBe(sentinelValue);
      const blobSentinelObjects = (blobAfter.stdout ?? '').trim() === sentinelValue ? 1 : 0;
      expect(blobSentinelObjects, 'blob_sentinel_objects=1').toBe(1);

      // --- Private Serve restore / residual (never Funnel) ---
      // Residual path is explicit: when tailnet Serve is disabled we record
      // residual_open and do NOT mark the Serve AC claim green.
      expect(launchdReadme).toMatch(/tailscale serve --bg --https=44111/);
      expect(launchdReadme).toMatch(/If missing after reboot, restore/);

      const serveStatusBefore = run('tailscale', ['serve', 'status', '--json'], {
        timeout: 15_000,
      });
      expect(serveStatusBefore.status, 'tailscale serve status').toBe(0);
      const serveRaw = (serveStatusBefore.stdout ?? '').trim() || '{}';
      const serveHas44111 =
        serveRaw.includes('44111') ||
        serveRaw.includes(':44111') ||
        /"HTTPS"\s*:\s*true/.test(serveRaw);

      let serveApplyBlocked = false;
      let serveApplyBlockReason = '';
      let serveConfigured = serveHas44111;

      if (!serveHas44111) {
        const apply = run(
          'tailscale',
          ['serve', '--bg', '--https=44111', 'http://127.0.0.1:44111'],
          { timeout: 20_000 }
        );
        const applyOut = `${apply.stdout ?? ''}\n${apply.stderr ?? ''}`;
        if (apply.status === 0) {
          const after = run('tailscale', ['serve', 'status', '--json'], { timeout: 15_000 });
          const afterRaw = after.stdout ?? '';
          serveConfigured =
            after.status === 0 &&
            (afterRaw.includes('44111') ||
              afterRaw.includes('https') ||
              afterRaw.includes('HTTPS'));
        } else {
          serveApplyBlocked = true;
          if (/Serve is not enabled on your tailnet/i.test(applyOut)) {
            serveApplyBlockReason = 'tailnet_serve_not_enabled';
          } else if (apply.error || apply.status === null) {
            serveApplyBlockReason = 'serve_apply_timeout_or_error';
          } else {
            serveApplyBlockReason = 'serve_apply_failed';
          }
          writeEvidence('imp-ac-17-serve-restore-blocked.json', {
            blocked: true,
            residual_only: true,
            ac_serve_claim: 'residual_open',
            ac_end_state_green: false,
            reason: serveApplyBlockReason,
            serve_resumed: 'false',
            documented_restore: 'tailscale serve --bg --https=44111 http://127.0.0.1:44111',
            operator_action:
              'Enable Tailscale Serve on the tailnet (admin console), then re-run restore; do not mark AC-2 Serve claim green until serve_resumed=true',
            funnel_endpoints: 0,
          });
        }
      } else {
        const after = run('tailscale', ['serve', 'status', '--json'], { timeout: 15_000 });
        serveConfigured = after.status === 0 && (after.stdout ?? '').length > 0;
      }

      const statusProbe = run('tailscale', ['serve', 'status', '--json'], { timeout: 15_000 });
      expect(statusProbe.status).toBe(0);
      expect(statusProbe.stdout ?? '').not.toMatch(/funnel/i);

      const serveResumed = serveConfigured === true;
      // Honest residual: never soft-pass serve_resumed when blocked.
      // Full AC-2 Serve end-state stays open (residual_only) until real resume.
      let serveAcClaim: 'satisfied' | 'residual_open';
      if (serveApplyBlocked) {
        expect(serveApplyBlockReason.length).toBeGreaterThan(0);
        expect(serveResumed, 'blocked Serve must not soft-pass resume').toBe(false);
        serveAcClaim = 'residual_open';
      } else {
        expect(serveResumed, "serve_resumed='true' when Serve apply succeeds").toBe(true);
        serveAcClaim = 'satisfied';
      }

      // --- Real holo deploy:rollback-preflight (read-only; zero volume mutation) ---
      const rollbackArgs = [
        'deploy:rollback-preflight',
        '--lock',
        'services/platform/deploy/compose/image-lock.json',
      ];
      expect(isMutatingDeployCommand('holo', rollbackArgs)).toBe(false);

      const volumesBefore = run(dockerBin(), ['volume', 'ls', '-q'], { timeout: 30_000 });
      expect(volumesBefore.status).toBe(0);
      const volumeSetBefore = new Set(
        (volumesBefore.stdout ?? '')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
      );
      expect(volumeSetBefore.has(pgVolume)).toBe(true);
      expect(volumeSetBefore.has(blobVolume)).toBe(true);

      const containersBefore = run(
        dockerBin(),
        ['compose', '-f', composePath, '-p', project, 'ps', '-q'],
        { timeout: 30_000 }
      );
      const containerIdsBefore = (containersBefore.stdout ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .sort()
        .join(',');

      const holoBin = resolve(ROOT, 'bin/holo');
      const rollback = run(holoBin, [...rollbackArgs, '--json'], { cwd: ROOT, timeout: 60_000 });
      // Placeholder lock is explicitly non-deployable → fail-closed exit ≠ 0.
      // Success path would also be non-mutating; either way volumes must not change.
      expect(rollback.status, 'rollback-preflight exits non-zero on non-deployable lock').not.toBe(
        0
      );
      const rollbackCombined = `${rollback.stdout ?? ''}\n${rollback.stderr ?? ''}`;
      expect(rollbackCombined).toMatch(/not a deployable|non-deployable|refused/i);
      expect(rollbackCombined).not.toMatch(/\bdown\s+-v\b|volume\s+rm|volume\s+prune/);

      const volumesAfter = run(dockerBin(), ['volume', 'ls', '-q'], { timeout: 30_000 });
      expect(volumesAfter.status).toBe(0);
      const volumeSetAfter = new Set(
        (volumesAfter.stdout ?? '')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
      );
      expect(
        volumeSetAfter.has(pgVolume),
        'pg durable volume present after rollback-preflight'
      ).toBe(true);
      expect(
        volumeSetAfter.has(blobVolume),
        'blob durable volume present after rollback-preflight'
      ).toBe(true);
      // No durable volume removed by preflight.
      for (const name of [pgVolume, blobVolume]) {
        expect(volumeSetBefore.has(name) && volumeSetAfter.has(name)).toBe(true);
      }
      // Production bare names must not have been deleted if present.
      for (const name of ['holocron-postgres', 'holocron-blobs']) {
        if (volumeSetBefore.has(name)) {
          expect(volumeSetAfter.has(name), `production volume ${name} preserved`).toBe(true);
        }
      }

      const containersAfter = run(
        dockerBin(),
        ['compose', '-f', composePath, '-p', project, 'ps', '-q'],
        { timeout: 30_000 }
      );
      const containerIdsAfter = (containersAfter.stdout ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .sort()
        .join(',');
      expect(containerIdsAfter, 'containers unchanged by rollback-preflight').toBe(
        containerIdsBefore
      );

      expect(volumeDeletionCount, 'volume_deletion_count=0 during lifecycle').toBe(0);
      expect(
        ledger.some(
          (e) =>
            e.args.includes('prune') ||
            (e.args[0] === 'volume' && e.args[1] === 'rm') ||
            (e.args.includes('down') && e.args.includes('-v'))
        ),
        'no volume deletion commands in lifecycle ledger'
      ).toBe(false);

      // Production volume names must never appear in deletion args.
      for (const entry of ledger) {
        if (entry.args[0] === 'volume' && entry.args[1] === 'rm') {
          for (const name of ['holocron-postgres', 'holocron-blobs']) {
            expect(entry.args).not.toContain(name);
          }
        }
      }

      // Host reboot residual: real reboot is operator-scheduled; leave AC open honestly.
      const compose = parse(readRepoFile('services/platform/deploy/compose/compose.yaml')) as {
        services?: Record<string, ComposeService>;
      };
      for (const name of REQUIRED_SERVICES) {
        expect(compose.services?.[name]?.restart).toMatch(/unless-stopped|always/);
      }
      expect(launchdReadme).toMatch(
        /operator scheduling|human login|Docker Desktop must be running/i
      );
      expect(launchdReadme).toMatch(/static checklist|cannot satisfy|real engine/i);

      const evidence = {
        running_service_count_after_restart: countHealthyRequiredServices(live),
        healthy_services_after_restart: live,
        compose_services: [...REQUIRED_SERVICES],
        postgres_sentinel_rows: postgresSentinelRows,
        blob_sentinel_objects: blobSentinelObjects,
        serve_resumed: serveResumed ? 'true' : 'false',
        serve_ac_claim: serveAcClaim,
        serve_ac_end_state_green: serveAcClaim === 'satisfied',
        serve_apply_blocked: serveApplyBlocked,
        serve_apply_block_reason: serveApplyBlockReason || null,
        serve_restore_documented: true,
        serve_status_probe_ok: statusProbe.status === 0,
        funnel_endpoint_count: 0,
        volume_deletion_count: volumeDeletionCount,
        durable_volumes_present: [pgVolume, blobVolume],
        restart_policies: Object.fromEntries(
          REQUIRED_SERVICES.map((name) => [name, compose.services?.[name]?.restart ?? null])
        ),
        rollback_preflight: {
          executed: true,
          command: 'holo deploy:rollback-preflight',
          lock: 'services/platform/deploy/compose/image-lock.json',
          exit_status: rollback.status,
          fail_closed_on_non_deployable_lock: true,
          volumes_preserved: true,
          containers_unchanged: containerIdsAfter === containerIdsBefore,
          mutating_classifier: false,
        },
        host_reboot: {
          real_reboot_executed: false,
          ac_claim: 'residual_open',
          ac_end_state_green: false,
          reason:
            'operator-scheduled real reboot not executed in automated harness; leave reboot recovery AC open until drill',
          docker_desktop_dependency_documented: true,
          restart_policy_proven_on_compose_graph: true,
          four_service_compose_stop_up_proven: true,
        },
        ledger_command_count: ledger.length,
        credential_value_count: 0,
      };
      writeEvidence('imp-ac-17-lifecycle.json', evidence);

      expect(postgresSentinelRows, 'postgres_sentinel_rows=1').toBe(1);
      expect(blobSentinelObjects, 'blob_sentinel_objects=1').toBe(1);
      expect(volumeDeletionCount, 'volume_deletion_count=0').toBe(0);
      expect(evidence.running_service_count_after_restart).toBe(4);
      // Residual honesty: Serve/reboot claims stay open when not proven live.
      if (serveAcClaim === 'residual_open') {
        expect(evidence.serve_ac_end_state_green).toBe(false);
        expect(evidence.serve_resumed).toBe('false');
      }
      expect(evidence.host_reboot.ac_end_state_green).toBe(false);
      expect(evidence.host_reboot.ac_claim).toBe('residual_open');

      expect(
        countCredentialValueMatches(JSON.stringify(evidence), [
          'd08-08-disposable-only',
          sentinelValue,
        ])
      ).toBe(0);
      expect(JSON.stringify(evidence)).not.toContain('d08-08-disposable-only');
      expect(JSON.stringify(evidence)).not.toMatch(/tskey-|AuthKey/i);
    } finally {
      // Orderly dispose of the disposable project only (never production names).
      run(dockerBin(), ['compose', '-f', composePath, '-p', project, 'down', '--remove-orphans'], {
        timeout: 120_000,
      });
      run(dockerBin(), ['volume', 'rm', '-f', pgVolume, blobVolume], { timeout: 30_000 });
      rmSync(workRoot, { recursive: true, force: true });
    }
  }, 420_000);
});
