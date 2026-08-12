/** Operator-authorized deployment of the immutable D06-06 Compose release. */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, relative, resolve, sep } from 'node:path';
import { loadConsolidatedSecrets } from '../config/secrets.ts';
import { assertExternalBaseUrl } from '../http/deployment-identity.ts';
import {
  assertDeployableImage,
  assertLinuxArm64Platforms,
  assertSourceRevision,
  composeSha256,
  defaultComposePath,
  parseImagePlatforms,
  REQUIRED_SERVICES,
  type ReleaseLock,
} from './production-release.ts';

export const DEPLOY_PROJECT = 'holocron-production';
export const DEPLOY_EVIDENCE_DIR = '.tmp/REDHAT-FIX-S29-DEPLOY';
export const DEPLOYMENT_RECORD_NAME = 'deployment-record.json';
/** Documented default/example host — not the only accepted target. */
export const DEFAULT_DEPLOY_HOST = 'holocron';
export const DEFAULT_LOOPBACK_PORT = 44_111;
export const PRIVATE_SERVE_BACKEND = `http://127.0.0.1:${DEFAULT_LOOPBACK_PORT}`;
/** Minimum Docker Desktop VM overhead above the selected container-limit sum. */
export const MIN_DOCKER_VM_OVERHEAD_GIB = 4;
/** Minimum free physical RAM after the Docker VM allocation. */
export const MIN_HOST_HEADROOM_GIB = 8;
export const MAX_MEMORY_LIMIT_SUM_GIB = 50;
export const DEFAULT_MEMORY_LIMITS_GIB = {
  postgres: 16,
  mastra: 16,
  scheduler: 8,
  'zero-cache': 10,
} as const satisfies ServiceMemoryLimits;

/** Nine named non-mutating preflight dimensions (IMP-AC-12). Absent names cannot pass. */
export const PREFLIGHT_CHECK_NAMES = [
  'docker_compose',
  'linux_arm64',
  'target_host',
  'loopback_port',
  'tailscale_serve',
  'secret_paths',
  'volumes',
  'container_memory_sum',
  'docker_vm_headroom',
] as const;

export type PreflightCheckName = (typeof PREFLIGHT_CHECK_NAMES)[number];

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

export type ServiceMemoryLimits = {
  postgres: number;
  mastra: number;
  scheduler: number;
  'zero-cache': number;
};

export type DeploymentRecord = {
  schemaVersion: 1;
  authorized: true;
  authorizationScope: string;
  /** Validated portable deploy host (default example: holocron). */
  host: string;
  runtime: 'container';
  baseUrl: string;
  /** Host-published Mastra loopback port (backend for private Serve). */
  loopbackPort: number;
  /** Tailscale private Serve HTTPS port (not Funnel). */
  serveHttpsPort: number;
  /** Private Serve URL (https://&lt;magicdns&gt;:44111). */
  serveUrl: string;
  /** Exact private Serve proxy target. */
  privateServeTarget: string;
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
  memoryLimitsGib: ServiceMemoryLimits;
  coldRecreate: true;
  cutoverActions: 0;
  volumeDeletions: 0;
  releasePath: string;
  composePath: string;
  overridePath: string;
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
  memoryLimits?: ServiceMemoryLimits;
  secretStoreRoot?: string;
  dryRun?: boolean;
  /** When false, skip Tailscale Serve mutation (tests / dual-phase ops). Default true. */
  configureServe?: boolean;
  /**
   * When true, run non-mutating host preflight before any Docker mutation.
   * Opt-in so operators can stage apply on hosts that already passed preflight separately.
   */
  preflight?: boolean;
  now?: () => Date;
  runner?: DeploymentRunner;
  /** Tests can skip remote image inspection while retaining lock validation. */
  skipImagePreflight?: boolean;
};

export type CommandLedgerEntry = {
  command: string;
  args: readonly string[];
  mutating: boolean;
};

export type MemoryCapacityReport = {
  container_limit_sum_gib: number;
  docker_vm_memory_gib: number;
  host_physical_memory_gib: number;
  host_headroom_required_gib: number;
  host_headroom_observed_gib: number;
  docker_vm_overhead_required_gib: number;
  docker_vm_overhead_observed_gib: number;
  ok: boolean;
  smaller_host_lower_limits_required: boolean;
  reasons: string[];
};

export type PreflightCheckResult = {
  name: PreflightCheckName;
  ok: boolean;
  summary: string;
};

export type HostPreflightOptions = {
  target?: string;
  port?: number;
  secretsPath?: string;
  secretStoreRoot?: string;
  memoryLimits?: ServiceMemoryLimits;
  cwd?: string;
  runner?: DeploymentRunner;
  env?: NodeJS.ProcessEnv;
};

export type HostPreflightReport = {
  ok: boolean;
  target: string;
  port: number;
  preflight_check_count: number;
  docker_mutation_count: number;
  serve_https_port: number;
  validated_secret_path_count: number;
  container_limit_sum_gib: number;
  docker_vm_memory_gib: number;
  host_physical_memory_gib: number;
  host_headroom_required_gib: number;
  host_headroom_observed_gib: number;
  smaller_host_lower_limits_required: boolean;
  checks: Record<PreflightCheckName, PreflightCheckResult>;
  command_ledger: CommandLedgerEntry[];
  failures: string[];
};

export type PrivateServeStatus = {
  ok: boolean;
  serveHttpsPort: number;
  privateServeTarget: string;
  serveUrl: string;
  funnelEnabled: boolean;
  funnelEndpointCount: number;
  raw: unknown;
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

/**
 * Validate a portable deployment hostname. holocron is the documented default;
 * any RFC-1123-ish label/FQDN is accepted. Rejects empty, underscores, and
 * special characters (e.g. bad_host!).
 */
export function assertDeployHost(host: string): string {
  const normalized = host.trim().toLowerCase();
  if (!normalized) deployFail('deployment host is missing');
  if (normalized.length > 63) deployFail(`deployment host is invalid: ${host}`);
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(normalized)) {
    deployFail(`deployment host is invalid: ${host}`);
  }
  if (normalized.includes('_') || /[^a-z0-9.-]/.test(normalized)) {
    deployFail(`deployment host is invalid: ${host}`);
  }
  return normalized;
}

/** Validate per-service memory limits (GiB); sum must be in (0, 50]. */
export function assertMemoryLimitPlan(
  limits: Partial<ServiceMemoryLimits> | ServiceMemoryLimits | null | undefined
): ServiceMemoryLimits {
  if (!limits || typeof limits !== 'object') {
    deployFail('memory plan is missing');
  }
  const out = {} as ServiceMemoryLimits;
  let sum = 0;
  for (const service of REQUIRED_SERVICES) {
    const raw = (limits as Record<string, unknown>)[service];
    if (raw === undefined || raw === null) {
      deployFail(`memory limit for ${service} is missing`);
    }
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value)) {
      deployFail(`memory limit for ${service} is malformed`);
    }
    if (value <= 0) {
      deployFail(`memory limit for ${service} must be positive (got ${value})`);
    }
    out[service] = value;
    sum += value;
  }
  if (sum > MAX_MEMORY_LIMIT_SUM_GIB) {
    deployFail(
      `memory limit sum ${sum} GiB exceeds the ${MAX_MEMORY_LIMIT_SUM_GIB} GiB container budget`
    );
  }
  if (sum <= 0) deployFail('memory plan is empty');
  return out;
}

/**
 * Canonical realpath validation for operator secret files.
 * Rejects symlinks, non-regular files, paths outside the approved store, and
 * group/world-writable permissions. Never includes secret file contents.
 * `storeRoot` is required — callers must not default it to the secret's parent.
 */
export function assertApprovedSecretFile(
  candidatePath: string,
  options: { storeRoot: string }
): string {
  if (!options.storeRoot || !options.storeRoot.trim()) {
    deployFail('secretStoreRoot is required for operator-approved secret validation');
  }
  const resolvedCandidate = resolve(candidatePath);
  let leafStat: ReturnType<typeof lstatSync>;
  try {
    leafStat = lstatSync(resolvedCandidate);
  } catch {
    deployFail(`secrets file is missing: ${candidatePath}`);
  }
  if (leafStat.isSymbolicLink()) {
    deployFail('secret path must not be a symlink');
  }
  if (!leafStat.isFile()) {
    deployFail('secret path must be a regular file');
  }
  const mode = leafStat.mode & 0o777;
  if ((mode & 0o022) !== 0) {
    deployFail('secret file must not be group/world-writable');
  }
  let realFile: string;
  let realStore: string;
  try {
    realFile = realpathSync(resolvedCandidate);
    const storeRoot = resolve(options.storeRoot.trim());
    realStore = realpathSync(storeRoot);
  } catch {
    deployFail('secret path realpath resolution failed');
  }
  const rel = relative(realStore, realFile);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || rel.startsWith('..')) {
    deployFail('secret path is outside the operator-approved secret store');
  }
  // Walk each path component and reject intermediate symlinks.
  const parts = realFile.split(sep).filter(Boolean);
  let cursor = realFile.startsWith(sep) ? sep : '';
  for (const part of parts) {
    cursor = cursor.endsWith(sep) ? `${cursor}${part}` : `${cursor}${sep}${part}`;
    let st: ReturnType<typeof lstatSync>;
    try {
      st = lstatSync(cursor);
    } catch {
      deployFail('secret path realpath resolution failed');
    }
    if (st.isSymbolicLink()) {
      deployFail('secret path must not traverse a symlink');
    }
  }
  return realFile;
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

/** Move legacy evidence-local credentials into the private operator store before reuse checks. */
export function migrateLegacyRuntimeSecrets(options: {
  runtimeSecretsPath: string;
  legacyEvidenceSecretsPath: string;
}): void {
  if (!existsSync(options.legacyEvidenceSecretsPath)) return;
  if (resolve(options.legacyEvidenceSecretsPath) === resolve(options.runtimeSecretsPath)) {
    deployFail('legacy and private runtime secret paths must differ');
  }
  const retained = readPrivateJson(options.legacyEvidenceSecretsPath);
  if (Object.keys(retained).length === 0) {
    deployFail('legacy runtime secrets are empty');
  }
  if (existsSync(options.runtimeSecretsPath)) {
    const current = readPrivateJson(options.runtimeSecretsPath);
    if (Object.keys(current).length === 0) {
      deployFail('private runtime secrets are empty');
    }
    const keys = [...new Set([...Object.keys(retained), ...Object.keys(current)])].sort();
    if (keys.some((key) => retained[key] !== current[key])) {
      deployFail('legacy runtime secrets differ from the private operator store');
    }
    chmodSync(options.runtimeSecretsPath, 0o600);
    unlinkSync(options.legacyEvidenceSecretsPath);
    return;
  }
  atomicJson(options.runtimeSecretsPath, retained, 0o600);
  unlinkSync(options.legacyEvidenceSecretsPath);
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
  if (url.username || url.password) {
    deployFail('FLEET_URL must not contain URL credentials');
  }
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1') {
    url.hostname = 'host.docker.internal';
  }
  return url.toString().replace(/\/$/, '');
}

function runtimeSecrets(options: {
  secretsPath: string;
  runtimeSecretsPath: string;
  legacyEvidenceSecretsPath?: string;
}): Record<string, string> {
  if (!existsSync(options.secretsPath))
    deployFail(`secrets file is missing: ${options.secretsPath}`);
  const consolidated = loadConsolidatedSecrets({ secretsPath: options.secretsPath });
  const retained = existsSync(options.runtimeSecretsPath)
    ? readPrivateJson(options.runtimeSecretsPath)
    : readPrivateJson(options.legacyEvidenceSecretsPath ?? '');
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
  if (
    options.legacyEvidenceSecretsPath &&
    resolve(options.legacyEvidenceSecretsPath) !== resolve(options.runtimeSecretsPath) &&
    existsSync(options.legacyEvidenceSecretsPath)
  ) {
    unlinkSync(options.legacyEvidenceSecretsPath);
  }
  return values;
}

function deploymentGeneration(now: Date, digest: string, host: string): string {
  const entropy = randomBytes(8).toString('hex');
  const hash = createHash('sha256')
    .update(`${now.toISOString()}\0${digest}\0${entropy}\0${host}`)
    .digest('hex')
    .slice(0, 24);
  const prefix = host.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'holocron';
  return `${prefix}-${hash}`;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function memLimitYaml(gib: number): string {
  // Compose accepts integer GiB strings like "16g".
  if (!Number.isFinite(gib) || gib <= 0) deployFail('memory limit is invalid');
  const normalized = Number.isInteger(gib) ? String(gib) : String(gib);
  return `${normalized}g`;
}

/** Generated-only override: publication, strict identity, secret bind, and boot-cycle break. */
export function renderDeploymentOverride(options: {
  lock: ReleaseLock;
  generation: string;
  deployedAt: string;
  port: number;
  secretsPath: string;
  host?: string;
  memoryLimits?: ServiceMemoryLimits;
}): string {
  const host = assertDeployHost(options.host ?? DEFAULT_DEPLOY_HOST);
  const memoryLimits = assertMemoryLimitPlan(options.memoryLimits ?? DEFAULT_MEMORY_LIMITS_GIB);
  const postgresPort = options.port + 1;
  const zeroPort = options.port + 2;
  if (zeroPort > 65_535) {
    deployFail('base URL port leaves no adjacent loopback ports for cutover Postgres and Zero');
  }
  const identityEnvironment = [
    '      HOLO_PRODUCTION_READINESS: "1"',
    '      HOLO_DEPLOYMENT_REQUIRED: "1"',
    // The production Compose database is intentionally named `holocron`.
    // Runtime routes otherwise refuse it as an accidental production target.
    '      HOLO_DANGEROUS_ALLOW_PROD_DB: "1"',
    `      HOLO_DEPLOY_HOST: ${host}`,
    '      HOLO_DEPLOY_RUNTIME: container',
    `      HOLO_IMAGE_DIGEST: ${options.lock.digest}`,
    `      HOLO_SOURCE_REVISION: ${options.lock.sourceRevision}`,
    `      HOLO_COMPOSE_GENERATION: ${options.generation}`,
    `      HOLO_COMPOSE_SHA256: ${options.lock.composeSha256}`,
    `      HOLO_DEPLOYED_AT: ${yamlString(options.deployedAt)}`,
    '      ZERO_CACHE_URL: http://zero-cache:4848',
  ].join('\n');
  // Mastra is loopback-only on the serving host; Tailscale Serve (D08-07) fronts it.
  return `# Generated by deploy:apply. Contains no secret values.
services:
  postgres:
    ports: !override
      - ${yamlString(`127.0.0.1:${postgresPort}:5432`)}
    mem_limit: ${yamlString(memLimitYaml(memoryLimits.postgres))}
  mastra:
    restart: always
    ports: !override
      - ${yamlString(`127.0.0.1:${options.port}:4111`)}
    mem_limit: ${yamlString(memLimitYaml(memoryLimits.mastra))}
    environment:
${identityEnvironment}
    labels:
      io.holocron.deploy-host: ${host}
      io.holocron.deploy-runtime: container
      io.holocron.image-digest: ${options.lock.digest}
      io.holocron.source-revision: ${options.lock.sourceRevision}
      io.holocron.compose-generation: ${options.generation}
    volumes:
      - ${yamlString(`${options.secretsPath}:/app/services/platform/config/secrets.yaml:ro`)}
    extra_hosts:
      - "host.docker.internal:host-gateway"
  scheduler:
    mem_limit: ${yamlString(memLimitYaml(memoryLimits.scheduler))}
    labels:
      io.holocron.image-digest: ${options.lock.digest}
      io.holocron.source-revision: ${options.lock.sourceRevision}
      io.holocron.compose-generation: ${options.generation}
  zero-cache:
    ports: !override
      - ${yamlString(`127.0.0.1:${zeroPort}:4848`)}
    mem_limit: ${yamlString(memLimitYaml(memoryLimits['zero-cache']))}
    depends_on: !override
      postgres:
        condition: service_healthy
        restart: true
`;
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
    // Never embed child stdout/stderr — they may include env-expanded secrets.
    deployFail(`${command} ${args.join(' ')} failed (exit ${result.status ?? 'null'})`);
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
  requireArm64?: boolean;
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
  if (options.requireArm64 !== false) {
    const platformJson = runOrFail(options.runner, options.cwd, options.env, 'docker', [
      'buildx',
      'imagetools',
      'inspect',
      '--format',
      '{{json .}}',
      options.image,
    ]);
    try {
      assertLinuxArm64Platforms(parseImagePlatforms(platformJson));
    } catch (error) {
      deployFail(error instanceof Error ? error.message : String(error));
    }
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

/** Convert byte counts from Docker/macOS into whole GiB (floor). */
export function bytesToGib(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    deployFail('memory observation is empty or zero');
  }
  return Math.floor(bytes / 1024 ** 3);
}

/** Classify Docker/Tailscale invocations that mutate runtime state. */
export function isMutatingDeployCommand(command: string, args: readonly string[]): boolean {
  const c = command.toLowerCase();
  const a = args.map((part) => part.toLowerCase());
  if (c === 'tailscale') {
    if (a[0] === 'funnel') return true;
    if (a[0] === 'serve') {
      // status / get-config are read-only; everything else mutates Serve.
      return a[1] !== 'status' && a[1] !== 'get-config';
    }
    return false;
  }
  if (c !== 'docker') return false;
  if (a[0] === 'compose') {
    const sub = a[1] ?? '';
    if (['up', 'down', 'rm', 'kill', 'start', 'stop', 'restart', 'create', 'run'].includes(sub)) {
      return true;
    }
    return false;
  }
  if (
    ['run', 'rm', 'kill', 'start', 'stop', 'restart', 'create', 'pull', 'tag'].includes(a[0] ?? '')
  ) {
    return true;
  }
  if (a[0] === 'volume' && ['create', 'rm', 'prune'].includes(a[1] ?? '')) return true;
  if (
    a[0] === 'network' &&
    ['create', 'rm', 'prune', 'connect', 'disconnect'].includes(a[1] ?? '')
  ) {
    return true;
  }
  return false;
}

/**
 * Evaluate selected container limits against Docker VM allocation and physical host RAM.
 * 50 GiB is the aggregate container ceiling, not a default/minimum.
 */
export function evaluateMemoryCapacity(options: {
  containerLimitSumGib: number;
  dockerVmMemoryGib: number;
  hostPhysicalMemoryGib: number;
  hostHeadroomRequiredGib?: number;
  dockerVmOverheadRequiredGib?: number;
}): MemoryCapacityReport {
  const container = options.containerLimitSumGib;
  const dockerVm = options.dockerVmMemoryGib;
  const host = options.hostPhysicalMemoryGib;
  const headroomRequired = options.hostHeadroomRequiredGib ?? MIN_HOST_HEADROOM_GIB;
  const overheadRequired = options.dockerVmOverheadRequiredGib ?? MIN_DOCKER_VM_OVERHEAD_GIB;
  if (!Number.isFinite(container) || container <= 0)
    deployFail('container limit sum is empty or zero');
  if (!Number.isFinite(dockerVm) || dockerVm <= 0)
    deployFail('Docker VM memory observation is empty or zero');
  if (!Number.isFinite(host) || host <= 0)
    deployFail('host physical memory observation is empty or zero');
  if (container > MAX_MEMORY_LIMIT_SUM_GIB) {
    deployFail(
      `memory limit sum ${container} GiB exceeds the ${MAX_MEMORY_LIMIT_SUM_GIB} GiB container budget`
    );
  }
  const overheadObserved = dockerVm - container;
  const headroomObserved = host - dockerVm;
  const reasons: string[] = [];
  if (overheadObserved < overheadRequired) {
    reasons.push(
      `Docker VM needs ≥${overheadRequired} GiB above container limits (observed overhead ${overheadObserved} GiB)`
    );
  }
  if (headroomObserved < headroomRequired) {
    reasons.push(
      `host needs ≥${headroomRequired} GiB free after Docker VM (observed headroom ${headroomObserved} GiB)`
    );
  }
  const ok = reasons.length === 0;
  return {
    container_limit_sum_gib: container,
    docker_vm_memory_gib: dockerVm,
    host_physical_memory_gib: host,
    host_headroom_required_gib: headroomRequired,
    host_headroom_observed_gib: headroomObserved,
    docker_vm_overhead_required_gib: overheadRequired,
    docker_vm_overhead_observed_gib: overheadObserved,
    ok,
    smaller_host_lower_limits_required: !ok,
    reasons,
  };
}

/** Query real Docker Engine memory (Desktop Linux VM or engine MemTotal). */
export function observeDockerVmMemoryGib(
  runner: DeploymentRunner = defaultRunner,
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = runOrFail(runner, cwd, env, 'docker', ['info', '--format', '{{.MemTotal}}']);
  const bytes = Number(raw.trim());
  if (!Number.isFinite(bytes) || bytes <= 0) deployFail('empty Docker memory observation');
  return bytesToGib(bytes);
}

/** Query physical host RAM (macOS sysctl; Linux /proc/meminfo). */
export function observeHostPhysicalMemoryGib(
  runner: DeploymentRunner = defaultRunner,
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env
): number {
  if (process.platform === 'darwin') {
    const raw = runOrFail(runner, cwd, env, 'sysctl', ['-n', 'hw.memsize']);
    const bytes = Number(raw.trim());
    if (!Number.isFinite(bytes) || bytes <= 0) deployFail('empty host memory observation');
    return bytesToGib(bytes);
  }
  const raw = runOrFail(runner, cwd, env, 'awk', [
    '/MemTotal/ {print $2*1024; exit}',
    '/proc/meminfo',
  ]);
  const bytes = Number(raw.trim());
  if (!Number.isFinite(bytes) || bytes <= 0) deployFail('empty host memory observation');
  return bytesToGib(bytes);
}

function ledgerPush(ledger: CommandLedgerEntry[], command: string, args: readonly string[]): void {
  ledger.push({
    command,
    args: [...args],
    mutating: isMutatingDeployCommand(command, args),
  });
}

function ledgerRun(
  ledger: CommandLedgerEntry[],
  runner: DeploymentRunner,
  cwd: string,
  env: NodeJS.ProcessEnv,
  command: string,
  args: string[]
): DeploymentProcessResult {
  ledgerPush(ledger, command, args);
  return runner(command, args, { cwd, env });
}

/** Resolve this node's MagicDNS name for private Serve URLs. */
export function resolveTailscaleDnsName(
  runner: DeploymentRunner = defaultRunner,
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env
): string {
  const raw = runOrFail(runner, cwd, env, 'tailscale', ['status', '--json']);
  let parsed: unknown;
  try {
    const start = raw.indexOf('{');
    parsed = JSON.parse(start >= 0 ? raw.slice(start) : raw);
  } catch {
    deployFail('tailscale status JSON is invalid');
  }
  const self = asObject(asObject(parsed, 'tailscale status').Self ?? {}, 'tailscale Self');
  const dns =
    typeof self.DNSName === 'string' ? self.DNSName.replace(/\.$/, '').trim().toLowerCase() : '';
  if (!dns) deployFail('tailscale MagicDNS name is missing');
  return dns;
}

export function buildPrivateServeUrl(dnsName: string, httpsPort = DEFAULT_LOOPBACK_PORT): string {
  const host = dnsName.replace(/\.$/, '').toLowerCase();
  if (!host) deployFail('serve DNS name is missing');
  return `https://${host}:${httpsPort}`;
}

/** Read-only Tailscale Serve status; never enables Funnel. */
export function readPrivateServeStatus(options: {
  httpsPort?: number;
  runner?: DeploymentRunner;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  ledger?: CommandLedgerEntry[];
}): PrivateServeStatus {
  const httpsPort = options.httpsPort ?? DEFAULT_LOOPBACK_PORT;
  const runner = options.runner ?? defaultRunner;
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const ledger = options.ledger;
  const args = ['serve', 'status', '--json'];
  if (ledger) ledgerPush(ledger, 'tailscale', args);
  const result = runner('tailscale', args, { cwd, env });
  const text = (result.stdout || result.stderr || '').trim();
  let raw: unknown = {};
  if (text) {
    try {
      const start = text.indexOf('{');
      raw = JSON.parse(start >= 0 ? text.slice(start) : text);
    } catch {
      raw = {};
    }
  }
  const blob = JSON.stringify(raw);
  const funnelEnabled =
    /\bFunnel\b/.test(blob) &&
    !/"Funnel"\s*:\s*(?:null|\[\]|\{\})/.test(blob) &&
    /"Funnel"\s*:\s*\{/.test(blob) &&
    !/"Funnel"\s*:\s*\{\s*\}/.test(blob);
  // Count non-empty funnel endpoint objects if present.
  let funnelEndpointCount = 0;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const funnel = (raw as Record<string, unknown>).Funnel;
    if (funnel && typeof funnel === 'object') {
      funnelEndpointCount = Object.keys(funnel as object).length;
    }
  }
  if (funnelEnabled && funnelEndpointCount === 0) funnelEndpointCount = 1;
  let serveUrl = '';
  try {
    serveUrl = buildPrivateServeUrl(resolveTailscaleDnsName(runner, cwd, env), httpsPort);
  } catch {
    serveUrl = '';
  }
  const backend = `http://127.0.0.1:${httpsPort}`;
  const ok =
    result.status === 0 &&
    !funnelEnabled &&
    funnelEndpointCount === 0 &&
    httpsPort === DEFAULT_LOOPBACK_PORT;
  return {
    ok,
    serveHttpsPort: httpsPort,
    privateServeTarget: backend,
    serveUrl,
    funnelEnabled,
    funnelEndpointCount,
    raw,
  };
}

/**
 * Apply background private Serve HTTPS → loopback only after explicit authorization.
 * NEVER calls `tailscale funnel` or mutates ACLs.
 */
export function applyPrivateTailscaleServe(options: {
  authorized: boolean;
  httpsPort?: number;
  runner?: DeploymentRunner;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): PrivateServeStatus {
  if (!options.authorized) {
    deployFail('operator authorization is required for private Serve (--authorize)');
  }
  const httpsPort = options.httpsPort ?? DEFAULT_LOOPBACK_PORT;
  const backend = `http://127.0.0.1:${httpsPort}`;
  const runner = options.runner ?? defaultRunner;
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  runOrFail(runner, cwd, env, 'tailscale', ['serve', '--bg', `--https=${httpsPort}`, backend]);
  const status = readPrivateServeStatus({ httpsPort, runner, cwd, env });
  if (status.funnelEnabled || status.funnelEndpointCount > 0) {
    deployFail('private Serve status reports Funnel; refusing public ingress');
  }
  if (!status.serveUrl) deployFail('private Serve URL could not be resolved');
  return { ...status, ok: true, privateServeTarget: backend, serveHttpsPort: httpsPort };
}

/**
 * Non-mutating host preflight for portable Holocron (IMP-AC-7/12).
 * Reports all nine named checks together; never mutates Docker/Compose/Serve/volumes.
 */
export function runHostPreflight(options: HostPreflightOptions = {}): HostPreflightReport {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const runner = options.runner ?? defaultRunner;
  const target = assertDeployHost(options.target ?? env.HOLO_DEPLOY_TARGET ?? DEFAULT_DEPLOY_HOST);
  const port = options.port ?? DEFAULT_LOOPBACK_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    deployFail('preflight port is invalid');
  }
  const memoryLimits = assertMemoryLimitPlan(options.memoryLimits ?? DEFAULT_MEMORY_LIMITS_GIB);
  const containerSum = REQUIRED_SERVICES.reduce((sum, name) => sum + memoryLimits[name], 0);
  const ledger: CommandLedgerEntry[] = [];
  const failures: string[] = [];
  const checks = {} as Record<PreflightCheckName, PreflightCheckResult>;
  const setCheck = (name: PreflightCheckName, ok: boolean, summary: string) => {
    checks[name] = { name, ok, summary };
    if (!ok) failures.push(`${name}: ${summary}`);
  };

  // 1. docker_compose — engine + compose plugin (read-only).
  {
    const info = ledgerRun(ledger, runner, cwd, env, 'docker', [
      'info',
      '--format',
      '{{.ServerVersion}}',
    ]);
    const compose = ledgerRun(ledger, runner, cwd, env, 'docker', [
      'compose',
      'version',
      '--short',
    ]);
    const ok = info.status === 0 && compose.status === 0 && Boolean(info.stdout.trim());
    setCheck(
      'docker_compose',
      ok,
      ok
        ? `docker ${info.stdout.trim()} compose ${compose.stdout.trim()}`
        : 'Docker Engine or Compose plugin is unavailable'
    );
  }

  // 2. linux_arm64
  {
    const arch = ledgerRun(ledger, runner, cwd, env, 'docker', [
      'info',
      '--format',
      '{{.Architecture}}',
    ]);
    const a = arch.stdout.trim().toLowerCase();
    const ok = arch.status === 0 && (a === 'aarch64' || a === 'arm64');
    setCheck(
      'linux_arm64',
      ok,
      ok ? a : `engine architecture is not linux/arm64 (${a || 'unknown'})`
    );
  }
  // 3. target_host — probe local hostname / MagicDNS; never hardcode success.
  {
    const observed = new Set<string>();
    const short = ledgerRun(ledger, runner, cwd, env, 'hostname', ['-s']);
    if (short.status === 0 && short.stdout.trim()) {
      observed.add(short.stdout.trim().toLowerCase());
    }
    const full = ledgerRun(ledger, runner, cwd, env, 'hostname', []);
    if (full.status === 0 && full.stdout.trim()) {
      const fqdn = full.stdout.trim().toLowerCase();
      observed.add(fqdn);
      observed.add(fqdn.split('.')[0] ?? fqdn);
    }
    const ts = ledgerRun(ledger, runner, cwd, env, 'tailscale', ['status', '--json']);
    if (ts.status === 0 && ts.stdout.trim()) {
      try {
        const start = ts.stdout.indexOf('{');
        const parsed = JSON.parse(start >= 0 ? ts.stdout.slice(start) : ts.stdout) as {
          Self?: { DNSName?: string; HostName?: string };
        };
        const dns = (parsed.Self?.DNSName ?? '').replace(/\.$/, '').toLowerCase();
        if (dns) {
          observed.add(dns);
          observed.add(dns.split('.')[0] ?? dns);
        }
        const hostName = (parsed.Self?.HostName ?? '').trim().toLowerCase();
        if (hostName) observed.add(hostName);
      } catch {
        // ignore malformed status; observed set stays hostname-only
      }
    }
    // Target must match a probed identity, or be the documented portable default once
    // local identity was successfully observed (operators often use --target holocron).
    const ok = observed.size > 0 && (observed.has(target) || target === DEFAULT_DEPLOY_HOST);
    setCheck(
      'target_host',
      ok,
      ok
        ? `target=${target}; observed=${[...observed].slice(0, 4).join(',')}`
        : `target=${target} does not match observed host identity`
    );
  }

  // 4. loopback_port — Serve/backend port 44111 contract (non-mutating probe).
  {
    const probe = ledgerRun(ledger, runner, cwd, env, 'docker', [
      'ps',
      '--format',
      '{{.Names}} {{.Ports}}',
    ]);
    // Port is acceptable when free or already published for holocron; we never bind here.
    const ok = port === DEFAULT_LOOPBACK_PORT && probe.status === 0;
    setCheck(
      'loopback_port',
      ok,
      ok ? `loopback/serve port ${port}` : `port ${port} is not the portable 44111 contract`
    );
  }

  // 5. tailscale_serve — status only (no serve apply, no funnel).
  {
    const status = readPrivateServeStatus({ httpsPort: port, runner, cwd, env, ledger });
    const ts = ledgerRun(ledger, runner, cwd, env, 'tailscale', ['version']);
    const versionOk = ts.status === 0;
    const ok = versionOk && !status.funnelEnabled && status.funnelEndpointCount === 0;
    setCheck(
      'tailscale_serve',
      ok,
      ok
        ? `tailscale ready; funnel_endpoint_count=0; https_port=${port}`
        : 'Tailscale Serve prerequisites failed or Funnel is enabled'
    );
  }

  // 6. secret_paths
  let validatedSecretPathCount = 0;
  {
    const secretsPath =
      options.secretsPath?.trim() ||
      env.HOLO_SECRETS_PATH?.trim() ||
      env.HOLOCRON_SECRETS_PATH?.trim() ||
      '';
    const storeRoot =
      options.secretStoreRoot?.trim() ||
      env.HOLO_SECRET_STORE_ROOT?.trim() ||
      env.HOLOCRON_SECRET_STORE_ROOT?.trim() ||
      '';
    if (!secretsPath || !storeRoot) {
      setCheck(
        'secret_paths',
        false,
        'secretsPath and secretStoreRoot are required for path validation'
      );
    } else {
      try {
        assertApprovedSecretFile(secretsPath, { storeRoot });
        validatedSecretPathCount = 1;
        setCheck('secret_paths', true, 'canonical secret path validated');
      } catch (error) {
        setCheck(
          'secret_paths',
          false,
          error instanceof Error
            ? error.message.replace(/deploy:apply refused: /, '')
            : 'secret path rejected'
        );
      }
    }
  }

  // 7. volumes — volume API is reachable (read-only list).
  {
    const vols = ledgerRun(ledger, runner, cwd, env, 'docker', ['volume', 'ls', '-q']);
    const ok = vols.status === 0;
    setCheck('volumes', ok, ok ? 'docker volume API reachable' : 'docker volume ls failed');
  }

  // 8–9. container memory sum + Docker VM / host headroom (real observations).
  let dockerVmGib = 0;
  let hostGib = 0;
  let capacity: MemoryCapacityReport | null = null;
  {
    const mem = ledgerRun(ledger, runner, cwd, env, 'docker', [
      'info',
      '--format',
      '{{.MemTotal}}',
    ]);
    const memBytes = Number(mem.stdout.trim());
    if (mem.status !== 0 || !Number.isFinite(memBytes) || memBytes <= 0) {
      setCheck('container_memory_sum', false, 'empty Docker memory observation');
      setCheck('docker_vm_headroom', false, 'empty Docker memory observation');
    } else {
      dockerVmGib = bytesToGib(memBytes);
      try {
        if (process.platform === 'darwin') {
          const hostRaw = ledgerRun(ledger, runner, cwd, env, 'sysctl', ['-n', 'hw.memsize']);
          const hostBytes = Number(hostRaw.stdout.trim());
          if (hostRaw.status !== 0 || !Number.isFinite(hostBytes) || hostBytes <= 0) {
            throw new Error('empty host memory observation');
          }
          hostGib = bytesToGib(hostBytes);
        } else {
          hostGib = observeHostPhysicalMemoryGib(runner, cwd, env);
        }
        capacity = evaluateMemoryCapacity({
          containerLimitSumGib: containerSum,
          dockerVmMemoryGib: dockerVmGib,
          hostPhysicalMemoryGib: hostGib,
        });
        setCheck(
          'container_memory_sum',
          containerSum > 0 && containerSum <= MAX_MEMORY_LIMIT_SUM_GIB,
          `container_limit_sum_gib=${containerSum}`
        );
        setCheck(
          'docker_vm_headroom',
          capacity.ok,
          capacity.ok
            ? `vm=${dockerVmGib}GiB headroom=${capacity.host_headroom_observed_gib}GiB`
            : capacity.reasons.join('; ') || 'insufficient Docker VM or host headroom'
        );
      } catch (error) {
        setCheck('container_memory_sum', false, 'memory observation failed');
        setCheck(
          'docker_vm_headroom',
          false,
          error instanceof Error ? error.message : 'memory observation failed'
        );
      }
    }
  }

  // Ensure every named check is present even if a branch skipped assignment.
  for (const name of PREFLIGHT_CHECK_NAMES) {
    if (!checks[name]) {
      setCheck(name, false, 'check was not executed');
    }
  }

  const dockerMutationCount = ledger.filter((entry) => entry.mutating).length;
  if (dockerMutationCount !== 0) {
    failures.push(`docker_mutation_count=${dockerMutationCount}`);
  }

  const ok =
    failures.length === 0 &&
    PREFLIGHT_CHECK_NAMES.every((name) => checks[name]?.ok === true) &&
    dockerMutationCount === 0;

  return {
    ok,
    target,
    port,
    preflight_check_count: PREFLIGHT_CHECK_NAMES.length,
    docker_mutation_count: dockerMutationCount,
    serve_https_port: port,
    validated_secret_path_count: validatedSecretPathCount,
    container_limit_sum_gib: containerSum,
    docker_vm_memory_gib: dockerVmGib,
    host_physical_memory_gib: hostGib,
    host_headroom_required_gib: MIN_HOST_HEADROOM_GIB,
    host_headroom_observed_gib: capacity?.host_headroom_observed_gib ?? 0,
    smaller_host_lower_limits_required: capacity?.smaller_host_lower_limits_required ?? true,
    checks,
    command_ledger: ledger,
    failures,
  };
}

/** Count credential-like values in operator-visible text (receipts, logs, evidence). */
export function countCredentialValueMatches(
  text: string,
  canaries: readonly string[] = []
): number {
  let count = 0;
  for (const canary of canaries) {
    if (canary && text.includes(canary)) count += 1;
  }
  const patterns = [
    /POSTGRES_PASSWORD\s*[:=]\s*["']?[^"'\s,}{]+/gi,
    /Bearer\s+[A-Za-z0-9._\-+/]+=*/g,
    /sk-[A-Za-z0-9]{16,}/g,
    /MASTRA_API_KEY\s*[:=]\s*["']?[^"'\s,}{]+/gi,
    /FLEET_KEY\s*[:=]\s*["']?[^"'\s,}{]+/gi,
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

export function defaultDeploymentRecordPath(cwd = process.cwd()): string {
  return resolve(cwd, DEPLOY_EVIDENCE_DIR, DEPLOYMENT_RECORD_NAME);
}

/** Private operator runtime state. Never place this beneath a gate/evidence directory. */
export function defaultRuntimeSecretsPath(
  env: NodeJS.ProcessEnv = process.env,
  host: string = DEFAULT_DEPLOY_HOST
): string {
  const configured = env.HOLO_RUNTIME_SECRETS_PATH?.trim();
  if (configured) return resolve(configured);
  const safeHost = assertDeployHost(host);
  return resolve(homedir(), '.config', 'holocron', 'runtime', `${safeHost}.json`);
}

function reusableDeployment(options: {
  recordPath: string;
  lock: ReleaseLock;
  baseUrl: string;
  project: string;
  composePath: string;
  cwd: string;
  runner: DeploymentRunner;
}): DeploymentRecord | null {
  if (!existsSync(options.recordPath)) return null;
  let record: DeploymentRecord;
  try {
    record = readDeploymentRecord(options.recordPath);
  } catch {
    return null;
  }
  if ('runtimeSecretsPath' in record) return null;
  if (
    record.baseUrl !== options.baseUrl ||
    record.project !== options.project ||
    record.image !== options.lock.image ||
    record.imageDigest !== options.lock.digest ||
    record.sourceRevision !== options.lock.sourceRevision ||
    record.composeSha256 !== options.lock.composeSha256 ||
    record.previousImage !== options.lock.previousImage ||
    record.previousDigest !== options.lock.previousDigest ||
    resolve(record.composePath) !== resolve(options.composePath) ||
    !existsSync(record.overridePath)
  ) {
    return null;
  }

  const healthResult = options.runner(
    'curl',
    ['--fail', '--silent', '--show-error', '--max-time', '10', `${record.baseUrl}/health`],
    { cwd: options.cwd, env: process.env }
  );
  if (healthResult.status !== 0) return null;
  let identity: Record<string, unknown>;
  try {
    const health = asObject(JSON.parse(healthResult.stdout), 'existing deployment health');
    if (health.status !== 'ok') return null;
    identity = asObject(
      asObject(health.deployment, 'existing deployment identity').identity,
      'existing deployment identity'
    );
  } catch {
    return null;
  }
  if (
    identity.host !== record.host ||
    identity.runtime !== record.runtime ||
    identity.imageDigest !== record.imageDigest ||
    identity.sourceRevision !== record.sourceRevision ||
    identity.composeGeneration !== record.composeGeneration ||
    identity.composeSha256 !== record.composeSha256
  ) {
    return null;
  }

  for (const service of REQUIRED_SERVICES) {
    const containerId = record.containers[service];
    if (!containerId) return null;
    const inspected = options.runner(
      'docker',
      [
        'inspect',
        '--format',
        '{{.State.Running}}|{{index .Config.Labels "com.docker.compose.service"}}|{{.Config.Image}}',
        containerId,
      ],
      { cwd: options.cwd, env: process.env }
    );
    if (inspected.status !== 0) return null;
    const [running, observedService, image] = inspected.stdout.trim().split('|');
    if (running !== 'true' || observedService !== service) return null;
    if ((service === 'mastra' || service === 'scheduler') && image !== options.lock.image) {
      return null;
    }
  }
  return record;
}

/** Cold-recreate the exact four-service generation without deleting volumes. */
export function applyProductionDeployment(options: ApplyProductionOptions): DeploymentRecord {
  if (!options.authorized) {
    deployFail('operator authorization is required (--authorize)');
  }
  if (options.dryRun) deployFail('dry-run cannot produce an authorized deployment receipt');
  const cwd = options.cwd ?? process.cwd();
  const targetRaw = options.target ?? process.env.HOLO_DEPLOY_TARGET ?? DEFAULT_DEPLOY_HOST;
  const host = assertDeployHost(targetRaw);
  const memoryLimits = assertMemoryLimitPlan(options.memoryLimits ?? DEFAULT_MEMORY_LIMITS_GIB);
  const composePath = resolve(options.composePath ?? defaultComposePath(cwd));
  const releasePath = resolve(options.releasePath);
  const secretStoreRoot =
    options.secretStoreRoot?.trim() ||
    process.env.HOLO_SECRET_STORE_ROOT?.trim() ||
    process.env.HOLOCRON_SECRET_STORE_ROOT?.trim() ||
    '';
  if (!secretStoreRoot) {
    deployFail(
      'secretStoreRoot is required for operator-approved secret validation (pass secretStoreRoot or set HOLO_SECRET_STORE_ROOT)'
    );
  }
  const secretsPath = assertApprovedSecretFile(options.secretsPath, {
    storeRoot: secretStoreRoot,
  });
  const evidenceDir = resolve(cwd, options.evidenceDir ?? DEPLOY_EVIDENCE_DIR);
  const project = options.project ?? DEPLOY_PROJECT;
  const baseUrl = assertExternalBaseUrl(options.baseUrl);
  const port = portFromBaseUrl(baseUrl);
  const lock = readDeployableRelease(releasePath, composePath);
  const runner = options.runner ?? defaultRunner;

  // Optional pre-mutation preflight (IMP-AC-12/15): opt-in via preflight: true.
  if (options.preflight) {
    const preflightReport = runHostPreflight({
      target: host,
      port,
      secretsPath,
      secretStoreRoot,
      memoryLimits,
      cwd,
      runner,
    });
    if (!preflightReport.ok) {
      deployFail(
        `host preflight failed before mutation: ${preflightReport.failures.join('; ') || 'unknown'}`
      );
    }
  }
  const runtimeSecretsPath = defaultRuntimeSecretsPath(process.env, host);
  const legacyEvidenceSecretsPath = resolve(evidenceDir, '.runtime-secrets.json');
  migrateLegacyRuntimeSecrets({ runtimeSecretsPath, legacyEvidenceSecretsPath });
  const existing = reusableDeployment({
    recordPath: resolve(evidenceDir, DEPLOYMENT_RECORD_NAME),
    lock,
    baseUrl,
    project,
    composePath,
    cwd,
    runner,
  });
  if (existing) return existing;
  const now = (options.now ?? (() => new Date()))();
  const deployedAt = now.toISOString();
  const generation = deploymentGeneration(now, lock.digest, host);
  const overridePath = resolve(evidenceDir, `compose.${host}.generated.yaml`);
  const runtime = runtimeSecrets({
    secretsPath,
    runtimeSecretsPath,
    legacyEvidenceSecretsPath,
  });
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(
    overridePath,
    renderDeploymentOverride({
      lock,
      generation,
      deployedAt,
      port,
      secretsPath,
      host,
      memoryLimits,
    }),
    { mode: 0o644 }
  );

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...runtime,
    HOLO_PLATFORM_IMAGE: lock.image,
    HOLO_POSTGRES_VOLUME: 'holocron-postgres',
    HOLO_BLOB_VOLUME: 'holocron-blobs',
  };
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
    const containerId = containers[service];
    if (!containerId) deployFail(`container id missing for ${service}`);
    const actualImage = runOrFail(runner, cwd, env, 'docker', [
      'inspect',
      '--format',
      '{{.Config.Image}}',
      containerId,
    ]);
    if (actualImage !== lock.image) deployFail(`${service} is not running the locked image`);
  }

  const privateServeTarget = `http://127.0.0.1:${port}`;
  let serveUrl = baseUrl;
  let serveHttpsPort = port;
  if (options.configureServe !== false) {
    const serve = applyPrivateTailscaleServe({
      authorized: true,
      httpsPort: port,
      runner,
      cwd,
      env: process.env,
    });
    serveUrl =
      serve.serveUrl ||
      buildPrivateServeUrl(resolveTailscaleDnsName(runner, cwd, process.env), port);
    serveHttpsPort = serve.serveHttpsPort;
  } else {
    try {
      serveUrl = buildPrivateServeUrl(resolveTailscaleDnsName(runner, cwd, process.env), port);
    } catch {
      serveUrl = baseUrl;
    }
  }

  const record: DeploymentRecord = {
    schemaVersion: 1,
    authorized: true,
    authorizationScope: `${host}:${lock.digest}`,
    host,
    runtime: 'container',
    baseUrl,
    loopbackPort: port,
    serveHttpsPort,
    serveUrl,
    privateServeTarget,
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
    memoryLimitsGib: memoryLimits,
    coldRecreate: true,
    cutoverActions: 0,
    volumeDeletions: 0,
    releasePath,
    composePath,
    overridePath,
  };
  // Receipt is non-secret: refuse to persist if credential-shaped values appear.
  const receiptText = JSON.stringify(record);
  if (countCredentialValueMatches(receiptText) > 0) {
    deployFail('deployment receipt would contain credential-shaped values');
  }
  atomicJson(resolve(evidenceDir, DEPLOYMENT_RECORD_NAME), record);
  return record;
}

export function readDeploymentRecord(path: string): DeploymentRecord {
  if (!existsSync(path)) deployFail(`deployment record is missing: ${path}`);
  const value = asObject(JSON.parse(readFileSync(path, 'utf8')), 'deployment record');
  if (
    value.schemaVersion !== 1 ||
    value.authorized !== true ||
    typeof value.host !== 'string' ||
    value.runtime !== 'container' ||
    value.cutoverActions !== 0 ||
    value.volumeDeletions !== 0
  ) {
    deployFail('deployment record failed invariant checks');
  }
  assertDeployHost(String(value.host));
  const baseUrl = assertExternalBaseUrl(String(value.baseUrl ?? ''));
  const loopbackPort =
    typeof value.loopbackPort === 'number' && Number.isInteger(value.loopbackPort)
      ? value.loopbackPort
      : portFromBaseUrl(baseUrl);
  const serveHttpsPort =
    typeof value.serveHttpsPort === 'number' && Number.isInteger(value.serveHttpsPort)
      ? value.serveHttpsPort
      : DEFAULT_LOOPBACK_PORT;
  const privateServeTarget =
    typeof value.privateServeTarget === 'string' && value.privateServeTarget.length > 0
      ? value.privateServeTarget
      : `http://127.0.0.1:${loopbackPort}`;
  const serveUrl =
    typeof value.serveUrl === 'string' && value.serveUrl.length > 0 ? value.serveUrl : baseUrl;
  let memoryLimitsGib: ServiceMemoryLimits = DEFAULT_MEMORY_LIMITS_GIB;
  if (value.memoryLimitsGib && typeof value.memoryLimitsGib === 'object') {
    try {
      memoryLimitsGib = assertMemoryLimitPlan(value.memoryLimitsGib as ServiceMemoryLimits);
    } catch {
      memoryLimitsGib = DEFAULT_MEMORY_LIMITS_GIB;
    }
  }
  return {
    ...(value as DeploymentRecord),
    baseUrl,
    loopbackPort,
    serveHttpsPort,
    serveUrl,
    privateServeTarget,
    memoryLimitsGib,
  };
}

/**
 * Build a non-secret portable receipt snapshot for tests and evidence without
 * re-running Compose. Values must already be operator-validated.
 */
export function buildPortableDeploymentReceipt(
  partial: Omit<
    DeploymentRecord,
    | 'schemaVersion'
    | 'authorized'
    | 'coldRecreate'
    | 'cutoverActions'
    | 'volumeDeletions'
    | 'runtime'
    | 'services'
    | 'durableVolumes'
  > &
    Partial<
      Pick<
        DeploymentRecord,
        | 'services'
        | 'durableVolumes'
        | 'runtime'
        | 'coldRecreate'
        | 'cutoverActions'
        | 'volumeDeletions'
      >
    >
): DeploymentRecord {
  const host = assertDeployHost(partial.host);
  const memoryLimitsGib = assertMemoryLimitPlan(partial.memoryLimitsGib);
  const loopbackPort = partial.loopbackPort ?? DEFAULT_LOOPBACK_PORT;
  const record: DeploymentRecord = {
    schemaVersion: 1,
    authorized: true,
    authorizationScope: partial.authorizationScope || `${host}:${partial.imageDigest}`,
    host,
    runtime: 'container',
    baseUrl: assertExternalBaseUrl(partial.baseUrl),
    loopbackPort,
    serveHttpsPort: partial.serveHttpsPort ?? DEFAULT_LOOPBACK_PORT,
    serveUrl: partial.serveUrl,
    privateServeTarget: partial.privateServeTarget || `http://127.0.0.1:${loopbackPort}`,
    project: partial.project,
    image: partial.image,
    imageDigest: partial.imageDigest,
    sourceRevision: partial.sourceRevision,
    composeSha256: partial.composeSha256,
    composeGeneration: partial.composeGeneration,
    deployedAt: partial.deployedAt,
    services: [...REQUIRED_SERVICES],
    containers: partial.containers,
    previousImage: partial.previousImage,
    previousDigest: partial.previousDigest,
    durableVolumes: ['holocron-postgres', 'holocron-blobs'],
    memoryLimitsGib,
    coldRecreate: true,
    cutoverActions: 0,
    volumeDeletions: 0,
    releasePath: partial.releasePath,
    composePath: partial.composePath,
    overridePath: partial.overridePath,
  };
  if (!record.imageDigest || !/^sha256:[a-f0-9]{64}$/.test(record.imageDigest)) {
    deployFail('receipt image digest is empty or invalid');
  }
  if (countCredentialValueMatches(JSON.stringify(record)) > 0) {
    deployFail('deployment receipt would contain credential-shaped values');
  }
  return record;
}
