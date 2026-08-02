/**
 * Deployment identity carried by the already-listening production process.
 *
 * The deployer injects these values from the immutable release lock and the
 * generated Compose generation. Verifiers may compare against them, but may
 * never supply values that are treated as observed server identity.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const DEPLOYMENT_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
export const DEPLOYMENT_REVISION_PATTERN = /^[a-f0-9]{40}$/;
export const DEPLOYMENT_GENERATION_PATTERN = /^[a-z0-9][a-z0-9._-]{7,127}$/;

export type DeploymentIdentity = {
  host: string;
  runtime: 'container';
  imageDigest: string;
  sourceRevision: string;
  composeGeneration: string;
  composeSha256: string;
  deployedAt: string;
  pid: number;
  uptimeMs: number;
};

export type DeploymentIdentityProbe = {
  ready: boolean;
  required: boolean;
  identity: DeploymentIdentity | null;
  error?: string;
};

export type ExpectedDeploymentIdentity = Pick<
  DeploymentIdentity,
  'host' | 'runtime' | 'imageDigest' | 'sourceRevision' | 'composeGeneration' | 'composeSha256'
>;

export type ExternalIdentityVerification = {
  ok: true;
  baseUrl: string;
  identityClass: 'deployed-http';
  observed: DeploymentIdentity;
  health: Record<string, unknown>;
};

export class DeploymentIdentityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'DeploymentIdentityError';
    this.code = code;
  }
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function validIsoTimestamp(value: string): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

/** Read server-owned identity from process environment. */
export function readDeploymentIdentity(
  env: NodeJS.ProcessEnv = process.env,
  processFacts: { pid?: number; uptimeMs?: number } = {}
): DeploymentIdentityProbe {
  const required = env.HOLO_PRODUCTION_READINESS === '1' || env.HOLO_DEPLOYMENT_REQUIRED === '1';
  const host = nonEmpty(env.HOLO_DEPLOY_HOST);
  const runtime = nonEmpty(env.HOLO_DEPLOY_RUNTIME);
  const imageDigest = nonEmpty(env.HOLO_IMAGE_DIGEST);
  const sourceRevision = nonEmpty(env.HOLO_SOURCE_REVISION);
  const composeGeneration = nonEmpty(env.HOLO_COMPOSE_GENERATION);
  const composeSha256 = nonEmpty(env.HOLO_COMPOSE_SHA256);
  const deployedAt = nonEmpty(env.HOLO_DEPLOYED_AT);

  const missing = [
    ['host', host],
    ['runtime', runtime],
    ['imageDigest', imageDigest],
    ['sourceRevision', sourceRevision],
    ['composeGeneration', composeGeneration],
    ['composeSha256', composeSha256],
    ['deployedAt', deployedAt],
  ]
    .filter(([, value]) => value === null)
    .map(([field]) => field);

  if (missing.length > 0) {
    return {
      ready: !required,
      required,
      identity: null,
      ...(required ? { error: `missing deployment identity fields: ${missing.join(', ')}` } : {}),
    };
  }

  // The missing-field branch above proves these values are concrete strings;
  // keep an explicit guard so static analysis shares that proof.
  if (
    host === null ||
    runtime === null ||
    imageDigest === null ||
    sourceRevision === null ||
    composeGeneration === null ||
    composeSha256 === null ||
    deployedAt === null
  ) {
    return { ready: false, required, identity: null, error: 'deployment identity is incomplete' };
  }

  if (!/^[a-z0-9][a-z0-9.-]{0,62}$/.test(host)) {
    return { ready: false, required, identity: null, error: 'deployment host is invalid' };
  }
  if (runtime !== 'container') {
    return {
      ready: false,
      required,
      identity: null,
      error: 'deployment runtime must be container',
    };
  }
  if (!DEPLOYMENT_DIGEST_PATTERN.test(imageDigest)) {
    return { ready: false, required, identity: null, error: 'deployment image digest is invalid' };
  }
  if (!DEPLOYMENT_REVISION_PATTERN.test(sourceRevision)) {
    return {
      ready: false,
      required,
      identity: null,
      error: 'deployment source revision is invalid',
    };
  }
  if (!DEPLOYMENT_GENERATION_PATTERN.test(composeGeneration)) {
    return { ready: false, required, identity: null, error: 'Compose generation is invalid' };
  }
  if (!/^[a-f0-9]{64}$/.test(composeSha256)) {
    return { ready: false, required, identity: null, error: 'Compose checksum is invalid' };
  }
  if (!validIsoTimestamp(deployedAt)) {
    return { ready: false, required, identity: null, error: 'deployment timestamp is invalid' };
  }

  return {
    ready: true,
    required,
    identity: {
      host,
      runtime: 'container',
      imageDigest,
      sourceRevision,
      composeGeneration,
      composeSha256,
      deployedAt,
      pid: processFacts.pid ?? process.pid,
      uptimeMs: Math.max(1, Math.ceil(processFacts.uptimeMs ?? process.uptime() * 1000)),
    },
  };
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '0.0.0.0' ||
    normalized === '::' ||
    normalized === '::1'
  ) {
    return true;
  }
  if (isIP(normalized) === 4) {
    const first = Number(normalized.split('.')[0]);
    return first === 127 || first === 0;
  }
  return false;
}

export type DeploymentDnsLookup = (
  hostname: string
) => Promise<Array<{ address: string; family: number }>>;

const defaultDnsLookup: DeploymentDnsLookup = async (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

/** Reject hostnames whose current DNS answers include a loopback address. */
export async function assertExternalDnsResolution(
  baseUrl: string,
  dnsLookup: DeploymentDnsLookup = defaultDnsLookup
): Promise<void> {
  const hostname = new URL(baseUrl).hostname;
  if (isIP(hostname) !== 0) return;
  let answers: Array<{ address: string; family: number }>;
  try {
    answers = await dnsLookup(hostname);
  } catch (error) {
    throw new DeploymentIdentityError(
      'DNS_UNRESOLVED',
      error instanceof Error ? error.message : String(error)
    );
  }
  if (answers.length === 0) {
    throw new DeploymentIdentityError('DNS_UNRESOLVED', 'base URL hostname has no DNS answers');
  }
  if (answers.some(({ address }) => isLoopbackHostname(address))) {
    throw new DeploymentIdentityError(
      'LOOPBACK_REJECTED',
      'base URL hostname resolves to loopback'
    );
  }
}

/** Require one HTTP(S), non-loopback URL with no credentials/query/fragment. */
export function assertExternalBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DeploymentIdentityError('INVALID_BASE_URL', 'base URL is not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new DeploymentIdentityError('INVALID_BASE_URL', 'base URL must use http or https');
  }
  if (!url.hostname || isLoopbackHostname(url.hostname)) {
    throw new DeploymentIdentityError('LOOPBACK_REJECTED', 'base URL must be non-loopback');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new DeploymentIdentityError(
      'INVALID_BASE_URL',
      'base URL cannot contain credentials, a query, or a fragment'
    );
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new DeploymentIdentityError('INVALID_BASE_URL', 'base URL must not contain a path');
  }
  return url.origin;
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DeploymentIdentityError(code, 'health response must be a JSON object');
  }
  return value as Record<string, unknown>;
}

function observedIdentity(body: Record<string, unknown>): DeploymentIdentity {
  const nested = asRecord(body.deployment, 'MISSING_IDENTITY');
  const candidate = asRecord(nested.identity, 'MISSING_IDENTITY');
  const requiredStrings = [
    'host',
    'runtime',
    'imageDigest',
    'sourceRevision',
    'composeGeneration',
    'composeSha256',
    'deployedAt',
  ] as const;
  for (const field of requiredStrings) {
    if (typeof candidate[field] !== 'string' || candidate[field].length === 0) {
      throw new DeploymentIdentityError(
        'MISSING_IDENTITY',
        `health identity field ${field} is missing`
      );
    }
  }
  if (typeof candidate.pid !== 'number' || !Number.isInteger(candidate.pid) || candidate.pid <= 0) {
    throw new DeploymentIdentityError('MISSING_IDENTITY', 'health identity pid is missing');
  }
  if (typeof candidate.uptimeMs !== 'number' || candidate.uptimeMs <= 0) {
    throw new DeploymentIdentityError('MISSING_IDENTITY', 'health identity uptimeMs is missing');
  }
  return candidate as DeploymentIdentity;
}

/**
 * Fetch and verify identity from an endpoint that was already listening before
 * this function began. This function has no server-starting or Docker actions.
 */
export async function verifyExternalDeploymentIdentity(options: {
  baseUrl: string;
  expected: ExpectedDeploymentIdentity;
  fetchImpl?: typeof fetch;
  verifierPid?: number;
  timeoutMs?: number;
  dnsLookup?: DeploymentDnsLookup;
}): Promise<ExternalIdentityVerification> {
  const baseUrl = assertExternalBaseUrl(options.baseUrl);
  await assertExternalDnsResolution(baseUrl, options.dnsLookup);
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/health`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (error) {
    throw new DeploymentIdentityError(
      'HEALTH_UNREACHABLE',
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    clearTimeout(timer);
  }
  if (response.status !== 200) {
    throw new DeploymentIdentityError(
      'HEALTH_NOT_READY',
      `external health returned HTTP ${response.status}`
    );
  }
  const body = asRecord(await response.json(), 'INVALID_HEALTH');
  const identity = observedIdentity(body);
  if (identity.pid === (options.verifierPid ?? process.pid)) {
    throw new DeploymentIdentityError(
      'IN_PROCESS_REJECTED',
      'serving PID equals verifier PID; an independently listening deployment is required'
    );
  }

  const mismatches: string[] = [];
  for (const field of [
    'host',
    'runtime',
    'imageDigest',
    'sourceRevision',
    'composeGeneration',
    'composeSha256',
  ] as const) {
    if (identity[field] !== options.expected[field]) mismatches.push(field);
  }
  if (mismatches.length > 0) {
    throw new DeploymentIdentityError(
      mismatches.includes('composeGeneration') ? 'STALE_IDENTITY' : 'IDENTITY_MISMATCH',
      `health identity differs from the authorized deployment: ${mismatches.join(', ')}`
    );
  }

  const deployment = asRecord(body.deployment, 'MISSING_IDENTITY');
  if (deployment.ready !== true) {
    throw new DeploymentIdentityError(
      'IDENTITY_NOT_READY',
      'deployment identity probe is not ready'
    );
  }
  return { ok: true, baseUrl, identityClass: 'deployed-http', observed: identity, health: body };
}
