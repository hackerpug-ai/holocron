/**
 * D06-06 immutable OCI release contract.
 *
 * This module deliberately prepares a release but never starts Compose, touches
 * volumes, or changes cutover state. D06-07 is the only deployment consumer.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

export const REQUIRED_SERVICES = ['postgres', 'mastra', 'scheduler', 'zero-cache'] as const;
export const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
export const REVISION_PATTERN = /^[a-f0-9]{40}$/;
export const PGVECTOR_PG18_IMAGE =
  'pgvector/pgvector@sha256:691673308c99d2161ba298736f3147f1f22d79de2fb7ec93ae9b4afcab870b62';

export type ReleaseLock = {
  schemaVersion: 1;
  deployable: true;
  image: string;
  digest: string;
  repoDigest: string;
  sourceRevision: string;
  composeSha256: string;
  previousImage: string;
  previousDigest: string;
  previousRepoDigest: string;
  generatedAt: string;
};

export type ProcessResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

export type ProcessRunner = (command: string, args: string[], cwd: string) => ProcessResult;

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

const defaultRunner: ProcessRunner = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
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
    volumes.some((entry) => typeof entry === 'string' && entry.startsWith(`${name}:`))
  );
}

function hasNamedVolumeMount(service: ComposeService, name: string, target: string): boolean {
  const volumes = service.volumes;
  return Array.isArray(volumes) && volumes.some((entry) => entry === `${name}:${target}`);
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
  if (!command.includes('--enable-crud-mutations')) return false;
  return !/--(?:mutate|push)-url|ZERO_(?:MUTATE|PUSH)_URL/.test(command);
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

  for (const name of REQUIRED_SERVICES) {
    const service = asObject(services[name], `${name} service`) as ComposeService;
    if (service.restart !== 'unless-stopped') fail(`${name} must use restart: unless-stopped`);
    if (!hasHealthcheck(service)) fail(`${name} requires a real healthcheck`);
  }
  if (!hasSemanticSchedulerHealthcheck(services.scheduler)) {
    fail(
      'scheduler healthcheck must read /run/secrets/database_url and probe queue_backend_meta through queue/probe-cli.ts'
    );
  }
  if (!hasDatabaseUrlSecretMount(services.scheduler)) {
    fail('scheduler must mount database-url at /run/secrets/database_url');
  }
  if (exposesDatabaseUrlEnvironment(services.scheduler)) {
    fail('scheduler DATABASE_URL must remain runtime-only and absent from Compose environment');
  }
  if (!hasZeroReadOnlyMutationFence(services['zero-cache'])) {
    fail(
      'zero-cache must disable legacy CRUD mutations and omit every custom mutate/push URL during read-only soak'
    );
  }

  if (!hasMastraMigrationBootstrap(services.mastra)) {
    fail('mastra must run bun src/cli/holo.ts db:migrate before exec bun src/index.ts');
  }

  for (const name of ['mastra', 'scheduler', 'zero-cache'] as const) {
    if (!hasHealthyPostgresDependency(services[name])) {
      fail(`${name} must depend on postgres with condition: service_healthy`);
    }
  }
  for (const name of ['scheduler', 'zero-cache'] as const) {
    if (!hasHealthyDependency(services[name], 'mastra')) {
      fail(`${name} must depend on mastra with condition: service_healthy after migration`);
    }
  }

  const volumes = asObject(compose.volumes, 'Compose volumes');
  for (const name of ['postgres-data', 'blob-data']) {
    if (!volumes[name]) fail(`durable ${name} volume is required`);
  }
  if (services.postgres.image !== PGVECTOR_PG18_IMAGE) {
    fail(`postgres must use the verified PG18 pgvector image ${PGVECTOR_PG18_IMAGE}`);
  }
  if (!hasNamedVolumeMount(services.postgres, 'postgres-data', '/var/lib/postgresql')) {
    fail('postgres must mount postgres-data at /var/lib/postgresql for PG18');
  }
  if (!hasNamedVolume(services.mastra, 'blob-data')) fail('mastra must mount blob-data');
  if (!hasNamedVolume(services.scheduler, 'blob-data')) fail('scheduler must mount blob-data');

  for (const name of ['mastra', 'scheduler'] as const) {
    const serviceImage = services[name].image;
    if (typeof serviceImage !== 'string') fail(`${name} requires an application image`);
    if (serviceImage.includes('${') && !serviceImage.includes('HOLO_PLATFORM_IMAGE')) {
      fail(`${name} must reference HOLO_PLATFORM_IMAGE when interpolated`);
    }
    if (!serviceImage.includes('${')) digestFromImage(serviceImage);
  }

  for (const name of ['postgres', 'zero-cache'] as const) {
    const serviceImage = services[name].image;
    if (typeof serviceImage !== 'string') fail(`${name} requires an immutable image`);
    digestFromImage(serviceImage);
  }

  if (image) {
    const expectedImage = image;
    for (const name of ['mastra', 'scheduler'] as const) {
      if (services[name].image !== expectedImage)
        fail(`${name} image does not match release image`);
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
  args: string[]
): ProcessResult {
  const result = runner(command, args, cwd);
  if (result.status !== 0) {
    fail(
      `${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim() || 'no output'}`
    );
  }
  return result;
}

function inspectRemoteDigest(runner: ProcessRunner, cwd: string, image: string): string {
  const inspected = runOrFail(runner, cwd, 'docker', [
    'buildx',
    'imagetools',
    'inspect',
    '--format',
    '{{.Digest}}',
    image,
  ]);
  const digest = inspected.stdout.trim();
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
  if (lock.schemaVersion !== 1 || lock.deployable !== true) {
    fail('release lock is not a deployable schema v1 lock');
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

function renderCompose(
  runner: ProcessRunner,
  cwd: string,
  composePath: string,
  image: string
): void {
  const before = process.env.HOLO_PLATFORM_IMAGE;
  try {
    process.env.HOLO_PLATFORM_IMAGE = image;
    const rendered = runOrFail(runner, cwd, 'docker', [
      'compose',
      '-f',
      composePath,
      'config',
      '--format',
      'json',
    ]);
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
    schemaVersion: 1,
    deployable: true,
    image: options.image,
    digest: imageDigest,
    repoDigest: candidate.repoDigest,
    sourceRevision: revision,
    composeSha256: composeSha256(options.composePath),
    previousImage: options.previousImage,
    previousDigest,
    previousRepoDigest: previous.repoDigest,
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
  return resolve(cwd, 'services/platform/deploy/compose/compose.yaml');
}

export function defaultImageLockPath(cwd = process.cwd()): string {
  return resolve(cwd, 'services/platform/deploy/compose/image-lock.json');
}
