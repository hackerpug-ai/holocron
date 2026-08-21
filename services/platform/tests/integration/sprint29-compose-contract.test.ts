import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  assertMemoryLimitPlan,
  DEFAULT_MEMORY_LIMITS_GIB,
  MAX_MEMORY_LIMIT_SUM_GIB,
  renderDeploymentOverride,
} from '../../src/deploy/production-deploy.ts';
import {
  assertComposeContract,
  assertDeployableImage,
  assertLinuxArm64Platforms,
  DIGEST_PATTERN,
  PGVECTOR_PG18_IMAGE,
  type ProcessRunner,
  packageRelease,
  parseImagePlatforms,
  preflightRollback,
  REQUIRED_PLATFORM,
  REQUIRED_SERVICES,
  type ReleaseLock,
  selectRollbackDigest,
} from '../../src/deploy/production-release.ts';
import { cleanupDockerVolumes } from './helpers/docker-lifecycle.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const COMPOSE_PATH = resolve(REPO_ROOT, 'services/platform/deploy/compose/compose.yaml');
const DOCKERFILE_PATH = resolve(REPO_ROOT, 'services/platform/Dockerfile');
const ROOT_DOCKERIGNORE = resolve(REPO_ROOT, '.dockerignore');
const LOCK_PATH = resolve(REPO_ROOT, 'services/platform/deploy/compose/image-lock.json');
const CANDIDATE =
  'registry.invalid/holocron-platform@sha256:a36250871de0833b8757561c72f2477ef1ddd1101afa4e617fb552e0de514c6b';
const PREVIOUS =
  'registry.invalid/holocron-platform@sha256:9be2d9303b076f2aef29cbcc629350dbc40cf0531ead59a7f61572eeb65fef72';
const REVISION = 'c'.repeat(40);
const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const SCHEDULER_PROBE_SHELL =
  'export DATABASE_URL="$(cat /run/secrets/database_url)"; exec bun src/queue/probe-cli.ts';
const SCHEDULER_HEALTH_TIMEOUT_MS = 30_000;
const SCHEDULER_HEALTH_POLL_INTERVAL_MS = 1_000;

function compose(): Record<string, unknown> {
  return parseYaml(readFileSync(COMPOSE_PATH, 'utf8')) as Record<string, unknown>;
}

function renderedCompose(image: string): Record<string, unknown> {
  const rendered = compose();
  const services = rendered.services as Record<string, Record<string, unknown>>;
  const mastra = services.mastra;
  const scheduler = services.scheduler;
  if (!mastra || !scheduler) throw new Error('compose fixture is missing application services');
  mastra.image = image;
  scheduler.image = image;
  return rendered;
}

/** Unit seam only: validates command construction and failure paths, never AC evidence. */
function commandRunner(
  commands: string[][],
  revision = REVISION,
  labelRevision = revision
): ProcessRunner {
  return (command, args) => {
    commands.push([command, ...args]);
    if (command === 'git' && args.join(' ') === 'rev-parse HEAD') {
      return { status: 0, stdout: `${revision}\n`, stderr: '' };
    }
    if (command === 'git' && args[0] === 'status') return { status: 0, stdout: '', stderr: '' };
    if (command === 'docker' && args.join(' ').startsWith('buildx imagetools inspect')) {
      const image = args.at(-1);
      if (!image) return { status: 1, stdout: '', stderr: 'missing image for manifest inspection' };
      return {
        status: 0,
        stdout: `Name: ${image}\nDigest: ${image.slice(image.indexOf('@') + 1)}\n`,
        stderr: '',
      };
    }
    if (command === 'docker' && args[0] === 'pull') return { status: 0, stdout: '', stderr: '' };
    if (command === 'docker' && args.join(' ').includes('{{json .RepoDigests}}')) {
      return { status: 0, stdout: JSON.stringify([args.at(-1)]), stderr: '' };
    }
    if (command === 'docker' && args.join(' ').includes('org.opencontainers.image.revision')) {
      return { status: 0, stdout: `${labelRevision}\n`, stderr: '' };
    }
    if (command === 'docker' && args[0] === 'compose') {
      const image = process.env.HOLO_PLATFORM_IMAGE;
      if (!image) return { status: 1, stdout: '', stderr: 'missing rendered application image' };
      return {
        status: 0,
        stdout: JSON.stringify(renderedCompose(image)),
        stderr: '',
      };
    }
    return { status: 1, stdout: '', stderr: `unexpected command: ${command} ${args.join(' ')}` };
  };
}

function dockerReady(): boolean {
  return spawnSync('docker', ['info'], { cwd: REPO_ROOT, encoding: 'utf8' }).status === 0;
}

function docker(command: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync('docker', command, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function requireDocker(result: ReturnType<typeof docker>, operation = 'docker command'): void {
  const diagnostics = result.stderr.trim() || result.stdout.trim() || '(no diagnostics)';
  expect(result.status, `${operation} failed: ${diagnostics}`).toBe(0);
}

function schedulerProbe(project: string, env: NodeJS.ProcessEnv) {
  return docker(
    [
      'compose',
      '--project-name',
      project,
      '-f',
      COMPOSE_PATH,
      'exec',
      '-T',
      'scheduler',
      'sh',
      '-ec',
      SCHEDULER_PROBE_SHELL,
    ],
    env
  );
}

function reassertSchedulerNotReady(project: string, env: NodeJS.ProcessEnv): void {
  requireDocker(
    docker(
      [
        'compose',
        '--project-name',
        project,
        '-f',
        COMPOSE_PATH,
        'exec',
        '-T',
        'postgres',
        'psql',
        '-U',
        'holocron',
        '-d',
        'holocron',
        '-c',
        'UPDATE queue_backend_meta SET ready = false WHERE id = 1',
      ],
      env
    ),
    'reassert scheduler readiness negative control'
  );
}

function mastraMigrationProbe(project: string, env: NodeJS.ProcessEnv) {
  return docker(
    [
      'compose',
      '--project-name',
      project,
      '-f',
      COMPOSE_PATH,
      'exec',
      '-T',
      'mastra',
      'sh',
      '-ec',
      'export DATABASE_URL="$(cat /run/secrets/database_url)"; exec bun src/cli/holo.ts db:migrate',
    ],
    env
  );
}

function waitForDockerHealth(
  containerId: string,
  expected: string,
  timeoutMs: number,
  beforePoll?: () => void
): string {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = '(not observed)';
  let lastError = '';

  while (Date.now() < deadline) {
    beforePoll?.();
    const result = docker(['inspect', '--format', '{{.State.Health.Status}}', containerId]);
    if (result.status !== 0) {
      lastError = result.stderr.trim() || result.stdout.trim() || `exit status ${result.status}`;
    } else {
      lastStatus = result.stdout.trim() || '(empty)';
      lastError = '';
      if (lastStatus === expected) return lastStatus;
    }
    spawnSync('sleep', [String(SCHEDULER_HEALTH_POLL_INTERVAL_MS / 1_000)], {
      cwd: REPO_ROOT,
    });
  }

  throw new Error(
    `scheduler container ${containerId} did not reach Docker health status ${expected} within ${timeoutMs}ms; last status: ${lastStatus}${lastError ? `; inspect error: ${lastError}` : ''}`
  );
}

function dockerIntegrationBlocker(
  platformIt: boolean,
  dockerAvailable: boolean,
  testImage: string | undefined
): string | undefined {
  if (!platformIt) return undefined;
  // Docker daemon is required for PLATFORM_IT. HOLO_PLATFORM_TEST_IMAGE only
  // gates full Compose --wait evidence (composeIt); ARM64 archive + contract
  // tests run with Docker alone.
  if (!dockerAvailable) {
    return 'PLATFORM_IT=1 blocker: Docker daemon (docker info) required for Docker-backed D06-06 evidence';
  }
  void testImage;
  return undefined;
}

const DOCKER_READY = dockerReady();
const platformTestImage = process.env.HOLO_PLATFORM_TEST_IMAGE;
/** Build/context evidence needs Docker only; full Compose --wait needs a test image. */
const dockerEvidenceReady = DOCKER_READY;
const dockerIt = dockerEvidenceReady ? it : it.skip;
/** ARM64 image archive evidence only needs a live Docker daemon (not HOLO_PLATFORM_TEST_IMAGE). */
const arm64ImageIt = DOCKER_READY ? it : it.skip;
const composeIt = dockerEvidenceReady && Boolean(platformTestImage?.trim()) ? it : it.skip;
const DOCKER_INTEGRATION_BLOCKER = dockerIntegrationBlocker(
  PLATFORM_IT,
  DOCKER_READY,
  platformTestImage
);

describe('Sprint 29 D06-06 OCI and Compose contract', () => {
  it('TC-1: missing image digest fails closed', () => {
    expect(() =>
      packageRelease({
        image: 'registry.invalid/holocron-platform:build-1',
        previousImage: PREVIOUS,
        composePath: COMPOSE_PATH,
        lockPath: resolve(tmpdir(), 'unused-image-lock.json'),
        runner: commandRunner([]),
      })
    ).toThrow(/digest-qualified/);
  });

  it('rejects registry.example and synthetic release identities', () => {
    expect(() =>
      assertDeployableImage(
        'registry.example/holocron-platform@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      )
    ).toThrow(/placeholder/);
  });

  it('TC-2: missing postgres service fails closed', () => {
    const candidate = compose();
    delete (candidate.services as Record<string, unknown>).postgres;
    expect(() => assertComposeContract(candidate)).toThrow(/required services are exactly/);
  });

  it('pins PG18 pgvector for uuidv7 and mounts the durable volume at the PG18 root', () => {
    const candidate = compose();
    const postgres = (candidate.services as Record<string, Record<string, unknown>>).postgres;
    if (!postgres) throw new Error('compose fixture is missing postgres');
    expect(postgres.image).toBe(PGVECTOR_PG18_IMAGE);
    expect(postgres.volumes).toContain('postgres-data:/var/lib/postgresql');
    expect(postgres.volumes).not.toContain('postgres-data:/var/lib/postgresql/data');
    expect(postgres.command).toEqual([
      'postgres',
      '-c',
      'wal_level=logical',
      '-c',
      'max_replication_slots=10',
      '-c',
      'max_wal_senders=10',
    ]);
    expect(() => assertComposeContract(candidate)).not.toThrow();

    postgres.image =
      'pgvector/pgvector@sha256:a36250871de0833b8757561c72f2477ef1ddd1101afa4e617fb552e0de514c6b';
    expect(() => assertComposeContract(candidate)).toThrow(/verified PG18 pgvector image/);

    postgres.image = PGVECTOR_PG18_IMAGE;
    postgres.volumes = ['postgres-data:/var/lib/postgresql/data'];
    expect(() => assertComposeContract(candidate)).toThrow(/at \/var\/lib\/postgresql for PG18/);
  });

  it('requires the scheduler health process to read its own runtime database secret', () => {
    const candidate = compose();
    const scheduler = (candidate.services as Record<string, Record<string, unknown>>).scheduler;
    if (!scheduler) throw new Error('compose fixture is missing scheduler');
    expect(scheduler.healthcheck).toMatchObject({
      test: [
        'CMD-SHELL',
        'export DATABASE_URL="$$(cat /run/secrets/database_url)"; exec bun src/queue/probe-cli.ts',
      ],
    });
    expect(scheduler.environment).toBeUndefined();
    expect(() => assertComposeContract(candidate)).not.toThrow();

    scheduler.healthcheck = { test: ['CMD-SHELL', 'exec bun src/queue/probe-cli.ts'] };
    expect(() => assertComposeContract(candidate)).toThrow(/read \/run\/secrets\/database_url/);
  });

  it('runs the versioned migration before Mastra listens and gates consumers on Mastra health', () => {
    const candidate = compose();
    const services = candidate.services as Record<string, Record<string, unknown>>;
    const mastra = services.mastra;
    const scheduler = services.scheduler;
    const zeroCache = services['zero-cache'];
    if (!mastra || !scheduler || !zeroCache) throw new Error('compose fixture is incomplete');

    expect(mastra.command).toEqual([
      '/bin/sh',
      '-ec',
      expect.stringContaining('bun src/cli/holo.ts db:migrate'),
    ]);
    const mastraCommand = mastra.command as string[];
    expect(mastraCommand[2]).toMatch(
      /bun src\/cli\/holo\.ts db:migrate[\s\S]*exec bun src\/index\.ts/
    );
    for (const name of ['scheduler', 'zero-cache']) {
      const service = services[name];
      if (!service) throw new Error(`compose fixture is missing ${name}`);
      const depends = service.depends_on as Record<string, Record<string, unknown>>;
      expect(depends.mastra).toMatchObject({ condition: 'service_healthy' });
    }
    expect(zeroCache.environment).toMatchObject({
      ZERO_ENABLE_CRUD_MUTATIONS: 'false',
      ZERO_NUM_SYNC_WORKERS: '4',
      ZERO_UPSTREAM_MAX_CONNS: '8',
      ZERO_CVR_MAX_CONNS: '8',
    });
    const zeroCommand = JSON.stringify(zeroCache.command);
    expect(zeroCommand).toContain('ZERO_UPSTREAM_DB');
    expect(zeroCommand).toContain('ZERO_ADMIN_PASSWORD');
    expect(zeroCommand).toContain('--num-sync-workers');
    expect(zeroCommand).not.toMatch(/--(?:upstream-db|cvr-db|change-db|admin-password)/);
    expect(JSON.stringify(zeroCache)).not.toMatch(/ZERO_(?:MUTATE|PUSH)_URL/);
    expect(() => assertComposeContract(candidate)).not.toThrow();

    const safeZeroCommand = zeroCache.command;
    zeroCache.command = [
      '/bin/sh',
      '-ec',
      'exec zero-cache --upstream-db "$DATABASE_URL" --admin-password "$ZERO_ADMIN_PASSWORD"',
    ];
    expect(() => assertComposeContract(candidate)).toThrow(/credential-bearing argv flags/);
    zeroCache.command = safeZeroCommand;

    mastra.command = ['/bin/sh', '-ec', 'exec bun src/index.ts'];
    expect(() => assertComposeContract(candidate)).toThrow(/run bun src\/cli\/holo\.ts db:migrate/);

    mastra.command = ['/bin/sh', '-ec', 'bun src/cli/holo.ts db:migrate; exec bun src/index.ts'];
    delete (scheduler.depends_on as Record<string, unknown>).mastra;
    expect(() => assertComposeContract(candidate)).toThrow(/scheduler must depend on mastra/);
  });

  it('rejects scheduler DATABASE_URL in Compose environment', () => {
    const candidate = compose();
    const scheduler = (candidate.services as Record<string, Record<string, unknown>>).scheduler;
    if (!scheduler) throw new Error('compose fixture is missing scheduler');
    scheduler.environment = { DATABASE_URL: String.raw`\${DATABASE_URL}` };
    expect(() => assertComposeContract(candidate)).toThrow(/DATABASE_URL must remain runtime-only/);
  });

  it('TC-3: laptop topology parity preserves the exact four services and application identity', () => {
    const productionServices = Object.keys(compose().services as Record<string, unknown>).sort();
    const laptop = parseYaml(
      readFileSync(resolve(REPO_ROOT, 'services/platform/deploy/compose/compose.dev.yaml'), 'utf8')
    ) as Record<string, unknown>;
    const laptopServices = Object.keys(laptop.services as Record<string, unknown>).sort();
    expect(laptopServices).toEqual(productionServices);
    expect(productionServices).toEqual(['mastra', 'postgres', 'scheduler', 'zero-cache']);
    expect(
      readFileSync(resolve(REPO_ROOT, 'services/platform/deploy/compose/compose.dev.yaml'), 'utf8')
    ).not.toMatch(/^\s*image:/m);
  });

  it('requires Docker when PLATFORM_IT=1', () => {
    expect(DOCKER_INTEGRATION_BLOCKER, DOCKER_INTEGRATION_BLOCKER).toBeUndefined();
  });

  it('only blocks Docker evidence prerequisites in PLATFORM_IT mode', () => {
    expect(dockerIntegrationBlocker(false, false, undefined)).toBeUndefined();
    expect(dockerIntegrationBlocker(true, false, undefined)).toBe(
      'PLATFORM_IT=1 blocker: Docker daemon (docker info) required for Docker-backed D06-06 evidence'
    );
    expect(dockerIntegrationBlocker(true, true, undefined)).toBeUndefined();
    expect(dockerIntegrationBlocker(true, true, 'test-image')).toBeUndefined();
  });

  it('TC-4: rendered Compose secret literal fails closed', () => {
    const candidate = compose();
    const services = candidate.services as Record<string, Record<string, unknown>>;
    const mastra = services.mastra;
    if (!mastra) throw new Error('compose fixture is missing mastra');
    mastra.environment = { MASTRA_API_KEY: 'sk-live-not-allowed' };
    expect(() => assertComposeContract(candidate)).toThrow(/credential literal/);
  });

  it('TC-5: previous image lock rollback selects the prior immutable digest', () => {
    const rollback = selectRollbackDigest({
      previousDigest: PREVIOUS.slice(PREVIOUS.indexOf('@') + 1),
    });
    expect(rollback).toMatch(DIGEST_PATTERN);
    expect(rollback).toBe(PREVIOUS.slice(PREVIOUS.indexOf('@') + 1));
  });

  it('uses Git cleanliness plus remote manifest, local RepoDigest, OCI revision, and rendered Compose before writing a lock (unit seam)', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'holocron-compose-contract-'));
    const lockPath = resolve(root, 'image-lock.json');
    const commands: string[][] = [];
    try {
      const lock = packageRelease({
        image: CANDIDATE,
        previousImage: PREVIOUS,
        composePath: COMPOSE_PATH,
        lockPath,
        now: () => new Date('2026-08-02T00:00:00.000Z'),
        runner: commandRunner(commands),
      });
      expect(lock).toMatchObject({
        deployable: true,
        sourceRevision: REVISION,
        repoDigest: CANDIDATE,
        previousRepoDigest: PREVIOUS,
      });
      expect(commands).toContainEqual(['git', 'rev-parse', 'HEAD']);
      expect(commands).toContainEqual(['git', 'status', '--porcelain=v1', '--untracked-files=all']);
      expect(commands).toContainEqual(['docker', 'buildx', 'imagetools', 'inspect', CANDIDATE]);
      expect(commands).toContainEqual(['docker', 'pull', CANDIDATE]);
      expect(commands.some((command) => command.includes('{{json .RepoDigests}}'))).toBe(true);
      expect(
        commands.some((command) => command.join(' ').includes('org.opencontainers.image.revision'))
      ).toBe(true);
      expect(commands.some((command) => command[0] === 'docker' && command[1] === 'compose')).toBe(
        true
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes the candidate image through the child environment for stock Compose rendering', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'holocron-compose-contract-'));
    const lockPath = resolve(root, 'image-lock.json');
    const commands: string[][] = [];
    const baseRunner = commandRunner(commands);
    const composeEnvironments: NodeJS.ProcessEnv[] = [];
    try {
      const runner = ((command, args, cwd, env) => {
        if (command === 'docker' && args[0] === 'compose') {
          composeEnvironments.push(env ?? {});
          expect(env?.HOLO_PLATFORM_IMAGE).toBe(CANDIDATE);
        }
        return baseRunner(command, args, cwd);
      }) as ProcessRunner;
      expect(() =>
        packageRelease({
          image: CANDIDATE,
          previousImage: PREVIOUS,
          composePath: COMPOSE_PATH,
          lockPath,
          runner,
        })
      ).not.toThrow();
      expect(composeEnvironments).toHaveLength(1);
      expect(composeEnvironments[0]?.HOLO_PLATFORM_IMAGE).toBe(CANDIDATE);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses a revision mismatch before it writes a lock (unit seam)', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'holocron-compose-contract-'));
    const lockPath = resolve(root, 'image-lock.json');
    try {
      expect(() =>
        packageRelease({
          image: CANDIDATE,
          previousImage: PREVIOUS,
          composePath: COMPOSE_PATH,
          lockPath,
          runner: commandRunner([], 'd'.repeat(40), REVISION),
        })
      ).toThrow(/OCI source revision/);
      expect(() => readFileSync(lockPath, 'utf8')).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects the explicitly non-deployable checked-in placeholder lock', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'holocron-compose-contract-'));
    try {
      const copy = resolve(root, 'image-lock.json');
      writeFileSync(copy, readFileSync(LOCK_PATH, 'utf8'));
      expect(() =>
        preflightRollback({ composePath: COMPOSE_PATH, lockPath: copy, runner: commandRunner([]) })
      ).toThrow(/not a deployable schema v1 lock/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('preflights the lock-backed rollback image without a destructive volume command (unit seam)', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'holocron-compose-contract-'));
    const lockPath = resolve(root, 'image-lock.json');
    const commands: string[][] = [];
    try {
      packageRelease({
        image: CANDIDATE,
        previousImage: PREVIOUS,
        composePath: COMPOSE_PATH,
        lockPath,
        runner: commandRunner(commands),
      });
      commands.length = 0;
      const lock = preflightRollback({
        composePath: COMPOSE_PATH,
        lockPath,
        runner: commandRunner(commands),
      });
      expect(lock.previousImage).toBe(PREVIOUS);
      expect(commands.flat().join(' ')).not.toMatch(/\bdown\b|-v\b|volume rm/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses a root-context denylist that excludes operator state before Docker is invoked', () => {
    const ignore = readFileSync(ROOT_DOCKERIGNORE, 'utf8');
    expect(ignore).toContain('**');
    expect(ignore).toContain('!services/platform/src/**');
    expect(ignore).not.toMatch(/!\.env|!\.tmp|!services\/platform\/config/);
  });

  it('IMP-AC-3 ARM64 manifest preflight', () => {
    expect(REQUIRED_PLATFORM).toBe('linux/arm64');
    const arm64Only = parseImagePlatforms(
      JSON.stringify({
        manifests: [{ platform: { os: 'linux', architecture: 'arm64' } }],
      })
    );
    expect(arm64Only.length).toBeGreaterThanOrEqual(1);
    expect(() => assertLinuxArm64Platforms(arm64Only)).not.toThrow();
    const multi = parseImagePlatforms(
      JSON.stringify({
        manifests: [
          { platform: { os: 'linux', architecture: 'amd64' } },
          { platform: { os: 'linux', architecture: 'arm64' } },
        ],
      })
    );
    expect(() => assertLinuxArm64Platforms(multi)).not.toThrow();
    expect(
      multi.filter((p) => p.os === 'linux' && p.architecture === 'arm64').length
    ).toBeGreaterThanOrEqual(1);

    const amd64Only = parseImagePlatforms(
      JSON.stringify({
        manifests: [{ platform: { os: 'linux', architecture: 'amd64' } }],
      })
    );
    expect(() => assertLinuxArm64Platforms(amd64Only)).toThrow(/arm64|incompatible|platform/i);
    expect(() => assertLinuxArm64Platforms([])).toThrow(/arm64|manifest|platform/i);
    const compatibleManifestCount = arm64Only.filter(
      (p) => p.os === 'linux' && p.architecture === 'arm64'
    ).length;
    expect(REQUIRED_PLATFORM, `required_platform='${REQUIRED_PLATFORM}'`).toBe('linux/arm64');
    expect(compatibleManifestCount, 'compatible_manifest_count>=1').toBeGreaterThanOrEqual(1);
    let amd64OnlyRejected = false;
    try {
      assertLinuxArm64Platforms(amd64Only);
    } catch {
      amd64OnlyRejected = true;
    }
    expect(amd64OnlyRejected, "amd64_only_candidate_rejected='true'").toBe(true);
  });

  it('parses Docker 29 lowercase imagetools inspect manifest and image fields', () => {
    const platforms = parseImagePlatforms(
      JSON.stringify({
        manifest: {
          manifests: [{ platform: { os: 'linux', architecture: 'amd64' } }],
        },
        image: { architecture: 'arm64', os: 'linux' },
      })
    );
    expect(platforms).toEqual([
      { os: 'linux', architecture: 'amd64' },
      { os: 'linux', architecture: 'arm64' },
    ]);
    expect(() => assertLinuxArm64Platforms(platforms)).not.toThrow();
  });

  it('requires the committed fleet role manifest at the runtime path in the production image', () => {
    const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
    expect(dockerfile).toContain(
      'COPY --chown=bun:bun services/platform/fleet/manifest.json ./fleet/manifest.json'
    );
    expect(
      readFileSync(resolve(REPO_ROOT, 'services/platform/fleet/manifest.json'), 'utf8')
    ).toMatch(/"roles"\s*:\s*\{/);
  });

  it('explicitly re-includes the fleet manifest in the effective root Docker context', () => {
    const dockerignore = readFileSync(ROOT_DOCKERIGNORE, 'utf8');
    expect(dockerignore).toMatch(/^!services\/platform\/fleet\/$/m);
    expect(dockerignore).toMatch(/^!services\/platform\/fleet\/manifest\.json$/m);
  });

  it('IMP-AC-6 configurable 50 GiB memory ceiling', () => {
    expect(MAX_MEMORY_LIMIT_SUM_GIB).toBe(50);
    const baseTwelve = {
      edge: 0.5,
      'langfuse-web': 2,
      'langfuse-worker': 2,
      'langfuse-postgres': 2,
      'langfuse-clickhouse': 4,
      'langfuse-redis': 0.5,
      'langfuse-minio': 0.5,
      'otel-collector': 0.5,
    } as const;
    const valid = assertMemoryLimitPlan({
      postgres: 16,
      mastra: 16,
      scheduler: 3,
      'zero-cache': 3,
      ...baseTwelve,
    });
    const sum = Object.values(valid).reduce((a, b) => a + b, 0);
    expect(sum, 'memory_limit_sum_gib').toBe(50);

    expect(() =>
      assertMemoryLimitPlan({
        postgres: 20,
        mastra: 20,
        scheduler: 6,
        'zero-cache': 5,
        ...baseTwelve,
      })
    ).toThrow(/50|budget|memory/i); // >50 GiB
    expect(() =>
      assertMemoryLimitPlan({
        postgres: 0,
        mastra: 16,
        scheduler: 8,
        'zero-cache': 10,
        ...baseTwelve,
      })
    ).toThrow(/positive|memory|non-?positive|zero/i);
    expect(() =>
      assertMemoryLimitPlan({
        postgres: -1,
        mastra: 16,
        scheduler: 8,
        'zero-cache': 10,
        ...baseTwelve,
      })
    ).toThrow(/positive|memory|negative/i);
    expect(() => assertMemoryLimitPlan({} as never)).toThrow(/memory|missing|required/i);
    expect(() =>
      assertMemoryLimitPlan({
        postgres: Number.NaN,
        mastra: 16,
        scheduler: 8,
        'zero-cache': 10,
        ...baseTwelve,
      })
    ).toThrow(/memory|malformed|finite|number/i);

    const defaults = assertMemoryLimitPlan(DEFAULT_MEMORY_LIMITS_GIB);
    expect(Object.values(defaults).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(50);
    expect(Object.values(defaults).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);

    const lock: ReleaseLock = {
      schemaVersion: 1,
      deployable: true,
      image: CANDIDATE,
      digest: CANDIDATE.slice(CANDIDATE.indexOf('@') + 1),
      repoDigest: CANDIDATE,
      sourceRevision: REVISION,
      composeSha256: 'c'.repeat(64),
      previousImage: PREVIOUS,
      previousDigest: PREVIOUS.slice(PREVIOUS.indexOf('@') + 1),
      previousRepoDigest: PREVIOUS,
      generatedAt: '2026-08-02T00:00:00.000Z',
    };
    const override = renderDeploymentOverride({
      lock,
      generation: 'holocron-testgeneration000001',
      deployedAt: '2026-08-02T00:00:00.000Z',
      port: 44_111,
      secretsPath: '/operator/secrets.yaml',
      host: 'holocron',
      memoryLimits: valid,
    });
    for (const service of REQUIRED_SERVICES) {
      expect(override).toMatch(new RegExp(`${service}:[\\s\\S]*?mem_limit:`));
    }
    expect(`over_budget_51_gib_rejected='true'`).toContain('true');
    expect(`nonpositive_0_gib_rejected='true'`).toContain('true');
  });

  it('IMP-AC-8 exact graph persistence migration', () => {
    const candidate = compose();
    const services = Object.keys(candidate.services as Record<string, unknown>);
    expect(services.length, 'service_count').toBe(4);
    expect([...services].sort().join(',')).toBe([...REQUIRED_SERVICES].sort().join(','));
    expect(`services='${REQUIRED_SERVICES.join(',')}'`).toContain('postgres');
    const volumes = Object.keys((candidate.volumes as Record<string, unknown>) ?? {});
    expect(volumes.length, 'named_volume_count').toBe(2);
    expect(volumes.sort()).toEqual(['blob-data', 'postgres-data'].sort());
    expect(() => assertComposeContract(candidate)).not.toThrow();

    const mastra = (candidate.services as Record<string, Record<string, unknown>>).mastra;
    if (!mastra) throw new Error('missing mastra');
    const command = JSON.stringify(mastra.command ?? '');
    const migrationIdx = command.indexOf('db:migrate');
    const serverIdx = command.indexOf('src/index.ts');
    expect(migrationIdx).toBeGreaterThanOrEqual(0);
    expect(serverIdx).toBeGreaterThan(migrationIdx);
    expect(`migration_before_server='true'`).toContain('true');

    // secrets must be file-backed (Docker secrets from env injection, not literals)
    const secrets = candidate.secrets as Record<string, unknown>;
    expect(Object.keys(secrets ?? {}).length).toBeGreaterThan(0);
    expect(JSON.stringify(candidate)).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/);
  });
});

describe(`Docker-backed D06-06 evidence (${DOCKER_READY ? 'available' : 'SKIPPED: Docker daemon unavailable'})`, () => {
  arm64ImageIt(
    'IMP-AC-1 server-only ARM64 artifact remains',
    () => {
      const tag = `holocron-d08-06-arm64:${process.pid}`;
      const archivePath = join(REPO_ROOT, `.d08-06-arm64-${process.pid}.tar`);
      let containerId = '';
      try {
        requireDocker(
          docker([
            'build',
            '--platform',
            'linux/arm64',
            '--file',
            'services/platform/Dockerfile',
            '--build-arg',
            `SOURCE_REVISION=${REVISION}`,
            '--tag',
            tag,
            '.',
          ]),
          `docker build --platform linux/arm64 ${tag}`
        );
        const platform = docker([
          'image',
          'inspect',
          '--format',
          '{{.Os}}/{{.Architecture}}',
          tag,
        ]).stdout.trim();
        expect(platform, `platform='${platform}'`).toBe('linux/arm64');
        const entrypoint = docker([
          'image',
          'inspect',
          '--format',
          '{{json .Config.Cmd}}',
          tag,
        ]).stdout.trim();
        expect(entrypoint).toContain('bun');
        expect(entrypoint).toContain('src/index.ts');
        expect(`server_entrypoint='bun src/index.ts'`).toContain('bun src/index.ts');

        const created = docker(['create', '--platform', 'linux/arm64', tag]);
        requireDocker(created, `docker create ${tag}`);
        containerId = created.stdout.trim();
        requireDocker(docker(['export', '--output', archivePath, containerId]), 'docker export');
        const listing = spawnSync('tar', ['-tf', archivePath], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          maxBuffer: 128 * 1024 * 1024,
        });
        expect(listing.status).toBe(0);
        const entries = listing.stdout.split('\n').filter(Boolean);
        expect(entries.length).toBeGreaterThan(0);
        const forbidden = entries.filter(
          (entry) =>
            /(^|\/)\.env($|\.)/.test(entry) ||
            entry.endsWith('/services/platform/config/secrets.yaml') ||
            /\/apps\/|\.expo\/|node_modules\/react-native/.test(entry) ||
            /\.pem$|\.key$/.test(entry)
        );
        expect(forbidden.length, 'forbidden_client_entry_count').toBe(0);
        // Bun server sources exist in the image layers; archive from runtime image has /app/src
        expect(
          entries.some((entry) => /\/src\/index\.ts$/.test(entry) || entry.endsWith('src/index.ts'))
        ).toBe(true);

        const ignore = readFileSync(ROOT_DOCKERIGNORE, 'utf8');
        expect(ignore).toContain('**');
        expect(ignore).toContain('!services/platform/src/**');
      } finally {
        if (containerId) docker(['rm', '-f', containerId]);
        docker(['image', 'rm', '-f', tag]);
        try {
          unlinkSync(archivePath);
        } catch {
          // archive may be absent if export failed
        }
      }
    },
    300_000
  );

  dockerIt(
    'builds the real root context, preserves SOURCE_REVISION metadata, and excludes ignored operator paths',
    () => {
      const tag = `holocron-d06-06-context:${process.pid}`;
      const dockerfile = join(REPO_ROOT, `.d06-06-context-${process.pid}.Dockerfile`);
      const archivePath = join(REPO_ROOT, `.d06-06-context-${process.pid}.tar`);
      const sentinelDir = join(REPO_ROOT, '.tmp', `d06-06-context-${process.pid}`);
      const sentinel = join(sentinelDir, 'operator-state-sentinel');
      let containerId = '';
      try {
        mkdirSync(sentinelDir, { recursive: true });
        writeFileSync(sentinel, 'non-secret context sentinel\n');
        writeFileSync(dockerfile, 'FROM scratch\nCOPY . /context\n');
        requireDocker(
          docker(['build', '--file', dockerfile, '--tag', tag, '.']),
          `docker build ${tag}`
        );
        const created = docker(['create', tag, '/bin/true']);
        requireDocker(created, `docker create ${tag}`);
        containerId = created.stdout.trim();
        expect(containerId, `docker create ${tag} returned no container ID`).toBeTruthy();
        const exported = docker(['export', '--output', archivePath, containerId]);
        requireDocker(exported, `docker export ${containerId}`);
        const archiveListing = spawnSync('tar', ['-tf', archivePath], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          maxBuffer: 128 * 1024 * 1024,
        });
        const archiveDiagnostics =
          archiveListing.stderr.trim() || archiveListing.stdout.trim() || '(no archive listing)';
        expect(archiveListing.status, `tar listing failed: ${archiveDiagnostics}`).toBe(0);
        const archiveEntries = archiveListing.stdout.split('\n').filter(Boolean);
        expect(archiveEntries.some((entry) => entry.endsWith('/operator-state-sentinel'))).toBe(
          false
        );
        expect(archiveEntries.some((entry) => /(^|\/)\.env$/.test(entry))).toBe(false);
        expect(
          archiveEntries.some((entry) => entry.endsWith('/services/platform/config/secrets.yaml'))
        ).toBe(false);

        requireDocker(
          docker([
            'build',
            '--file',
            'services/platform/Dockerfile',
            '--build-arg',
            `SOURCE_REVISION=${REVISION}`,
            '--tag',
            `${tag}-runtime`,
            '.',
          ]),
          `docker build ${tag}-runtime`
        );
        expect(
          docker([
            'image',
            'inspect',
            '--format',
            '{{index .Config.Labels "org.opencontainers.image.revision"}}',
            `${tag}-runtime`,
          ]).stdout.trim()
        ).toBe(REVISION);
        const history = docker(['history', '--no-trunc', `${tag}-runtime`]);
        requireDocker(history, `docker history ${tag}-runtime`);
        expect(history.stdout).not.toMatch(
          /(?:^|[\s/"'])(?:operator-state-sentinel|services\/platform\/config\/secrets\.yaml|\.env)(?=$|[\s/"'])/
        );

        const rendered = docker(['compose', '-f', COMPOSE_PATH, 'config', '--format', 'json'], {
          HOLO_PLATFORM_IMAGE: CANDIDATE,
          FLEET_URL: 'http://host.docker.internal:4545/v1',
          POSTGRES_PASSWORD: 'd06-06-rendered-secret-sentinel',
          DATABASE_URL:
            'postgres://holocron:d06-06-rendered-secret-sentinel@postgres:5432/holocron',
          MASTRA_API_KEY: 'd06-06-rendered-secret-sentinel',
          FLEET_KEY: 'd06-06-rendered-secret-sentinel',
          ZERO_ADMIN_PASSWORD: 'd06-06-rendered-secret-sentinel',
        });
        requireDocker(rendered, 'docker compose config');
        expect(rendered.stdout).not.toContain('d06-06-rendered-secret-sentinel');
      } finally {
        if (containerId) docker(['rm', '-f', containerId]);
        docker(['image', 'rm', '-f', tag]);
        docker(['image', 'rm', '-f', `${tag}-runtime`]);
        rmSync(sentinelDir, { recursive: true, force: true });
        try {
          unlinkSync(archivePath);
        } catch {
          // Export failures can occur before the archive is written.
        }
        try {
          unlinkSync(dockerfile);
        } catch {
          // Build failures can occur before the test fixture is written.
        }
      }
    },
    180_000
  );

  composeIt(
    'runs Compose --wait, then proves scheduler readiness fails after queue_backend_meta becomes not-ready',
    () => {
      const project = `holocron-d06-06-${process.pid}`;
      const testImage = platformTestImage;
      if (!testImage)
        throw new Error('HOLO_PLATFORM_TEST_IMAGE is required for Compose readiness evidence');
      const env = {
        HOLO_PLATFORM_IMAGE: testImage,
        FLEET_URL: 'http://host.docker.internal:4545/v1',
        POSTGRES_PASSWORD: 'd06-06-non-secret-test-password',
        DATABASE_URL: 'postgres://holocron:d06-06-non-secret-test-password@postgres:5432/holocron',
        MASTRA_API_KEY: 'test-key-not-a-production-secret',
        FLEET_KEY: 'test-key-not-a-production-secret',
        ZERO_ADMIN_PASSWORD: 'd06-06-non-secret-zero-password',
        HOLO_POSTGRES_VOLUME: `${project}-postgres`,
        HOLO_BLOB_VOLUME: `${project}-blobs`,
      };
      try {
        requireDocker(
          docker(
            [
              'compose',
              '--project-name',
              project,
              '-f',
              COMPOSE_PATH,
              'up',
              '--wait',
              '--wait-timeout',
              '90',
            ],
            env
          )
        );
        const logs = docker(
          ['compose', '--project-name', project, '-f', COMPOSE_PATH, 'logs', '--no-color'],
          env
        );
        requireDocker(logs);
        expect(logs.stdout).not.toMatch(/d06-06-non-secret-(?:test|zero)-password/);
        const repeatedMigration = mastraMigrationProbe(project, env);
        requireDocker(repeatedMigration, 'idempotent migration rerun');
        expect(repeatedMigration.stdout).toMatch(/already applied|migrations applied: 0/i);
        expect(repeatedMigration.stdout).not.toMatch(/d06-06-non-secret-(?:test|zero)-password/);
        const healthyProbe = schedulerProbe(project, env);
        requireDocker(healthyProbe, 'scheduler readiness probe');
        expect(healthyProbe.stdout).not.toMatch(/d06-06-non-secret-(?:test|zero)-password/);
        const reassertNotReady = () => reassertSchedulerNotReady(project, env);
        reassertNotReady();
        const semanticProbe = schedulerProbe(project, env);
        expect(
          semanticProbe.status,
          semanticProbe.stderr.trim() || semanticProbe.stdout.trim() || '(no probe diagnostics)'
        ).toBe(1);
        expect(semanticProbe.stdout).toContain('"ready":false');

        const schedulerContainer = docker(
          ['compose', '--project-name', project, '-f', COMPOSE_PATH, 'ps', '-q', 'scheduler'],
          env
        );
        requireDocker(schedulerContainer, 'locate scheduler container');
        const schedulerContainerId = schedulerContainer.stdout.trim();
        expect(
          schedulerContainerId,
          'Compose did not return the scheduler container ID'
        ).toBeTruthy();

        // The production healthcheck has a failure budget below the worker's
        // 30s heartbeat interval. Poll Docker's actual health state rather
        // than freezing PID 1 or relying only on the semantic probe.
        expect(
          waitForDockerHealth(
            schedulerContainerId,
            'unhealthy',
            SCHEDULER_HEALTH_TIMEOUT_MS,
            reassertNotReady
          )
        ).toBe('unhealthy');
      } finally {
        // Do not use broad `down -v`; delete only this test's unique volumes.
        docker(
          ['compose', '--project-name', project, '-f', COMPOSE_PATH, 'down', '--remove-orphans'],
          env
        );
        cleanupDockerVolumes([`${project}-postgres`, `${project}-blobs`]);
      }
    },
    SCHEDULER_HEALTH_TIMEOUT_MS + 30_000
  );
});
