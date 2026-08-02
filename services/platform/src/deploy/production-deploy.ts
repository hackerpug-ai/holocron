/** Operator-authorized deployment of the immutable D06-06 Compose release. */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadConsolidatedSecrets } from '../config/secrets.ts';
import { assertExternalBaseUrl } from '../http/deployment-identity.ts';
import {
  assertDeployableImage,
  assertSourceRevision,
  composeSha256,
  defaultComposePath,
  REQUIRED_SERVICES,
  type ReleaseLock,
} from './production-release.ts';

export const DEPLOY_PROJECT = 'holocron-production';
export const DEPLOY_EVIDENCE_DIR = '.tmp/REDHAT-FIX-S29-DEPLOY';
export const DEPLOYMENT_RECORD_NAME = 'deployment-record.json';

export type DeploymentProcessResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

export type DeploymentRunner = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv }
) => DeploymentProcessResult;

export type DeploymentRecord = {
  schemaVersion: 1;
  authorized: true;
  authorizationScope: string;
  host: 'inference1';
  runtime: 'container';
  baseUrl: string;
  project: string;
  image: string;
  imageDigest: string;
  sourceRevision: string;
  composeSha256: string;
  composeGeneration: string;
  deployedAt: string;
  services: readonly ['postgres', 'mastra', 'scheduler', 'zero-cache'];
  containers: Record<string, string>;
  previousImage: string;
  previousDigest: string;
  durableVolumes: readonly ['holocron-postgres', 'holocron-blobs'];
  coldRecreate: true;
  cutoverActions: 0;
  volumeDeletions: 0;
  releasePath: string;
  composePath: string;
  overridePath: string;
  runtimeSecretsPath: string;
};

export type ApplyProductionOptions = {
  authorized: boolean;
  releasePath: string;
  baseUrl: string;
  secretsPath: string;
  cwd?: string;
  composePath?: string;
  evidenceDir?: string;
  project?: string;
  target?: string;
  dryRun?: boolean;
  now?: () => Date;
  runner?: DeploymentRunner;
  /** Tests can skip remote image inspection while retaining lock validation. */
  skipImagePreflight?: boolean;
};

const defaultRunner: DeploymentRunner = (command, args, options) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
};

function deployFail(message: string): never {
  throw new Error(`deploy:apply refused: ${message}`);
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    deployFail(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

/** Strict reader for the D06-06 deployable release lock. */
export function readDeployableRelease(path: string, composePath: string): ReleaseLock {
  if (!existsSync(path)) deployFail(`release lock is missing: ${path}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    deployFail(`release lock is not valid JSON: ${path}`);
  }
  const value = asObject(parsed, 'release lock') as Partial<ReleaseLock>;
  if (value.schemaVersion !== 1 || value.deployable !== true) {
    deployFail('release lock must be deployable schema v1');
  }
  const fields = [
    'image',
    'digest',
    'repoDigest',
    'sourceRevision',
    'composeSha256',
    'previousImage',
    'previousDigest',
    'previousRepoDigest',
    'generatedAt',
  ] as const;
  for (const field of fields) {
    const fieldValue = value[field];
    if (typeof fieldValue !== 'string' || fieldValue.length === 0) {
      deployFail(`release lock ${field} is missing`);
    }
  }
  const lock = value as ReleaseLock;
  assertSourceRevision(lock.sourceRevision);
  if (assertDeployableImage(lock.image) !== lock.digest) {
    deployFail('release image and digest disagree');
  }
  if (assertDeployableImage(lock.previousImage) !== lock.previousDigest) {
    deployFail('previous release image and digest disagree');
  }
  if (lock.image === lock.previousImage) deployFail('candidate and previous images must differ');
  if (!/^[a-f0-9]{64}$/.test(lock.composeSha256)) {
    deployFail('release Compose checksum is invalid');
  }
  if (composeSha256(composePath) !== lock.composeSha256) {
    deployFail('Compose manifest checksum differs from the release lock');
  }
  return lock;
}

function atomicJson(path: string, value: unknown, mode = 0o644): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode });
  chmodSync(temp, mode);
  renameSync(temp, path);
}

function readPrivateJson(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const parsed = asObject(JSON.parse(readFileSync(path, 'utf8')), 'runtime secrets');
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string' && value.length > 0) out[key] = value;
  }
  return out;
}

function randomSecret(): string {
  return randomBytes(32).toString('base64url');
}

function fleetUrlForContainer(value: string | undefined): string {
  const raw = value?.trim() || 'http://host.docker.internal:4545/v1';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    deployFail('FLEET_URL is not a valid URL');
  }
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1') {
    url.hostname = 'host.docker.internal';
  }
  return url.toString().replace(/\/$/, '');
}

function runtimeSecrets(options: {
  secretsPath: string;
  runtimeSecretsPath: string;
}): Record<string, string> {
  if (!existsSync(options.secretsPath))
    deployFail(`secrets file is missing: ${options.secretsPath}`);
  const consolidated = loadConsolidatedSecrets({ secretsPath: options.secretsPath });
  const retained = readPrivateJson(options.runtimeSecretsPath);
  const postgresPassword = retained.POSTGRES_PASSWORD ?? randomSecret();
  const zeroAdminPassword = retained.ZERO_ADMIN_PASSWORD ?? randomSecret();
  const mastraApiKey = consolidated.MASTRA_API_KEY;
  const fleetKey = consolidated.FLEET_KEY;
  const mcpKey = consolidated.HOLO_KEY_MCP;
  if (!mastraApiKey) deployFail('MASTRA_API_KEY is missing from consolidated secrets');
  if (!fleetKey) deployFail('FLEET_KEY is missing from consolidated secrets');
  if (!mcpKey) deployFail('HOLO_KEY_MCP is missing from consolidated secrets');
  const databaseUrl = `postgresql://holocron:${encodeURIComponent(postgresPassword)}@postgres:5432/holocron`;
  const values = {
    POSTGRES_PASSWORD: postgresPassword,
    DATABASE_URL: databaseUrl,
    MASTRA_API_KEY: mastraApiKey,
    FLEET_KEY: fleetKey,
    ZERO_ADMIN_PASSWORD: zeroAdminPassword,
    FLEET_URL: fleetUrlForContainer(consolidated.FLEET_URL),
  };
  atomicJson(options.runtimeSecretsPath, values, 0o600);
  return values;
}

function deploymentGeneration(now: Date, digest: string): string {
  const entropy = randomBytes(8).toString('hex');
  const hash = createHash('sha256')
    .update(`${now.toISOString()}\0${digest}\0${entropy}`)
    .digest('hex')
    .slice(0, 24);
  return `inference1-${hash}`;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

/** Generated-only override: publication, strict identity, secret bind, and boot-cycle break. */
export function renderDeploymentOverride(options: {
  lock: ReleaseLock;
  generation: string;
  deployedAt: string;
  port: number;
  secretsPath: string;
}): string {
  const identityEnvironment = [
    '      HOLO_PRODUCTION_READINESS: "1"',
    '      HOLO_DEPLOYMENT_REQUIRED: "1"',
    '      HOLO_DEPLOY_HOST: inference1',
    '      HOLO_DEPLOY_RUNTIME: container',
    `      HOLO_IMAGE_DIGEST: ${options.lock.digest}`,
    `      HOLO_SOURCE_REVISION: ${options.lock.sourceRevision}`,
    `      HOLO_COMPOSE_GENERATION: ${options.generation}`,
    `      HOLO_COMPOSE_SHA256: ${options.lock.composeSha256}`,
    `      HOLO_DEPLOYED_AT: ${yamlString(options.deployedAt)}`,
    '      ZERO_CACHE_URL: http://zero-cache:4848',
  ].join('\n');
  return `# Generated by deploy:apply. Contains no secret values.\nservices:\n  mastra:\n    restart: always\n    ports: !override\n      - ${yamlString(`0.0.0.0:${options.port}:4111`)}\n    environment:\n${identityEnvironment}\n    labels:\n      io.holocron.deploy-host: inference1\n      io.holocron.deploy-runtime: container\n      io.holocron.image-digest: ${options.lock.digest}\n      io.holocron.source-revision: ${options.lock.sourceRevision}\n      io.holocron.compose-generation: ${options.generation}\n    volumes:\n      - ${yamlString(`${options.secretsPath}:/app/services/platform/config/secrets.yaml:ro`)}\n    extra_hosts:\n      - "host.docker.internal:host-gateway"\n  scheduler:\n    labels:\n      io.holocron.image-digest: ${options.lock.digest}\n      io.holocron.source-revision: ${options.lock.sourceRevision}\n      io.holocron.compose-generation: ${options.generation}\n  zero-cache:\n    depends_on: !override\n      postgres:\n        condition: service_healthy\n        restart: true\n`;
}

function runOrFail(
  runner: DeploymentRunner,
  cwd: string,
  env: NodeJS.ProcessEnv,
  command: string,
  args: string[]
): string {
  const result = runner(command, args, { cwd, env });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    deployFail(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout.trim();
}

function composeArgs(project: string, composePath: string, overridePath: string): string[] {
  return ['compose', '-p', project, '-f', composePath, '-f', overridePath];
}

function verifyLockedImage(options: {
  runner: DeploymentRunner;
  cwd: string;
  env: NodeJS.ProcessEnv;
  image: string;
  digest: string;
  sourceRevision?: string;
}): void {
  // Docker 29 / buildx 0.30 exposes the index digest under Manifest.Digest.
  const remoteDigest = runOrFail(options.runner, options.cwd, options.env, 'docker', [
    'buildx',
    'imagetools',
    'inspect',
    '--format',
    '{{.Manifest.Digest}}',
    options.image,
  ]);
  if (remoteDigest !== options.digest) {
    deployFail(`remote manifest digest differs from lock for ${options.image}`);
  }
  runOrFail(options.runner, options.cwd, options.env, 'docker', ['pull', options.image]);
  const repoDigestsRaw = runOrFail(options.runner, options.cwd, options.env, 'docker', [
    'image',
    'inspect',
    '--format',
    '{{json .RepoDigests}}',
    options.image,
  ]);
  let repoDigests: unknown;
  try {
    repoDigests = JSON.parse(repoDigestsRaw);
  } catch {
    deployFail(`Docker returned invalid RepoDigests for ${options.image}`);
  }
  if (!Array.isArray(repoDigests) || !repoDigests.includes(options.image)) {
    deployFail(`local image does not retain exact RepoDigest ${options.image}`);
  }
  if (options.sourceRevision) {
    const revision = runOrFail(options.runner, options.cwd, options.env, 'docker', [
      'image',
      'inspect',
      '--format',
      '{{index .Config.Labels "org.opencontainers.image.revision"}}',
      options.image,
    ]);
    if (revision !== options.sourceRevision) {
      deployFail('candidate OCI source revision differs from the release lock');
    }
  }
}

function portFromBaseUrl(baseUrl: string): number {
  const url = new URL(baseUrl);
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) deployFail('base URL port is invalid');
  return port;
}

export function defaultDeploymentRecordPath(cwd = process.cwd()): string {
  return resolve(cwd, DEPLOY_EVIDENCE_DIR, DEPLOYMENT_RECORD_NAME);
}

/** Cold-recreate the exact four-service generation without deleting volumes. */
export function applyProductionDeployment(options: ApplyProductionOptions): DeploymentRecord {
  if (!options.authorized) {
    deployFail('operator authorization is required (--authorize)');
  }
  const cwd = options.cwd ?? process.cwd();
  const target = options.target ?? process.env.HOLO_DEPLOY_TARGET ?? '';
  if (target !== 'inference1') deployFail('HOLO_DEPLOY_TARGET must be exactly inference1');
  const composePath = resolve(options.composePath ?? defaultComposePath(cwd));
  const releasePath = resolve(options.releasePath);
  const secretsPath = resolve(options.secretsPath);
  const evidenceDir = resolve(cwd, options.evidenceDir ?? DEPLOY_EVIDENCE_DIR);
  const project = options.project ?? DEPLOY_PROJECT;
  const baseUrl = assertExternalBaseUrl(options.baseUrl);
  const port = portFromBaseUrl(baseUrl);
  const lock = readDeployableRelease(releasePath, composePath);
  const now = (options.now ?? (() => new Date()))();
  const deployedAt = now.toISOString();
  const generation = deploymentGeneration(now, lock.digest);
  const runtimeSecretsPath = resolve(evidenceDir, '.runtime-secrets.json');
  const overridePath = resolve(evidenceDir, 'compose.inference1.generated.yaml');
  const runtime = runtimeSecrets({ secretsPath, runtimeSecretsPath });
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(
    overridePath,
    renderDeploymentOverride({ lock, generation, deployedAt, port, secretsPath }),
    { mode: 0o644 }
  );

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...runtime,
    HOLO_PLATFORM_IMAGE: lock.image,
    HOLO_POSTGRES_VOLUME: 'holocron-postgres',
    HOLO_BLOB_VOLUME: 'holocron-blobs',
  };
  const runner = options.runner ?? defaultRunner;
  if (!options.skipImagePreflight) {
    verifyLockedImage({
      runner,
      cwd,
      env,
      image: lock.image,
      digest: lock.digest,
      sourceRevision: lock.sourceRevision,
    });
    verifyLockedImage({
      runner,
      cwd,
      env,
      image: lock.previousImage,
      digest: lock.previousDigest,
    });
  }
  const prefix = composeArgs(project, composePath, overridePath);
  const services = runOrFail(runner, cwd, env, 'docker', [...prefix, 'config', '--services'])
    .split(/\s+/)
    .filter(Boolean)
    .sort();
  if (services.join(',') !== [...REQUIRED_SERVICES].sort().join(',')) {
    deployFail(`rendered services must be exactly ${REQUIRED_SERVICES.join(',')}`);
  }
  if (options.dryRun) deployFail('dry-run cannot produce an authorized deployment receipt');

  // Named volumes are created as root by Docker while the production image
  // deliberately runs as the unprivileged `bun` user. Initialize ownership in
  // a disposable container before starting the four long-lived services. This
  // retains every existing blob and never removes or recreates the volume.
  runOrFail(runner, cwd, env, 'docker', [
    'run',
    '--rm',
    '--user',
    '0:0',
    '--volume',
    'holocron-blobs:/var/lib/holocron/blobs',
    '--entrypoint',
    '/bin/sh',
    lock.image,
    '-ec',
    'chown -R bun:bun /var/lib/holocron/blobs; chmod 0750 /var/lib/holocron/blobs',
  ]);

  runOrFail(runner, cwd, env, 'docker', [
    ...prefix,
    'up',
    '-d',
    '--force-recreate',
    '--wait',
    '--wait-timeout',
    '240',
  ]);
  const running = runOrFail(runner, cwd, env, 'docker', [
    ...prefix,
    'ps',
    '--services',
    '--status',
    'running',
  ])
    .split(/\s+/)
    .filter(Boolean)
    .sort();
  if (running.join(',') !== [...REQUIRED_SERVICES].sort().join(',')) {
    deployFail(`all four services must be running; got ${running.join(',') || '(none)'}`);
  }

  const containers: Record<string, string> = {};
  for (const service of REQUIRED_SERVICES) {
    const id = runOrFail(runner, cwd, env, 'docker', [...prefix, 'ps', '-q', service]);
    if (!/^[a-f0-9]{12,64}$/.test(id)) deployFail(`container id missing for ${service}`);
    containers[service] = id;
  }
  for (const service of ['mastra', 'scheduler'] as const) {
    const actualImage = runOrFail(runner, cwd, env, 'docker', [
      'inspect',
      '--format',
      '{{.Config.Image}}',
      containers[service],
    ]);
    if (actualImage !== lock.image) deployFail(`${service} is not running the locked image`);
  }

  const record: DeploymentRecord = {
    schemaVersion: 1,
    authorized: true,
    authorizationScope: `inference1:${lock.digest}`,
    host: 'inference1',
    runtime: 'container',
    baseUrl,
    project,
    image: lock.image,
    imageDigest: lock.digest,
    sourceRevision: lock.sourceRevision,
    composeSha256: lock.composeSha256,
    composeGeneration: generation,
    deployedAt,
    services: [...REQUIRED_SERVICES],
    containers,
    previousImage: lock.previousImage,
    previousDigest: lock.previousDigest,
    durableVolumes: ['holocron-postgres', 'holocron-blobs'],
    coldRecreate: true,
    cutoverActions: 0,
    volumeDeletions: 0,
    releasePath,
    composePath,
    overridePath,
    runtimeSecretsPath,
  };
  atomicJson(resolve(evidenceDir, DEPLOYMENT_RECORD_NAME), record);
  return record;
}

export function readDeploymentRecord(path: string): DeploymentRecord {
  if (!existsSync(path)) deployFail(`deployment record is missing: ${path}`);
  const value = asObject(JSON.parse(readFileSync(path, 'utf8')), 'deployment record');
  if (
    value.schemaVersion !== 1 ||
    value.authorized !== true ||
    value.host !== 'inference1' ||
    value.runtime !== 'container' ||
    value.cutoverActions !== 0 ||
    value.volumeDeletions !== 0
  ) {
    deployFail('deployment record failed invariant checks');
  }
  assertExternalBaseUrl(String(value.baseUrl ?? ''));
  return value as DeploymentRecord;
}
