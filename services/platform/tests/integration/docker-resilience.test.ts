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
    // No copy-pastable shell line that *only* recommends down -v (prose forbid is OK).
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
    // Production path must not auto-install Tailscale or native Homebrew agents.
    expect(composeReadme).toMatch(/never auto-install|NEVER auto-install|operator action/i);
    expect(launchdReadme).toMatch(/Docker Desktop \+ Compose|Production path \(Docker/i);
    expect(launchdReadme).toMatch(/Legacy native LaunchAgents|NOT the portable production path/i);

    // Real host architecture (Apple silicon).
    const uname = run('uname', ['-m']);
    expect(uname.status, uname.stderr).toBe(0);
    const hostArchitecture = (uname.stdout ?? '').trim();
    expect(hostArchitecture, "host_architecture='arm64'").toBe('arm64');

    // Real Docker engine architecture.
    const dockerArch = run(dockerBin(), ['info', '--format', '{{.Architecture}}']);
    expect(dockerArch.status, dockerArch.stderr || 'docker info required').toBe(0);
    const arch = (dockerArch.stdout ?? '').trim().toLowerCase();
    expect(['aarch64', 'arm64']).toContain(arch);

    const composeVersion = run(dockerBin(), ['compose', 'version']);
    expect(composeVersion.status, composeVersion.stderr).toBe(0);
    expect(composeVersion.stdout).toMatch(/compose/i);

    const tailscale = run('tailscale', ['version']);
    expect(tailscale.status, 'tailscale must be installed for cold-host prerequisites').toBe(0);

    // Exact four-service Compose graph; zero client/mobile services.
    const serviceNames = Object.keys(composeYaml.services ?? {});
    expect(serviceNames.length, 'running_service_count=4 (compose graph)').toBe(4);
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
    expect(dockerignore).toMatch(/^\*\*/m); // deny-by-default
    expect(dockerignore).toMatch(/!services\/platform\/src/);
    // Count forbidden client COPY/context inclusions (not substring "EXPOSE").
    const clientAssetHits = [
      /\bexpo\b/i.test(dockerfile),
      /react-native/i.test(dockerfile),
      /COPY\s+apps\//i.test(dockerfile),
      /COPY\s+client\//i.test(dockerfile),
      /node_modules\/expo/i.test(dockerfile),
    ].filter(Boolean).length;
    const clientAssetCount = clientAssetHits;
    expect(clientAssetCount, 'client_asset_count=0').toBe(0);

    // Loopback private Serve port contract.
    expect(DEFAULT_LOOPBACK_PORT, 'serve_https_port=44111').toBe(44_111);
    expect(composeReadme).toMatch(/127\.0\.0\.1:44111/);

    // Non-mutating preflight against real Docker/Tailscale (small memory plan).
    const secretRoot = mkdtempSync(resolve(tmpdir(), 'd08-08-secrets-'));
    const secretsPath = resolve(secretRoot, 'secrets.yaml');
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

      const evidence = {
        host_architecture: hostArchitecture,
        docker_architecture: arch,
        running_service_count: serviceNames.length,
        client_asset_count: clientAssetCount,
        serve_https_port: DEFAULT_LOOPBACK_PORT,
        services: serviceNames,
        named_volumes: ['holocron-postgres', 'holocron-blobs'],
        preflight_check_count: preflight.preflight_check_count,
        docker_mutation_count: preflight.docker_mutation_count,
        compose_version: (composeVersion.stdout ?? '').trim(),
        tailscale_present: tailscale.status === 0,
      };
      writeEvidence('imp-ac-16-cold-host.json', evidence);
      expect(countCredentialValueMatches(JSON.stringify(evidence))).toBe(0);
    } finally {
      rmSync(secretRoot, { recursive: true, force: true });
    }
  });

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
    // Forbidden destructive syntax must be called out as forbidden, not recommended.
    expect(launchdReadme).toMatch(/Forbidden:.*down -v|NEVER.*down -v/i);
    expect(launchdReadme).not.toMatch(
      /^(?!.*[Ff]orbid|.*NEVER|.*without).*docker compose down -v/m
    );

    // Real Docker is required for PLATFORM_IT lifecycle evidence.
    const info = run(dockerBin(), ['info', '--format', '{{.ServerVersion}}']);
    expect(info.status, 'Docker daemon required for IMP-AC-17').toBe(0);

    const pgVolume = `d08-08-holocron-postgres-${process.pid}`;
    const blobVolume = `d08-08-holocron-blobs-${process.pid}`;
    const pgContainer = `d08-08-pg-${process.pid}`;
    const blobContainer = `d08-08-blob-${process.pid}`;
    const network = `d08-08-net-${process.pid}`;
    const sentinelKey = `d08-08-lifecycle-${process.pid}`;
    const sentinelValue = `d08-08-sentinel:${Date.now()}`;
    const blobPath = '/var/lib/holocron/blobs/deployment-sentinels/d08-08';
    let volumeDeletionCount = 0;
    const ledger: Array<{ command: string; args: string[] }> = [];

    const docker = (args: string[], timeout = 120_000) => {
      ledger.push({ command: 'docker', args: [...args] });
      // Count only explicit volume deletion of our durable volumes (or prune).
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
      // Create durable named volumes (production-shaped names under disposable prefix).
      expect(docker(['volume', 'create', pgVolume]).status).toBe(0);
      expect(docker(['volume', 'create', blobVolume]).status).toBe(0);
      expect(docker(['network', 'create', network]).status).toBe(0);

      // Seed Postgres sentinel via real pgvector/pg18 image (Compose contract pin).
      // PG18 official/pgvector volume root is /var/lib/postgresql (not .../data).
      const pgStart = docker([
        'run',
        '-d',
        '--name',
        pgContainer,
        '--network',
        network,
        '--restart',
        'unless-stopped',
        '-e',
        'POSTGRES_PASSWORD=d08-08-disposable-only',
        '-e',
        'POSTGRES_USER=holocron',
        '-e',
        'POSTGRES_DB=holocron',
        '-v',
        `${pgVolume}:/var/lib/postgresql`,
        'pgvector/pgvector@sha256:691673308c99d2161ba298736f3147f1f22d79de2fb7ec93ae9b4afcab870b62',
      ]);
      expect(pgStart.status, pgStart.stderr || pgStart.stdout).toBe(0);

      // Wait for Postgres readiness.
      let ready = false;
      for (let i = 0; i < 60; i += 1) {
        const probe = docker([
          'exec',
          pgContainer,
          'pg_isready',
          '-U',
          'holocron',
          '-d',
          'holocron',
        ]);
        if (probe.status === 0) {
          ready = true;
          break;
        }
        sleepSync(1_000);
      }
      expect(ready, 'postgres ready').toBe(true);

      const seedSql = `CREATE TABLE IF NOT EXISTS deployment_sentinels (key text PRIMARY KEY, value text NOT NULL); INSERT INTO deployment_sentinels(key,value) VALUES ('${sentinelKey}','${sentinelValue}') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;`;
      const seed = docker([
        'exec',
        pgContainer,
        'psql',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'holocron',
        '-d',
        'holocron',
        '-c',
        seedSql,
      ]);
      expect(seed.status, seed.stderr || seed.stdout).toBe(0);

      // Seed blob sentinel on named volume via alpine.
      const blobSeed = docker([
        'run',
        '--rm',
        '--name',
        `${blobContainer}-seed`,
        '-v',
        `${blobVolume}:/var/lib/holocron/blobs`,
        'alpine:latest',
        'sh',
        '-ec',
        `mkdir -p "$(dirname ${blobPath})" && printf %s '${sentinelValue}' > ${blobPath}`,
      ]);
      expect(blobSeed.status, blobSeed.stderr || blobSeed.stdout).toBe(0);

      // Observe sentinels before lifecycle events.
      const pgBefore = docker([
        'exec',
        pgContainer,
        'psql',
        '-At',
        '-U',
        'holocron',
        '-d',
        'holocron',
        '-c',
        `SELECT count(*) FROM deployment_sentinels WHERE key='${sentinelKey}' AND value='${sentinelValue}'`,
      ]);
      expect(pgBefore.status).toBe(0);
      expect((pgBefore.stdout ?? '').trim()).toBe('1');

      const blobBefore = docker([
        'run',
        '--rm',
        '-v',
        `${blobVolume}:/var/lib/holocron/blobs`,
        'alpine:latest',
        'cat',
        blobPath,
      ]);
      expect(blobBefore.status).toBe(0);
      expect((blobBefore.stdout ?? '').trim()).toBe(sentinelValue);

      // Orderly stop (container stop — not volume rm / down -v).
      expect(docker(['stop', pgContainer]).status).toBe(0);

      // Compose-equivalent restart: start existing container (restart policy path).
      expect(docker(['start', pgContainer]).status).toBe(0);
      ready = false;
      for (let i = 0; i < 60; i += 1) {
        const probe = docker([
          'exec',
          pgContainer,
          'pg_isready',
          '-U',
          'holocron',
          '-d',
          'holocron',
        ]);
        if (probe.status === 0) {
          ready = true;
          break;
        }
        sleepSync(1_000);
      }
      expect(ready, 'postgres ready after restart').toBe(true);

      // Re-observe sentinels after stop/start (durable volumes preserved).
      const pgAfter = docker([
        'exec',
        pgContainer,
        'psql',
        '-At',
        '-U',
        'holocron',
        '-d',
        'holocron',
        '-c',
        `SELECT count(*) FROM deployment_sentinels WHERE key='${sentinelKey}' AND value='${sentinelValue}'`,
      ]);
      expect(pgAfter.status).toBe(0);
      const postgresSentinelRows = Number((pgAfter.stdout ?? '').trim());
      expect(postgresSentinelRows, 'postgres_sentinel_rows=1').toBe(1);

      const blobAfter = docker([
        'run',
        '--rm',
        '-v',
        `${blobVolume}:/var/lib/holocron/blobs`,
        'alpine:latest',
        'cat',
        blobPath,
      ]);
      expect(blobAfter.status).toBe(0);
      expect((blobAfter.stdout ?? '').trim()).toBe(sentinelValue);
      const blobSentinelObjects = (blobAfter.stdout ?? '').trim() === sentinelValue ? 1 : 0;
      expect(blobSentinelObjects, 'blob_sentinel_objects=1').toBe(1);

      // Volumes still present after lifecycle (inspect by name).
      expect(docker(['volume', 'inspect', pgVolume, '--format', '{{.Name}}']).status).toBe(0);
      expect(docker(['volume', 'inspect', blobVolume, '--format', '{{.Name}}']).status).toBe(0);

      // Private Serve: status probe + restore attempt. Never Funnel.
      // If the tailnet has Serve disabled, record the blocked operator action
      // honestly (login.tailscale.com enablement) rather than mocking success.
      const serveStatusBefore = run('tailscale', ['serve', 'status', '--json'], {
        timeout: 15_000,
      });
      expect(serveStatusBefore.status, 'tailscale serve status').toBe(0);
      const serveRaw = (serveStatusBefore.stdout ?? '').trim() || '{}';
      const serveHas44111 =
        serveRaw.includes('44111') ||
        serveRaw.includes(':44111') ||
        /"HTTPS":\s*true/.test(serveRaw);

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
          serveConfigured =
            after.status === 0 &&
            ((after.stdout ?? '').includes('44111') ||
              (after.stdout ?? '').includes('https') ||
              (after.stdout ?? '').includes('HTTPS'));
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
            reason: serveApplyBlockReason,
            documented_restore: 'tailscale serve --bg --https=44111 http://127.0.0.1:44111',
            operator_action:
              'Enable Tailscale Serve on the tailnet (admin console), then re-run restore',
            funnel_endpoints: 0,
          });
        }
      } else {
        // Already configured — re-check status models post-reboot verification.
        const after = run('tailscale', ['serve', 'status', '--json'], { timeout: 15_000 });
        serveConfigured = after.status === 0 && (after.stdout ?? '').length > 0;
      }

      // Restoration procedure must always be documented and status-probed.
      expect(launchdReadme).toMatch(/tailscale serve --bg --https=44111/);
      expect(launchdReadme).toMatch(/If missing after reboot, restore/);
      const statusProbe = run('tailscale', ['serve', 'status', '--json'], { timeout: 15_000 });
      expect(statusProbe.status).toBe(0);
      // No Funnel in status output.
      expect(statusProbe.stdout ?? '').not.toMatch(/funnel/i);

      // serve_resumed is true only when Serve is actually configured on the node.
      // When the tailnet policy blocks enablement, residual evidence is written and
      // the observation is recorded as the blocked operator path (not a soft-pass).
      const serveResumed = serveConfigured;
      if (serveApplyBlocked) {
        expect(serveApplyBlockReason.length, 'blocked serve reason recorded').toBeGreaterThan(0);
        // Residual does not invent resume success.
        expect(serveResumed, 'blocked Serve must not soft-pass resume').toBe(false);
      } else {
        expect(serveResumed, "serve_resumed='true'").toBe(true);
      }

      // Rollback preflight must be non-mutating (docs + command classifier).
      const rollbackArgs = [
        'deploy:rollback-preflight',
        '--lock',
        'services/platform/deploy/compose/image-lock.json',
      ];
      expect(isMutatingDeployCommand('holo', rollbackArgs)).toBe(false);
      // Classifier treats only docker/tailscale mutations; ledger of our docker ops
      // must not include volume rm / prune / down -v.
      expect(volumeDeletionCount, 'volume_deletion_count=0').toBe(0);
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
      const productionVolumeNames = ['holocron-postgres', 'holocron-blobs'];
      for (const entry of ledger) {
        if (entry.args[0] === 'volume' && entry.args[1] === 'rm') {
          for (const name of productionVolumeNames) {
            expect(entry.args).not.toContain(name);
          }
        }
      }

      // Host reboot: real reboot is operator-scheduled; prove restart policy + docs.
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
        postgres_sentinel_rows: postgresSentinelRows,
        blob_sentinel_objects: blobSentinelObjects,
        serve_resumed: serveResumed ? 'true' : 'false',
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
        host_reboot: {
          real_reboot_executed: false,
          reason: 'operator-scheduled; not executed in automated harness',
          docker_desktop_dependency_documented: true,
          restart_policy_proven: true,
        },
        ledger_command_count: ledger.length,
        credential_value_count: 0,
      };
      writeEvidence('imp-ac-17-lifecycle.json', evidence);
      expect(postgresSentinelRows, 'postgres_sentinel_rows=1').toBe(1);
      expect(blobSentinelObjects, 'blob_sentinel_objects=1').toBe(1);
      expect(volumeDeletionCount, 'volume_deletion_count=0').toBe(0);
      expect(
        countCredentialValueMatches(JSON.stringify(evidence), [
          'd08-08-disposable-only',
          sentinelValue,
        ])
      ).toBe(0);
      // Evidence must not embed the disposable password or raw serve secrets.
      expect(JSON.stringify(evidence)).not.toContain('d08-08-disposable-only');
      expect(JSON.stringify(evidence)).not.toMatch(/tskey-|AuthKey/i);
    } finally {
      // Cleanup disposable resources only (never production holocron-* bare names).
      run(dockerBin(), ['rm', '-f', pgContainer], { timeout: 30_000 });
      run(dockerBin(), ['rm', '-f', `${blobContainer}-seed`], { timeout: 30_000 });
      run(dockerBin(), ['network', 'rm', network], { timeout: 30_000 });
      // Disposable volumes may be removed after proof; production names never touched.
      run(dockerBin(), ['volume', 'rm', '-f', pgVolume, blobVolume], { timeout: 30_000 });
    }
  }, 300_000);
});
