/**
 * D06-06 immutable OCI release contract.
 *
 * This module deliberately prepares a release but never starts Compose, touches
 * volumes, or changes cutover state. D06-07 is the only deployment consumer.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

/** Exact OBS-01 Candidate A production topology (12 services). */
export const REQUIRED_SERVICES = [
  'postgres',
  'mastra',
  'scheduler',
  'zero-cache',
  'edge',
  'langfuse-web',
  'langfuse-worker',
  'langfuse-postgres',
  'langfuse-clickhouse',
  'langfuse-redis',
  'langfuse-minio',
  'otel-collector',
] as const;

/** Exact OBS-01 Candidate A durable volume keys (8 volumes). */
export const REQUIRED_VOLUMES = [
  'postgres-data',
  'zero-cache-data',
  'langfuse-postgres-data',
  'clickhouse-data',
  'clickhouse-logs',
  'minio-data',
  'redis-data',
  'otel-queue',
] as const;

export const REQUIRED_VOLUME_NAMES = [
  'holocron-postgres',
  'zero-cache',
  'langfuse-postgres',
  'clickhouse-data',
  'clickhouse-logs',
  'minio-data',
  'redis-data',
  'otel-collector-queue',
] as const;

export const CORE_PLATFORM_SERVICES = ['postgres', 'mastra', 'scheduler', 'zero-cache'] as const;

export const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
export const REVISION_PATTERN = /^[a-f0-9]{40}$/;
/** Required OCI platform for Apple-silicon / portable M1 deployments. */
export const REQUIRED_PLATFORM = 'linux/arm64' as const;
export const PGVECTOR_PG18_IMAGE =
  'pgvector/pgvector@sha256:691673308c99d2161ba298736f3147f1f22d79de2fb7ec93ae9b4afcab870b62';
export const ZERO_CACHE_IMAGE =
  'ghcr.io/rocicorp/zero@sha256:9be2d9303b076f2aef29cbcc629350dbc40cf0531ead59a7f61572eeb65fef72';
export const PGBACKREST_IMAGE =
  'woblerr/pgbackrest@sha256:3e6c90cc4287efad0c16d667992aee9c70226bcb6ef3052f69a0c84121454bce';
export const RESTIC_IMAGE =
  'restic/restic@sha256:740ef3a20c7fe5de05ee031717a610ac8c3d1cf09a06cf77ffd4c3ec26e2302e';
/** OBS-01 Candidate A pins — Langfuse / Collector / edge. */
export const LANGFUSE_WEB_IMAGE =
  'docker.io/langfuse/langfuse@sha256:c2350a95d710f726f6466ffd47675eb704d0ff77fa1df1b9e6751ada6134ef75';
export const LANGFUSE_WORKER_IMAGE =
  'docker.io/langfuse/langfuse-worker@sha256:37a7c4251b602e60fd39451e6c252195908bf61837d4e252adbd752c0809e835';
export const LANGFUSE_CLICKHOUSE_IMAGE =
  'docker.io/clickhouse/clickhouse-server@sha256:8a790dd3468db22b1d4e7b18a176f378ff5ff6053b9c48dd4ea1fa71a24c5ba6';
export const LANGFUSE_REDIS_IMAGE =
  'docker.io/library/redis@sha256:91d0f7e8c748ec7a4c2b4fb2c4f84edab794dd91d01e095e38dc906db9d684ab';
export const LANGFUSE_POSTGRES_IMAGE =
  'docker.io/library/postgres@sha256:e38411452a464af89e5adadb8d223bf53b898d47d6ef918b2d58c08707350449';
export const LANGFUSE_MINIO_IMAGE =
  'cgr.dev/chainguard/minio@sha256:5f2b82fe2edccafed7902f423f171ae5e6b8b363fae72441c0e0e4289dc45555';
export const OTEL_COLLECTOR_IMAGE =
  'docker.io/otel/opentelemetry-collector-contrib@sha256:13b685dc9f68fbbb0fce06d3be84e9d70ba5b90085d79dcbd4c4c0d909ee2d6e';
export const EDGE_IMAGE =
  'docker.io/library/caddy@sha256:dc5640f3339bba2a36cb20392dd32d432bd88d14275cdf1f3637f3107caf7ecc';
export const PGBACKREST_CONF_RELATIVE = 'packages/platform/deploy/compose/pgbackrest.conf';
export const PLATFORM_PGBACKREST_BIN = '/usr/local/bin/pgbackrest';
export const PLATFORM_RESTIC_BIN = '/usr/local/bin/restic';

export type ImagePlatform = { os: string; architecture: string; variant?: string };

/**
 * Parse `docker buildx imagetools inspect` JSON (or a thin manifests wrapper)
 * into platform tuples. Accepts multi-arch indexes and single-platform images.
 */
export function parseImagePlatforms(inspectStdout: string): ImagePlatform[] {
  const trimmed = inspectStdout.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Fall back to plain "linux/arm64" lines from custom --format output.
    return trimmed
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => /^[a-z0-9]+\/[a-z0-9]+/.test(token))
      .map((token) => {
        const [os, architecture, variant] = token.split('/');
        return {
          os: os ?? '',
          architecture: architecture ?? '',
          ...(variant ? { variant } : {}),
        };
      })
      .filter((p) => p.os && p.architecture);
  }
  const platforms: ImagePlatform[] = [];
  const pushPlatform = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    const os = typeof record.os === 'string' ? record.os : '';
    const architecture =
      typeof record.architecture === 'string'
        ? record.architecture
        : typeof record.arch === 'string'
          ? record.arch
          : '';
    if (!os || !architecture) return;
    const variant = typeof record.variant === 'string' ? record.variant : undefined;
    platforms.push({ os, architecture, ...(variant ? { variant } : {}) });
  };
  const walk = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry);
      return;
    }
    const record = value as Record<string, unknown>;
    if (record.platform) pushPlatform(record.platform);
    if (record.Platform) pushPlatform(record.Platform);
    // Single-platform image config often surfaces architecture at the top level.
    if (typeof record.architecture === 'string' || typeof record.os === 'string') {
      pushPlatform(record);
    }
    if (Array.isArray(record.manifests)) walk(record.manifests);
    if (record.manifest && typeof record.manifest === 'object') walk(record.manifest);
    if (record.image && typeof record.image === 'object') walk(record.image);
    if (record.Manifest && typeof record.Manifest === 'object') walk(record.Manifest);
    if (Array.isArray((record.Manifest as { Manifests?: unknown })?.Manifests)) {
      walk((record.Manifest as { Manifests: unknown }).Manifests);
    }
    if (record.schemaVersion !== undefined || record.mediaType !== undefined) {
      // OCI index body
      if (Array.isArray(record.manifests)) walk(record.manifests);
    }
  };
  walk(parsed);
  // De-dupe
  const seen = new Set<string>();
  return platforms.filter((p) => {
    const key = `${p.os}/${p.architecture}${p.variant ? `/${p.variant}` : ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Fail closed unless at least one linux/arm64 platform is present. */
export function assertLinuxArm64Platforms(platforms: ImagePlatform[]): void {
  if (!Array.isArray(platforms) || platforms.length === 0) {
    fail('image manifest response is empty; linux/arm64 is required');
  }
  const compatible = platforms.filter(
    (p) => p.os === 'linux' && (p.architecture === 'arm64' || p.architecture === 'aarch64')
  );
  if (compatible.length === 0) {
    const observed = platforms.map((p) => `${p.os}/${p.architecture}`).join(',') || '(none)';
    fail(
      `image is incompatible with ${REQUIRED_PLATFORM}; observed platforms: ${observed} (amd64-only candidates are rejected)`
    );
  }
}

export type ReleaseLockServiceRecord = {
  name: (typeof REQUIRED_SERVICES)[number] | string;
  repository: string;
  digest: string;
  arm64Digest?: string;
  sourceRevision?: string;
  customBuildRequired?: boolean;
  stateVolumeClass?: 'authoritative' | 'derived' | 'rebuildable';
};

export type ReleaseLockVolumeRecord = {
  key: (typeof REQUIRED_VOLUMES)[number] | string;
  name: string;
  class: 'authoritative' | 'derived' | 'rebuildable';
};

export type ReleaseLock = {
  schemaVersion: 2;
  deployable: boolean;
  nonDeployableReason?: string;
  /** Platform application image (mastra/scheduler). */
  image: string;
  digest: string;
  repoDigest: string;
  sourceRevision: string;
  composeSha256: string;
  previousImage: string;
  previousDigest: string;
  previousRepoDigest: string;
  previousCompatibleRelease?: string;
  migrationHead?: string;
  platform: typeof REQUIRED_PLATFORM;
  services: ReleaseLockServiceRecord[];
  volumes: ReleaseLockVolumeRecord[];
  generatedAt: string;
};

export type ProcessResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

export type ProcessRunner = (
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
) => ProcessResult;

export type PackageOptions = {
  image: string;
  previousImage: string;
  composePath: string;
  lockPath: string;
  cwd?: string;
  now?: () => Date;
  runner?: ProcessRunner;
};

export type RollbackPreflightOptions = {
  composePath: string;
  lockPath: string;
  cwd?: string;
  runner?: ProcessRunner;
};

export type ImageIdentity = {
  image: string;
  digest: string;
  repoDigest: string;
  revision?: string;
};

type ComposeService = Record<string, unknown>;
type ComposeContract = {
  services?: Record<string, ComposeService>;
  volumes?: Record<string, unknown>;
};

const defaultRunner: ProcessRunner = (command, args, cwd, env = process.env) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
};

function fail(message: string): never {
  throw new Error(`deploy:package refused: ${message}`);
}

export function digestFromImage(image: string): string {
  const at = image.lastIndexOf('@');
  const digest = at < 0 ? '' : image.slice(at + 1);
  if (!DIGEST_PATTERN.test(digest))
    fail(`image must be digest-qualified (@sha256:<64-hex>), got ${image}`);
  return digest;
}

function imageRepository(image: string): string {
  const at = image.lastIndexOf('@');
  return at < 0 ? image : image.slice(0, at);
}

function isSyntheticDigest(digest: string): boolean {
  const value = digest.slice('sha256:'.length);
  return (
    /^(.)\1{63}$/.test(value) ||
    value === '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' ||
    value === 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
  );
}

/** Reject example registries and known checked-in placeholder identities. */
export function assertDeployableImage(image: string): string {
  const digest = digestFromImage(image);
  const repository = imageRepository(image);
  if (!repository || /(^|\.)example(?=[:/]|$)/i.test(repository)) {
    fail(`image repository is a placeholder and cannot be deployed: ${repository || '(empty)'}`);
  }
  if (isSyntheticDigest(digest))
    fail(`image digest is synthetic and cannot be deployed: ${digest}`);
  return digest;
}

export function assertSourceRevision(revision: string): void {
  if (!REVISION_PATTERN.test(revision))
    fail(`source revision must be an exact 40-hex Git revision, got ${revision || '(empty)'}`);
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function readCompose(path: string): ComposeContract {
  if (!existsSync(path)) fail(`Compose manifest is missing: ${path}`);
  return asObject(parseYaml(readFileSync(path, 'utf8')), 'Compose manifest') as ComposeContract;
}

function hasHealthyPostgresDependency(service: ComposeService): boolean {
  const depends = service.depends_on;
  if (!depends || typeof depends !== 'object' || Array.isArray(depends)) return false;
  const postgres = (depends as Record<string, unknown>).postgres;
  return Boolean(
    postgres &&
      typeof postgres === 'object' &&
      !Array.isArray(postgres) &&
      (postgres as Record<string, unknown>).condition === 'service_healthy'
  );
}

function hasHealthyDependency(service: ComposeService, dependency: string): boolean {
  const depends = service.depends_on;
  if (!depends || typeof depends !== 'object' || Array.isArray(depends)) return false;
  const target = (depends as Record<string, unknown>)[dependency];
  return Boolean(
    target &&
      typeof target === 'object' &&
      !Array.isArray(target) &&
      (target as Record<string, unknown>).condition === 'service_healthy'
  );
}

function hasMastraMigrationBootstrap(service: ComposeService): boolean {
  const command = service.command;
  const parts = Array.isArray(command)
    ? command.filter((entry): entry is string => typeof entry === 'string')
    : typeof command === 'string'
      ? [command]
      : [];
  const text = parts.join('\n');
  const migration = text.indexOf('bun src/cli/holo.ts db:migrate');
  const server = text.indexOf('exec bun src/index.ts');
  return migration >= 0 && server > migration;
}

function hasHealthcheck(service: ComposeService): boolean {
  const health = service.healthcheck;
  if (!health || typeof health !== 'object' || Array.isArray(health)) return false;
  const test = (health as Record<string, unknown>).test;
  return Array.isArray(test) && test.length > 1 && test.every((entry) => typeof entry === 'string');
}

function hasNamedVolume(service: ComposeService, name: string): boolean {
  const volumes = service.volumes;
  return (
    Array.isArray(volumes) &&
    volumes.some(
      (entry) =>
        (typeof entry === 'string' && entry.startsWith(`${name}:`)) ||
        (entry !== null &&
          typeof entry === 'object' &&
          !Array.isArray(entry) &&
          (entry as Record<string, unknown>).type === 'volume' &&
          (entry as Record<string, unknown>).source === name)
    )
  );
}

function hasNamedVolumeMount(service: ComposeService, name: string, target: string): boolean {
  const volumes = service.volumes;
  return (
    Array.isArray(volumes) &&
    volumes.some(
      (entry) =>
        entry === `${name}:${target}` ||
        (entry !== null &&
          typeof entry === 'object' &&
          !Array.isArray(entry) &&
          (entry as Record<string, unknown>).type === 'volume' &&
          (entry as Record<string, unknown>).source === name &&
          (entry as Record<string, unknown>).target === target)
    )
  );
}

/** Short-form `src:target[:mode]` strings or Compose JSON long-form `{ target }`. */
function volumeMountSpecs(service: ComposeService): string[] {
  const volumes = service.volumes;
  if (!Array.isArray(volumes)) return [];
  const specs: string[] = [];
  for (const entry of volumes) {
    if (typeof entry === 'string') {
      specs.push(entry);
      continue;
    }
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      const target = (entry as Record<string, unknown>).target;
      if (typeof target === 'string' && target.length > 0) specs.push(target);
    }
  }
  return specs;
}

function hasPathMount(service: ComposeService, mountPath: string): boolean {
  return volumeMountSpecs(service).some(
    (spec) => spec === mountPath || spec.includes(`:${mountPath}`) || spec.endsWith(mountPath)
  );
}

function hasDatabaseUrlSecretMount(service: ComposeService): boolean {
  const secrets = service.secrets;
  return (
    Array.isArray(secrets) &&
    secrets.some(
      (entry) =>
        entry !== null &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        (entry as Record<string, unknown>).source === 'database-url' &&
        (entry as Record<string, unknown>).target === 'database_url'
    )
  );
}

function exposesDatabaseUrlEnvironment(service: ComposeService): boolean {
  const environment = service.environment;
  if (Array.isArray(environment)) {
    return environment.some(
      (entry) => typeof entry === 'string' && /^DATABASE_URL(?:=|$)/.test(entry)
    );
  }
  return (
    environment !== null &&
    typeof environment === 'object' &&
    !Array.isArray(environment) &&
    Object.hasOwn(environment, 'DATABASE_URL')
  );
}

function hasSemanticSchedulerHealthcheck(service: ComposeService): boolean {
  const health = service.healthcheck;
  if (!health || typeof health !== 'object' || Array.isArray(health)) return false;
  const test = (health as Record<string, unknown>).test;
  return (
    Array.isArray(test) &&
    test.length === 2 &&
    test[0] === 'CMD-SHELL' &&
    typeof test[1] === 'string' &&
    /^export DATABASE_URL="\${1,2}\(cat \/run\/secrets\/database_url\)"; exec bun src\/queue\/probe-cli\.ts$/.test(
      test[1]
    )
  );
}

function hasZeroReadOnlyMutationFence(service: ComposeService): boolean {
  const environment = service.environment;
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) return false;
  const env = environment as Record<string, unknown>;
  if (env.ZERO_ENABLE_CRUD_MUTATIONS !== 'false') return false;
  if (Object.hasOwn(env, 'ZERO_MUTATE_URL') || Object.hasOwn(env, 'ZERO_PUSH_URL')) return false;
  const command = JSON.stringify(service.command ?? '');
  return !/--(?:mutate|push)-url|ZERO_(?:MUTATE|PUSH)_URL/.test(command);
}

function keepsZeroCredentialsOutOfArgv(service: ComposeService): boolean {
  const command = JSON.stringify(service.command ?? '');
  const exportsRuntimeSecrets =
    command.includes('ZERO_UPSTREAM_DB') &&
    command.includes('/run/secrets/database_url') &&
    command.includes('ZERO_ADMIN_PASSWORD') &&
    command.includes('/run/secrets/zero_admin_password');
  return (
    exportsRuntimeSecrets &&
    !/--(?:upstream-db|cvr-db|change-db|admin-password)(?:[\s"']|$)/.test(command)
  );
}

function containsCredentialLiteral(value: unknown): boolean {
  if (typeof value === 'string') {
    return /(?:postgres(?:ql)?:\/\/[^\s"']*:[^\s"']+@|sk-[A-Za-z0-9_-]{8,}|api[_-]?key\s*[:=]\s*[^$\s"']+)/i.test(
      value
    );
  }
  if (Array.isArray(value)) return value.some(containsCredentialLiteral);
  if (value && typeof value === 'object')
    return Object.values(value).some(containsCredentialLiteral);
  return false;
}

function hasPublishedPorts(service: ComposeService): boolean {
  const ports = service.ports;
  return Array.isArray(ports) && ports.length > 0;
}

function edgePublishes44111(service: ComposeService): boolean {
  const ports = service.ports;
  if (!Array.isArray(ports) || ports.length === 0) return false;
  return ports.some((entry) => {
    if (typeof entry === 'string') return entry.includes('44111');
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const published = String((entry as Record<string, unknown>).published ?? '');
      const target = String((entry as Record<string, unknown>).target ?? '');
      return published === '44111' || target === '44111' || JSON.stringify(entry).includes('44111');
    }
    return false;
  });
}

function assertPinnedImage(service: ComposeService, name: string, expected: string): void {
  if (service.image !== expected) {
    fail(`${name} must use pinned image ${expected}`);
  }
}

/** Validate the static Compose safety and topology contract without running it. */
export function assertComposeContract(compose: ComposeContract, image?: string): void {
  const services = asObject(compose.services, 'Compose services') as Record<string, ComposeService>;
  const actual = Object.keys(services).sort();
  const expected = [...REQUIRED_SERVICES].sort();
  if (actual.join(',') !== expected.join(',')) {
    fail(
      `required services are exactly ${REQUIRED_SERVICES.join(',')}; got ${actual.join(',') || '(none)'}`
    );
  }

  const core = {
    postgres: asObject(services.postgres, 'postgres service') as ComposeService,
    mastra: asObject(services.mastra, 'mastra service') as ComposeService,
    scheduler: asObject(services.scheduler, 'scheduler service') as ComposeService,
    'zero-cache': asObject(services['zero-cache'], 'zero-cache service') as ComposeService,
  } satisfies Record<(typeof CORE_PLATFORM_SERVICES)[number], ComposeService>;

  for (const name of REQUIRED_SERVICES) {
    const service = asObject(services[name], `${name} service`) as ComposeService;
    if (service.restart !== 'unless-stopped') fail(`${name} must use restart: unless-stopped`);
    if (!hasHealthcheck(service)) fail(`${name} requires a real healthcheck`);
  }
  if (!hasSemanticSchedulerHealthcheck(core.scheduler)) {
    fail(
      'scheduler healthcheck must read /run/secrets/database_url and probe queue_backend_meta through queue/probe-cli.ts'
    );
  }
  if (!hasDatabaseUrlSecretMount(core.scheduler)) {
    fail('scheduler must mount database-url at /run/secrets/database_url');
  }
  if (exposesDatabaseUrlEnvironment(core.scheduler)) {
    fail('scheduler DATABASE_URL must remain runtime-only and absent from Compose environment');
  }
  if (!hasZeroReadOnlyMutationFence(core['zero-cache'])) {
    fail(
      'zero-cache must disable legacy CRUD mutations and omit every custom mutate/push URL during read-only soak'
    );
  }
  if (!keepsZeroCredentialsOutOfArgv(core['zero-cache'])) {
    fail(
      'zero-cache must read database/admin secrets into Zero environment variables without credential-bearing argv flags'
    );
  }

  if (!hasMastraMigrationBootstrap(core.mastra)) {
    fail('mastra must run bun src/cli/holo.ts db:migrate before exec bun src/index.ts');
  }

  for (const name of ['mastra', 'scheduler', 'zero-cache'] as const) {
    if (!hasHealthyPostgresDependency(core[name])) {
      fail(`${name} must depend on postgres with condition: service_healthy`);
    }
  }
  for (const name of ['scheduler', 'zero-cache'] as const) {
    if (!hasHealthyDependency(core[name], 'mastra')) {
      fail(`${name} must depend on mastra with condition: service_healthy after migration`);
    }
  }

  const volumes = asObject(compose.volumes, 'Compose volumes');
  const volumeKeys = Object.keys(volumes).sort();
  if (volumeKeys.join(',') !== [...REQUIRED_VOLUMES].sort().join(',')) {
    fail(
      `required volumes are exactly ${REQUIRED_VOLUMES.join(',')}; got ${volumeKeys.join(',') || '(none)'}`
    );
  }
  if (core.postgres.image !== PGVECTOR_PG18_IMAGE) {
    fail(`postgres must use the verified PG18 pgvector image ${PGVECTOR_PG18_IMAGE}`);
  }
  if (!hasNamedVolumeMount(core.postgres, 'postgres-data', '/var/lib/postgresql')) {
    fail('postgres must mount postgres-data at /var/lib/postgresql for PG18');
  }
  // Blobs remain bind/path mounted (not one of the eight declared state volumes).
  // Docker Compose `--format json` emits long-form `{ type, source, target }`
  // objects; `String(entry)` is `[object Object]` and must not be the check.
  if (!hasPathMount(core.mastra, '/var/lib/holocron/blobs')) {
    fail('mastra must mount blob storage at /var/lib/holocron/blobs');
  }
  if (!hasPathMount(core.scheduler, '/var/lib/holocron/blobs')) {
    fail('scheduler must mount blob storage at /var/lib/holocron/blobs');
  }
  if (!hasNamedVolume(core['zero-cache'], 'zero-cache-data')) {
    fail('zero-cache must mount zero-cache-data');
  }

  assertPinnedImage(services['langfuse-web'] as ComposeService, 'langfuse-web', LANGFUSE_WEB_IMAGE);
  assertPinnedImage(
    services['langfuse-worker'] as ComposeService,
    'langfuse-worker',
    LANGFUSE_WORKER_IMAGE
  );
  assertPinnedImage(
    services['langfuse-clickhouse'] as ComposeService,
    'langfuse-clickhouse',
    LANGFUSE_CLICKHOUSE_IMAGE
  );
  assertPinnedImage(
    services['langfuse-redis'] as ComposeService,
    'langfuse-redis',
    LANGFUSE_REDIS_IMAGE
  );
  assertPinnedImage(
    services['langfuse-postgres'] as ComposeService,
    'langfuse-postgres',
    LANGFUSE_POSTGRES_IMAGE
  );
  assertPinnedImage(
    services['langfuse-minio'] as ComposeService,
    'langfuse-minio',
    LANGFUSE_MINIO_IMAGE
  );
  assertPinnedImage(
    services['otel-collector'] as ComposeService,
    'otel-collector',
    OTEL_COLLECTOR_IMAGE
  );
  assertPinnedImage(services.edge as ComposeService, 'edge', EDGE_IMAGE);

  for (const name of REQUIRED_SERVICES) {
    if (name === 'edge') continue;
    if (hasPublishedPorts(services[name] as ComposeService)) {
      fail(`${name} must not publish host ports in production`);
    }
  }
  if (!edgePublishes44111(services.edge as ComposeService)) {
    fail('edge must publish loopback 44111');
  }

  for (const name of ['mastra', 'scheduler'] as const) {
    const serviceImage = core[name].image;
    if (typeof serviceImage !== 'string') fail(`${name} requires an application image`);
    if (serviceImage.includes('${') && !serviceImage.includes('HOLO_PLATFORM_IMAGE')) {
      fail(`${name} must reference HOLO_PLATFORM_IMAGE when interpolated`);
    }
    if (!serviceImage.includes('${')) digestFromImage(serviceImage);
  }

  for (const name of ['postgres', 'zero-cache'] as const) {
    const serviceImage = core[name].image;
    if (typeof serviceImage !== 'string') fail(`${name} requires an immutable image`);
    digestFromImage(serviceImage);
  }

  if (image) {
    const expectedImage = image;
    for (const name of ['mastra', 'scheduler'] as const) {
      if (core[name].image !== expectedImage) fail(`${name} image does not match release image`);
    }
  }

  if (containsCredentialLiteral(compose)) fail('rendered Compose contains a credential literal');
}

export function composeSha256(path: string): string {
  if (!existsSync(path)) fail(`Compose manifest is missing: ${path}`);
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function selectRollbackDigest(lock: Pick<ReleaseLock, 'previousDigest'>): string {
  if (!DIGEST_PATTERN.test(lock.previousDigest))
    fail('previous rollback digest is missing or invalid');
  return lock.previousDigest;
}

export function selectRollbackImage(
  lock: Pick<ReleaseLock, 'deployable' | 'previousImage' | 'previousDigest'>
): string {
  if (lock.deployable !== true) fail('release lock is explicitly non-deployable');
  const digest = assertDeployableImage(lock.previousImage);
  if (digest !== selectRollbackDigest(lock)) fail('previous rollback image and digest disagree');
  return lock.previousImage;
}

function runOrFail(
  runner: ProcessRunner,
  cwd: string,
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv
): ProcessResult {
  const result = runner(command, args, cwd, env);
  if (result.status !== 0) {
    // Never embed child stdout/stderr — they may include env-expanded secrets.
    fail(`${command} ${args.join(' ')} failed (exit ${result.status ?? 'null'})`);
  }
  return result;
}

function inspectRemoteDigest(runner: ProcessRunner, cwd: string, image: string): string {
  const inspected = runOrFail(runner, cwd, 'docker', ['buildx', 'imagetools', 'inspect', image]);
  const output = inspected.stdout.trim();
  const digest = DIGEST_PATTERN.test(output)
    ? output
    : (/^Digest:\s+(sha256:[a-f0-9]{64})$/m.exec(output)?.[1] ?? '');
  if (!DIGEST_PATTERN.test(digest)) fail(`Docker did not return a RepoDigest for ${image}`);
  return digest;
}

function inspectLocalRepoDigest(runner: ProcessRunner, cwd: string, image: string): string {
  runOrFail(runner, cwd, 'docker', ['pull', image]);
  const inspected = runOrFail(runner, cwd, 'docker', [
    'image',
    'inspect',
    '--format',
    '{{json .RepoDigests}}',
    image,
  ]);
  let repoDigests: unknown;
  try {
    repoDigests = JSON.parse(inspected.stdout);
  } catch {
    fail(`Docker did not return JSON RepoDigests for ${image}`);
  }
  if (!Array.isArray(repoDigests) || !repoDigests.includes(image)) {
    fail(`Docker local RepoDigest does not include exact image identity ${image}`);
  }
  return image;
}

function inspectSourceRevision(
  runner: ProcessRunner,
  cwd: string,
  image: string,
  expectedRevision: string
): string {
  const label = runOrFail(runner, cwd, 'docker', [
    'image',
    'inspect',
    '--format',
    '{{index .Config.Labels "org.opencontainers.image.revision"}}',
    image,
  ]).stdout.trim();
  if (label !== expectedRevision) {
    fail(`OCI source revision ${label || '(empty)'} does not match Git ${expectedRevision}`);
  }
  return label;
}

/**
 * Verify remote manifest resolution, local pulled OCI config, and (for the
 * candidate) the exact SOURCE_REVISION propagated to its OCI revision label.
 */
export function verifyImageIdentity(
  runner: ProcessRunner,
  cwd: string,
  image: string,
  expectedRevision?: string
): ImageIdentity {
  const digest = assertDeployableImage(image);
  const remoteDigest = inspectRemoteDigest(runner, cwd, image);
  if (remoteDigest !== digest) {
    fail(`remote manifest digest ${remoteDigest} does not match requested ${digest}`);
  }
  const repoDigest = inspectLocalRepoDigest(runner, cwd, image);
  const revision = expectedRevision
    ? inspectSourceRevision(runner, cwd, image, expectedRevision)
    : undefined;
  return { image, digest, repoDigest, revision };
}

function parseReleaseLock(path: string): ReleaseLock {
  if (!existsSync(path)) fail(`release lock is missing: ${path}`);
  let candidate: unknown;
  try {
    candidate = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail(`release lock is not valid JSON: ${path}`);
  }
  const lock = asObject(candidate, 'release lock') as Partial<ReleaseLock>;
  const requiredLockString = (value: unknown, field: string): string => {
    if (typeof value !== 'string' || !value) fail(`release lock ${field} is missing`);
    return value;
  };
  if (lock.schemaVersion !== 2) {
    fail('release lock is not a schema v2 lock');
  }
  if (lock.deployable !== true) {
    fail('release lock is not a deployable schema v2 lock');
  }
  for (const field of [
    'image',
    'digest',
    'repoDigest',
    'sourceRevision',
    'composeSha256',
    'previousImage',
    'previousDigest',
    'previousRepoDigest',
    'generatedAt',
  ] as const) {
    requiredLockString(lock[field], field);
  }
  if (lock.platform !== REQUIRED_PLATFORM) {
    fail(`release lock platform must be ${REQUIRED_PLATFORM}`);
  }
  if (!Array.isArray(lock.services) || lock.services.length !== REQUIRED_SERVICES.length) {
    fail(`release lock services must list exactly ${REQUIRED_SERVICES.length} services`);
  }
  if (!Array.isArray(lock.volumes) || lock.volumes.length !== REQUIRED_VOLUMES.length) {
    fail(`release lock volumes must list exactly ${REQUIRED_VOLUMES.length} volumes`);
  }
  const sourceRevision = requiredLockString(lock.sourceRevision, 'sourceRevision');
  const composeSha256Value = requiredLockString(lock.composeSha256, 'composeSha256');
  const image = requiredLockString(lock.image, 'image');
  const digest = requiredLockString(lock.digest, 'digest');
  assertSourceRevision(sourceRevision);
  if (!/^[a-f0-9]{64}$/.test(composeSha256Value)) fail('release lock composeSha256 is invalid');
  if (assertDeployableImage(image) !== digest) fail('release lock image and digest disagree');
  if (selectRollbackImage(lock as ReleaseLock) !== lock.previousImage) {
    fail('release lock previous image cannot be selected');
  }
  if (lock.image === lock.previousImage)
    fail('release lock candidate and rollback images must differ');
  return lock as ReleaseLock;
}

export function buildReleaseLockServiceRecords(platformImage: string): ReleaseLockServiceRecord[] {
  const platformDigest = digestFromImage(platformImage);
  const platformRepo = imageRepository(platformImage);
  return [
    {
      name: 'postgres',
      repository: imageRepository(PGVECTOR_PG18_IMAGE),
      digest: digestFromImage(PGVECTOR_PG18_IMAGE),
      stateVolumeClass: 'authoritative',
    },
    {
      name: 'mastra',
      repository: platformRepo,
      digest: platformDigest,
      stateVolumeClass: 'rebuildable',
    },
    {
      name: 'scheduler',
      repository: platformRepo,
      digest: platformDigest,
      stateVolumeClass: 'rebuildable',
    },
    {
      name: 'zero-cache',
      repository: imageRepository(ZERO_CACHE_IMAGE),
      digest: digestFromImage(ZERO_CACHE_IMAGE),
      stateVolumeClass: 'derived',
    },
    {
      name: 'edge',
      repository: imageRepository(EDGE_IMAGE),
      digest: digestFromImage(EDGE_IMAGE),
      stateVolumeClass: 'rebuildable',
    },
    {
      name: 'langfuse-web',
      repository: imageRepository(LANGFUSE_WEB_IMAGE),
      digest: digestFromImage(LANGFUSE_WEB_IMAGE),
      sourceRevision: '2371d606c4ab8882f09f6afce5b73948698552c6',
      customBuildRequired: true,
      stateVolumeClass: 'rebuildable',
    },
    {
      name: 'langfuse-worker',
      repository: imageRepository(LANGFUSE_WORKER_IMAGE),
      digest: digestFromImage(LANGFUSE_WORKER_IMAGE),
      stateVolumeClass: 'rebuildable',
    },
    {
      name: 'langfuse-postgres',
      repository: imageRepository(LANGFUSE_POSTGRES_IMAGE),
      digest: digestFromImage(LANGFUSE_POSTGRES_IMAGE),
      stateVolumeClass: 'authoritative',
    },
    {
      name: 'langfuse-clickhouse',
      repository: imageRepository(LANGFUSE_CLICKHOUSE_IMAGE),
      digest: digestFromImage(LANGFUSE_CLICKHOUSE_IMAGE),
      stateVolumeClass: 'authoritative',
    },
    {
      name: 'langfuse-redis',
      repository: imageRepository(LANGFUSE_REDIS_IMAGE),
      digest: digestFromImage(LANGFUSE_REDIS_IMAGE),
      stateVolumeClass: 'rebuildable',
    },
    {
      name: 'langfuse-minio',
      repository: imageRepository(LANGFUSE_MINIO_IMAGE),
      digest: digestFromImage(LANGFUSE_MINIO_IMAGE),
      stateVolumeClass: 'authoritative',
    },
    {
      name: 'otel-collector',
      repository: imageRepository(OTEL_COLLECTOR_IMAGE),
      digest: digestFromImage(OTEL_COLLECTOR_IMAGE),
      stateVolumeClass: 'derived',
    },
  ];
}

export function buildReleaseLockVolumeRecords(): ReleaseLockVolumeRecord[] {
  return [
    { key: 'postgres-data', name: 'holocron-postgres', class: 'authoritative' },
    { key: 'zero-cache-data', name: 'zero-cache', class: 'derived' },
    { key: 'langfuse-postgres-data', name: 'langfuse-postgres', class: 'authoritative' },
    { key: 'clickhouse-data', name: 'clickhouse-data', class: 'authoritative' },
    { key: 'clickhouse-logs', name: 'clickhouse-logs', class: 'rebuildable' },
    { key: 'minio-data', name: 'minio-data', class: 'authoritative' },
    { key: 'redis-data', name: 'redis-data', class: 'rebuildable' },
    { key: 'otel-queue', name: 'otel-collector-queue', class: 'derived' },
  ];
}

function renderCompose(
  runner: ProcessRunner,
  cwd: string,
  composePath: string,
  image: string
): void {
  const before = process.env.HOLO_PLATFORM_IMAGE;
  // Staging/package only validates the rendered contract. Provide non-secret
  // placeholders for required Compose interpolations that deploy:apply supplies
  // from the operator secret store at apply time.
  const renderEnv: NodeJS.ProcessEnv = {
    ...process.env,
    HOLO_PLATFORM_IMAGE: image,
    FLEET_URL: process.env.FLEET_URL || 'http://host.docker.internal:4545',
    POSTGRES_DB: process.env.POSTGRES_DB || 'holocron',
    POSTGRES_USER: process.env.POSTGRES_USER || 'holocron',
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || 'stage-render-placeholder',
    DATABASE_URL: process.env.DATABASE_URL || 'postgres://holocron@127.0.0.1:44112/holocron',
    MASTRA_API_KEY: process.env.MASTRA_API_KEY || 'stage-render-placeholder',
    FLEET_KEY: process.env.FLEET_KEY || 'stage-render-placeholder',
    ZERO_ADMIN_PASSWORD: process.env.ZERO_ADMIN_PASSWORD || 'stage-render-placeholder',
    LANGFUSE_DATABASE_URL:
      process.env.LANGFUSE_DATABASE_URL || 'postgres://langfuse@langfuse-postgres:5432/langfuse',
    LANGFUSE_NEXTAUTH_URL: process.env.LANGFUSE_NEXTAUTH_URL || 'http://127.0.0.1:44111',
    LANGFUSE_NEXTAUTH_SECRET: process.env.LANGFUSE_NEXTAUTH_SECRET || 'stage-render-placeholder',
    LANGFUSE_SALT: process.env.LANGFUSE_SALT || 'stage-render-placeholder',
    LANGFUSE_ENCRYPTION_KEY:
      process.env.LANGFUSE_ENCRYPTION_KEY ||
      '0000000000000000000000000000000000000000000000000000000000000000',
    LANGFUSE_CLICKHOUSE_MIGRATION_URL:
      process.env.LANGFUSE_CLICKHOUSE_MIGRATION_URL || 'clickhouse://langfuse-clickhouse:9000',
    LANGFUSE_CLICKHOUSE_URL:
      process.env.LANGFUSE_CLICKHOUSE_URL || 'http://langfuse-clickhouse:8123',
    LANGFUSE_CLICKHOUSE_DB: process.env.LANGFUSE_CLICKHOUSE_DB || 'default',
    LANGFUSE_CLICKHOUSE_USER: process.env.LANGFUSE_CLICKHOUSE_USER || 'clickhouse',
    LANGFUSE_CLICKHOUSE_PASSWORD:
      process.env.LANGFUSE_CLICKHOUSE_PASSWORD || 'stage-render-placeholder',
    LANGFUSE_S3_BUCKET: process.env.LANGFUSE_S3_BUCKET || 'langfuse',
    LANGFUSE_S3_ACCESS_KEY_ID: process.env.LANGFUSE_S3_ACCESS_KEY_ID || 'stage-render-placeholder',
    LANGFUSE_S3_SECRET_ACCESS_KEY:
      process.env.LANGFUSE_S3_SECRET_ACCESS_KEY || 'stage-render-placeholder',
    LANGFUSE_S3_ENDPOINT: process.env.LANGFUSE_S3_ENDPOINT || 'http://langfuse-minio:9000',
    LANGFUSE_REDIS_AUTH: process.env.LANGFUSE_REDIS_AUTH || 'stage-render-placeholder',
    LANGFUSE_POSTGRES_USER: process.env.LANGFUSE_POSTGRES_USER || 'langfuse',
    LANGFUSE_POSTGRES_DB: process.env.LANGFUSE_POSTGRES_DB || 'langfuse',
    LANGFUSE_POSTGRES_PASSWORD:
      process.env.LANGFUSE_POSTGRES_PASSWORD || 'stage-render-placeholder',
    LANGFUSE_INIT_ORG_ID: process.env.LANGFUSE_INIT_ORG_ID || 'holocron-observability',
    LANGFUSE_INIT_ORG_NAME: process.env.LANGFUSE_INIT_ORG_NAME || 'Holocron',
    LANGFUSE_INIT_PROJECT_ID: process.env.LANGFUSE_INIT_PROJECT_ID || 'holocron',
    LANGFUSE_INIT_PROJECT_NAME: process.env.LANGFUSE_INIT_PROJECT_NAME || 'Holocron',
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY || 'pk-lf-stage-render-placeholder',
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY || 'lf-stage-render-placeholder',
    LANGFUSE_INIT_USER_EMAIL: process.env.LANGFUSE_INIT_USER_EMAIL || 'ops@example.invalid',
    LANGFUSE_INIT_USER_NAME: process.env.LANGFUSE_INIT_USER_NAME || 'ops',
    LANGFUSE_INIT_USER_PASSWORD:
      process.env.LANGFUSE_INIT_USER_PASSWORD || 'stage-render-placeholder',
    LANGFUSE_OTLP_ENDPOINT:
      process.env.LANGFUSE_OTLP_ENDPOINT || 'http://langfuse-web:3000/api/public/otel',
    LANGFUSE_AUTH_HEADER: process.env.LANGFUSE_AUTH_HEADER || 'Basic stage-render-placeholder',
    // Compose interpolates this into mastra.environment. A live key in the
    // project `.env` would otherwise land in the rendered JSON and trip the
    // credential-literal scan. Apply injects the real value at compose-up.
    DEEPSEEK_API_KEY: 'stage-render-placeholder',
    JINA_API_KEY: 'stage-render-placeholder',
    EXA_API_KEY: 'stage-render-placeholder',
  };
  try {
    process.env.HOLO_PLATFORM_IMAGE = image;
    const rendered = runOrFail(
      runner,
      cwd,
      'docker',
      ['compose', '-f', composePath, 'config', '--format', 'json'],
      renderEnv
    );
    let contract: unknown;
    try {
      contract = JSON.parse(rendered.stdout);
    } catch {
      fail('Docker Compose did not return rendered JSON contract');
    }
    assertComposeContract(contract as ComposeContract, image);
  } finally {
    if (before === undefined) delete process.env.HOLO_PLATFORM_IMAGE;
    else process.env.HOLO_PLATFORM_IMAGE = before;
  }
}

/**
 * Verify a pushed digest, a clean exact revision, and rendered Compose before
 * writing the lock consumed by D06-07. It cannot start services or mutate data.
 */
export function packageRelease(options: PackageOptions): ReleaseLock {
  const cwd = options.cwd ?? process.cwd();
  const runner = options.runner ?? defaultRunner;
  const imageDigest = assertDeployableImage(options.image);
  const previousDigest = assertDeployableImage(options.previousImage);
  if (imageDigest === previousDigest)
    fail('previous rollback image must differ from the candidate image');

  const revision = runOrFail(runner, cwd, 'git', ['rev-parse', 'HEAD']).stdout.trim();
  assertSourceRevision(revision);
  const dirty = runOrFail(runner, cwd, 'git', [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
  ]).stdout.trim();
  if (dirty) fail('source tree is dirty; commit the candidate before packaging');

  const compose = readCompose(options.composePath);
  assertComposeContract(compose);
  const candidate = verifyImageIdentity(runner, cwd, options.image, revision);
  const previous = verifyImageIdentity(runner, cwd, options.previousImage);
  if (candidate.digest !== imageDigest || previous.digest !== previousDigest) {
    fail('Docker image identities do not match requested release digests');
  }
  renderCompose(runner, cwd, options.composePath, options.image);

  const lock: ReleaseLock = {
    schemaVersion: 2,
    deployable: true,
    image: options.image,
    digest: imageDigest,
    repoDigest: candidate.repoDigest,
    sourceRevision: revision,
    composeSha256: composeSha256(options.composePath),
    previousImage: options.previousImage,
    previousDigest,
    previousRepoDigest: previous.repoDigest,
    platform: REQUIRED_PLATFORM,
    services: buildReleaseLockServiceRecords(options.image),
    volumes: buildReleaseLockVolumeRecords(),
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
  };
  selectRollbackDigest(lock);
  writeFileSync(options.lockPath, `${JSON.stringify(lock, null, 2)}\n`, { mode: 0o644 });
  return lock;
}

/**
 * Select and verify the previously locked image without starting Compose or
 * deleting volumes. D06-07 may consume the selected immutable image later.
 */
export function preflightRollback(options: RollbackPreflightOptions): ReleaseLock {
  const cwd = options.cwd ?? process.cwd();
  const runner = options.runner ?? defaultRunner;
  const lock = parseReleaseLock(options.lockPath);
  if (composeSha256(options.composePath) !== lock.composeSha256) {
    fail('Compose manifest checksum differs from the release lock');
  }
  const candidate = verifyImageIdentity(runner, cwd, lock.image, lock.sourceRevision);
  const previousImage = selectRollbackImage(lock);
  const previous = verifyImageIdentity(runner, cwd, previousImage);
  if (candidate.repoDigest !== lock.repoDigest || previous.repoDigest !== lock.previousRepoDigest) {
    fail('Docker RepoDigest differs from the release lock');
  }
  renderCompose(runner, cwd, options.composePath, previousImage);
  return lock;
}

export function defaultComposePath(cwd = process.cwd()): string {
  return resolve(cwd, 'packages/platform/deploy/compose/compose.yaml');
}

export type ExactReleaseManifest = {
  schemaVersion: 1;
  sourceRevision: string;
  composeSha256: string;
  imageDigests: Record<string, string>;
  images: Record<string, string>;
  backupRunner: {
    pgbackrestConfPath: string;
    pgbackrestConfSha256: string;
    pgbackrestImage: string;
    resticImage: string;
    platformBinaryPaths: { pgbackrest: string; restic: string };
  };
  artifactPaths: Record<string, string>;
  generatedAt: string;
};

export type ExactShaOptions = {
  cwd: string;
  sourceRevision: string;
  runner?: ProcessRunner;
};

/**
 * Fail closed before any image build/push when the tree is dirty or HEAD is not
 * the requested 40-hex revision.
 */
export function assertCleanExactSha(options: ExactShaOptions): string {
  const runner = options.runner ?? defaultRunner;
  const cwd = options.cwd;
  assertSourceRevision(options.sourceRevision);
  const head = runner('git', ['rev-parse', 'HEAD'], cwd).stdout.trim();
  assertSourceRevision(head);
  if (head !== options.sourceRevision) {
    fail(
      `source revision mismatch: HEAD ${head} does not match requested ${options.sourceRevision}`
    );
  }
  const dirty = runner('git', ['status', '--porcelain=v1', '--untracked-files=all'], cwd)
    .stdout.split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => {
      if (!line.trim()) return false;
      const path = line.slice(3).trim();
      // Worktree-local installs are not part of the release candidate.
      if (path === 'node_modules' || path.startsWith('node_modules/')) return false;
      return true;
    })
    .join('\n')
    .trim();
  if (dirty) fail('source tree is dirty; commit the candidate before packaging');
  return head;
}

export type StageExactReleaseOptions = {
  cwd?: string;
  sourceRevision: string;
  outDir: string;
  registry?: string;
  previousImage?: string;
  runner?: ProcessRunner;
  now?: () => Date;
  /**
   * When true, skip the git dirty/HEAD gate. Only for a remote build host after
   * the operator shell already proved a clean exact SHA and shipped `git archive`
   * bytes for that revision.
   */
  assumeCleanArchive?: boolean;
};

function refuseMutableTag(image: string): void {
  const repository = imageRepository(image);
  const tagPortion = repository.includes(':')
    ? repository.slice(repository.lastIndexOf(':') + 1)
    : '';
  if (tagPortion === 'latest' || /(^|\/)latest@/.test(image) || image.endsWith(':latest')) {
    fail(`mutable image tag is forbidden: ${image}`);
  }
}

function digestOfPinnedImage(image: string): string {
  refuseMutableTag(image);
  return assertDeployableImage(image);
}

/**
 * Build/push an immutable platform image for an exact clean SHA and write the
 * content-addressed release manifest + deployable image-lock consumed by deploy.
 */
export function stageExactRelease(options: StageExactReleaseOptions): ExactReleaseManifest {
  const cwd = options.cwd ?? process.cwd();
  const runner = options.runner ?? defaultRunner;
  assertSourceRevision(options.sourceRevision);
  const sourceRevision = options.assumeCleanArchive
    ? options.sourceRevision
    : assertCleanExactSha({
        cwd,
        sourceRevision: options.sourceRevision,
        runner,
      });
  const registry = (options.registry ?? process.env.HOLO_OCI_REGISTRY ?? 'localhost:5000').replace(
    /\/$/,
    ''
  );
  if (!registry) fail('OCI registry is required');
  const previousImage = options.previousImage ?? process.env.HOLO_PREVIOUS_PLATFORM_IMAGE ?? '';
  if (!previousImage) fail('previousImage is required for deterministic staging');
  refuseMutableTag(previousImage);
  const previousDigest = assertDeployableImage(previousImage);

  const composePath = defaultComposePath(cwd);
  const pgbackrestConfPath = resolve(cwd, PGBACKREST_CONF_RELATIVE);
  if (!existsSync(pgbackrestConfPath)) fail(`pgBackRest config is missing: ${pgbackrestConfPath}`);
  const compose = readCompose(composePath);
  assertComposeContract(compose);
  const composeDigest = composeSha256(composePath);
  const pgbackrestConfSha256 = createHash('sha256')
    .update(readFileSync(pgbackrestConfPath))
    .digest('hex');

  const registryRepo = `${registry}/holocron-platform`;
  const revisionTag = `${registryRepo}:${sourceRevision}`;
  const localTag = `holocron-platform:${sourceRevision}`;
  const dockerfile = resolve(cwd, 'packages/platform/Dockerfile');

  // Reuse an already-pushed exact-SHA image when present so a second clean stage
  // of the same revision is byte-identical (content-addressed, not rebuild-noisy).
  let pushedDigest = '';
  const existingInspect = runner('docker', ['buildx', 'imagetools', 'inspect', revisionTag], cwd);
  if (existingInspect.status === 0) {
    const output = existingInspect.stdout.trim();
    pushedDigest = DIGEST_PATTERN.test(output)
      ? output
      : (/^Digest:\s+(sha256:[a-f0-9]{64})$/m.exec(output)?.[1] ?? '');
  }

  if (!DIGEST_PATTERN.test(pushedDigest)) {
    runOrFail(runner, cwd, 'docker', [
      'build',
      '--file',
      dockerfile,
      '--build-arg',
      `SOURCE_REVISION=${sourceRevision}`,
      '--platform',
      REQUIRED_PLATFORM,
      '--tag',
      localTag,
      cwd,
    ]);

    // Prove packaged backup binaries before push.
    runOrFail(runner, cwd, 'docker', [
      'run',
      '--rm',
      '--entrypoint',
      PLATFORM_PGBACKREST_BIN,
      localTag,
      'version',
    ]);
    runOrFail(runner, cwd, 'docker', [
      'run',
      '--rm',
      '--entrypoint',
      PLATFORM_RESTIC_BIN,
      localTag,
      'version',
    ]);

    runOrFail(runner, cwd, 'docker', ['tag', localTag, revisionTag]);
    runOrFail(runner, cwd, 'docker', ['push', revisionTag]);
    pushedDigest = inspectRemoteDigest(runner, cwd, revisionTag);
  }

  const platformImage = `${registryRepo}@${pushedDigest}`;
  refuseMutableTag(platformImage);
  if (pushedDigest === previousDigest) {
    fail('candidate image digest must differ from previousImage');
  }

  // Always prove backup binaries in the immutable platform image (fresh or reused).
  runOrFail(runner, cwd, 'docker', [
    'run',
    '--rm',
    '--entrypoint',
    PLATFORM_PGBACKREST_BIN,
    platformImage,
    'version',
  ]);
  runOrFail(runner, cwd, 'docker', [
    'run',
    '--rm',
    '--entrypoint',
    PLATFORM_RESTIC_BIN,
    platformImage,
    'version',
  ]);

  const candidate = verifyImageIdentity(runner, cwd, platformImage, sourceRevision);
  const previous = verifyImageIdentity(runner, cwd, previousImage);
  renderCompose(runner, cwd, composePath, platformImage);

  // Deterministic timestamp: manifests for one SHA must be byte-identical across stages.
  const generatedAt = (options.now ?? (() => new Date(0)))().toISOString();

  const outDir = resolve(options.outDir);
  mkdirSync(outDir, { recursive: true });
  const lockPath = resolve(outDir, 'image-lock.json');
  const manifestPath = resolve(outDir, 'release-manifest.json');

  const lock: ReleaseLock = {
    schemaVersion: 2,
    deployable: true,
    image: platformImage,
    digest: pushedDigest,
    repoDigest: candidate.repoDigest,
    sourceRevision,
    composeSha256: composeDigest,
    previousImage,
    previousDigest,
    previousRepoDigest: previous.repoDigest,
    platform: REQUIRED_PLATFORM,
    services: buildReleaseLockServiceRecords(platformImage),
    volumes: buildReleaseLockVolumeRecords(),
    generatedAt,
  };
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, { mode: 0o644 });

  const postgresDigest = digestOfPinnedImage(PGVECTOR_PG18_IMAGE);
  const zeroDigest = digestOfPinnedImage(ZERO_CACHE_IMAGE);
  const pgbackrestDigest = digestOfPinnedImage(PGBACKREST_IMAGE);
  const resticDigest = digestOfPinnedImage(RESTIC_IMAGE);

  const manifest: ExactReleaseManifest = {
    schemaVersion: 1,
    sourceRevision,
    composeSha256: composeDigest,
    imageDigests: {
      platform: pushedDigest,
      postgres: postgresDigest,
      zeroCache: zeroDigest,
      pgbackrest: pgbackrestDigest,
      restic: resticDigest,
    },
    images: {
      platform: platformImage,
      previousPlatform: previousImage,
      postgres: PGVECTOR_PG18_IMAGE,
      zeroCache: ZERO_CACHE_IMAGE,
      pgbackrest: PGBACKREST_IMAGE,
      restic: RESTIC_IMAGE,
    },
    backupRunner: {
      pgbackrestConfPath: PGBACKREST_CONF_RELATIVE,
      pgbackrestConfSha256,
      pgbackrestImage: PGBACKREST_IMAGE,
      resticImage: RESTIC_IMAGE,
      platformBinaryPaths: {
        pgbackrest: PLATFORM_PGBACKREST_BIN,
        restic: PLATFORM_RESTIC_BIN,
      },
    },
    artifactPaths: {
      releaseManifest: 'release-manifest.json',
      imageLock: 'image-lock.json',
      compose: 'packages/platform/deploy/compose/compose.yaml',
      pgbackrestConf: PGBACKREST_CONF_RELATIVE,
      dockerfile: 'packages/platform/Dockerfile',
    },
    generatedAt,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });

  // Keep a content-addressed copy of compose + pgbackrest conf beside the lock.
  writeFileSync(resolve(outDir, 'compose.yaml'), readFileSync(composePath));
  writeFileSync(resolve(outDir, 'pgbackrest.conf'), readFileSync(pgbackrestConfPath));
  return manifest;
}

export function defaultImageLockPath(cwd = process.cwd()): string {
  return resolve(cwd, 'packages/platform/deploy/compose/image-lock.json');
}
