/** External deployment certification, dependency negative control, and restart proof. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getSecretValue, resolveSecretsPathFromEnv } from '../config/secrets.ts';
import {
  DeploymentIdentityError,
  type ExpectedDeploymentIdentity,
  verifyExternalDeploymentIdentity,
} from '../http/deployment-identity.ts';
import {
  assertMemoryLimitPlan,
  countCredentialValueMatches,
  DEFAULT_LOOPBACK_PORT,
  DEPLOY_EVIDENCE_DIR,
  type DeploymentProcessResult,
  type DeploymentRecord,
  type DeploymentRunner,
  defaultDeploymentRecordPath,
  defaultRuntimeSecretsPath,
  readDeployableRelease,
  readDeploymentRecord,
  readPrivateServeStatus,
  type ServiceMemoryLimits,
} from './production-deploy.ts';
import { REQUIRED_SERVICES, REQUIRED_VOLUME_NAMES } from './production-release.ts';
import { listTools } from '../tools/registry.ts';
import { z } from 'zod';

/**
 * Canonicalize a JSON Schema for comparison/evidence: strip `$schema`, sort
 * object keys (deep) so schema diffs are stable across serializers.
 */
export function canonicalizeJsonSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return {};
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(schema as Record<string, unknown>).sort()) {
    if (key === '$schema') continue;
    const value = (schema as Record<string, unknown>)[key];
    sorted[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? canonicalizeJsonSchema(value)
        : value;
  }
  return sorted;
}

function jsonSchemaExtrasAllowed(value: unknown): boolean {
  // JSON Schema semantics: absent additionalProperties ≡ true (extras allowed).
  return value === undefined || value === true;
}

/**
 * imp-mcp-schema-drift-hardening T3 — compare a DEPLOYED MCP tool's advertised
 * outputSchema against the DECLARED registry schema (as z.toJSONSchema output).
 * Compares property-name sets, required sets, and additionalProperties. Returns
 * a list of diff reasons (empty = equivalent). Pure — unit-tested in isolation.
 */
export function compareAdvertisedOutputSchema(advertised: unknown, declared: unknown): string[] {
  const diffs: string[] = [];
  if (!advertised || typeof advertised !== 'object' || Array.isArray(advertised)) {
    return ['advertised_output_schema_not_an_object'];
  }
  if (!declared || typeof declared !== 'object' || Array.isArray(declared)) {
    return ['declared_output_schema_not_an_object'];
  }
  const a = advertised as Record<string, unknown>;
  const d = declared as Record<string, unknown>;
  const aProps = new Set(Object.keys((a.properties ?? {}) as Record<string, unknown>));
  const dProps = new Set(Object.keys((d.properties ?? {}) as Record<string, unknown>));
  for (const key of [...dProps].sort()) {
    if (!aProps.has(key)) diffs.push(`missing_property:${key}`);
  }
  for (const key of [...aProps].sort()) {
    if (!dProps.has(key)) diffs.push(`unexpected_property:${key}`);
  }
  const aRequired = new Set(Array.isArray(a.required) ? a.required.map(String) : []);
  const dRequired = new Set(Array.isArray(d.required) ? d.required.map(String) : []);
  for (const key of [...dRequired].sort()) {
    if (!aRequired.has(key)) diffs.push(`missing_required:${key}`);
  }
  for (const key of [...aRequired].sort()) {
    if (!dRequired.has(key)) diffs.push(`unexpected_required:${key}`);
  }
  if (jsonSchemaExtrasAllowed(a.additionalProperties) !== jsonSchemaExtrasAllowed(d.additionalProperties)) {
    diffs.push(
      `additionalProperties_mismatch:advertised=${String(a.additionalProperties ?? 'absent')},declared=${String(d.additionalProperties ?? 'absent')}`
    );
  }
  return diffs;
}

/**
 * Source revision of the tree RUNNING this verifier (the declared contracts
 * come from its registry imports). Null when git is unavailable — callers
 * then fail closed on schema mismatch instead of downgrading to a warning.
 */
function currentSourceRevision(cwd: string): string | null {
  try {
    const probe = spawnSync('git', ['rev-parse', 'HEAD'], { cwd });
    if (probe.status !== 0) return null;
    const revision = probe.stdout?.toString().trim() ?? '';
    return revision.length > 0 ? revision : null;
  } catch {
    return null;
  }
}

export type VerifyProductionOptions = {
  releasePath: string;
  baseUrl: string;
  recordPath?: string;
  secretsPath?: string;
  cwd?: string;
  restartProbe?: boolean;
  dependencyProbe?: boolean;
  negativeControls?: boolean;
  mcpDiscovery?: boolean;
  /** Receipt-driven portable verification (IMP-AC-14). Default true when record has serve fields. */
  portableReceipt?: boolean;
  runner?: DeploymentRunner;
  fetchImpl?: typeof fetch;
};

export type VerificationDimension = {
  name: string;
  ok: boolean;
  summary: string;
};

export type PortableVerifyReport = {
  ok: boolean;
  verification_dimension_count: number;
  serve_health_status: number;
  identity_mismatch_rejected: boolean;
  memory_drift_rejected: boolean;
  dimensions: VerificationDimension[];
  receipt: {
    host: string;
    loopbackPort: number;
    serveUrl: string;
    imageDigest: string;
    sourceRevision: string;
    composeGeneration: string;
    serviceCount: number;
    namedVolumeCount: number;
    memoryLimitsGib: ServiceMemoryLimits;
  };
  funnelEnabled: boolean;
  credential_value_count: number;
};

export type RestartEvidence = {
  ok: true;
  signal: 'SIGKILL';
  containerId: string;
  oldPid: number;
  newPid: number;
  restartCountBefore: number;
  restartCount: number;
  image: string;
  imageDigest: string;
  health: 'healthy';
  sentinel: 's29-deploy-sentinel';
  postgresRows: 1;
  blobObjects: 1;
  postgresHash: string;
  blobHash: string;
  deletedVolumes: 0;
};

export type VerifyProductionReport = {
  ok: true;
  verifiedAt: string;
  baseUrl: string;
  identityClass: 'deployed-http';
  handoffVerified: true;
  release: {
    host: string;
    runtime: 'container';
    imageDigest: string;
    sourceRevision: string;
    composeGeneration: string;
  };
  readiness: Record<string, unknown>;
  dependency: Record<string, unknown> | null;
  identityNegatives: Record<string, unknown> | null;
  restart: RestartEvidence | null;
  mcp: Record<string, unknown> | null;
  cutoverActions: 0;
  toolInvocations: 0;
  soakInvocations: 0;
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

function verifyFail(message: string): never {
  throw new Error(`deploy:verify refused: ${message}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    verifyFail(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function atomicJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
  renameSync(temp, path);
}

function runtimeEnvironment(record: DeploymentRecord): NodeJS.ProcessEnv {
  const runtimeSecretsPath = defaultRuntimeSecretsPath();
  if (!existsSync(runtimeSecretsPath)) {
    verifyFail('private runtime credentials are missing from the operator runtime store');
  }
  const secrets = asObject(JSON.parse(readFileSync(runtimeSecretsPath, 'utf8')), 'runtime secrets');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOLO_PLATFORM_IMAGE: record.image,
    HOLO_POSTGRES_VOLUME: 'holocron-postgres',
    HOLO_BLOB_HOST_PATH: process.env.HOLO_BLOB_HOST_PATH || './.data/holocron-blobs',
  };
  for (const key of [
    'POSTGRES_PASSWORD',
    'DATABASE_URL',
    'MASTRA_API_KEY',
    'FLEET_KEY',
    'ZERO_ADMIN_PASSWORD',
    'FLEET_URL',
  ]) {
    const value = secrets[key];
    if (typeof value !== 'string' || value.length === 0) {
      verifyFail(`runtime secret ${key} is missing`);
    }
    env[key] = value;
  }
  return env;
}

function composePrefix(record: DeploymentRecord): string[] {
  return ['compose', '-p', record.project, '-f', record.composePath, '-f', record.overridePath];
}

/** Drain and refresh long-lived Postgres consumers without a reconnect stampede. */
export function postgresDependencyRecoveryArgs(prefix: readonly string[]): string[][] {
  return [
    [...prefix, 'stop', 'mastra', 'scheduler', 'zero-cache'],
    [...prefix, 'start', 'postgres'],
    [...prefix, 'up', '-d', '--wait', '--wait-timeout', '240', 'postgres'],
    [...prefix, 'start', 'mastra', 'zero-cache'],
    [...prefix, 'up', '-d', '--wait', '--wait-timeout', '240'],
  ];
}

function runOrFail(
  runner: DeploymentRunner,
  cwd: string,
  env: NodeJS.ProcessEnv,
  command: string,
  args: string[]
): string {
  const result: DeploymentProcessResult = runner(command, args, { cwd, env });
  if (result.status !== 0) {
    // Never embed child stdout/stderr — they may include env-expanded secrets.
    verifyFail(`${command} ${args.join(' ')} failed (exit ${result.status ?? 'null'})`);
  }
  return result.stdout.trim();
}

/** GiB plan value → Docker HostConfig.Memory bytes (Compose `Ng` semantics). */
function memoryLimitGibToBytes(gib: number): number {
  return Math.round(gib * 1024 ** 3);
}

/**
 * Compare receipt memory plan to live container HostConfig.Memory values.
 * Returns true when every service's live limit matches the plan (within 1 MiB).
 */
function liveMemoryMatchesPlan(
  liveBytesByService: Readonly<Record<string, number>>,
  plan: ServiceMemoryLimits
): boolean {
  for (const service of REQUIRED_SERVICES) {
    const live = liveBytesByService[service];
    if (!Number.isFinite(live) || live <= 0) return false;
    const expected = memoryLimitGibToBytes(plan[service]);
    if (Math.abs(live - expected) > 1024 * 1024) return false;
  }
  return true;
}

function expectedIdentity(record: DeploymentRecord): ExpectedDeploymentIdentity {
  return {
    host: record.host,
    runtime: record.runtime,
    imageDigest: record.imageDigest,
    sourceRevision: record.sourceRevision,
    composeGeneration: record.composeGeneration,
    composeSha256: record.composeSha256,
  };
}

function assertRecordMatchesRelease(record: DeploymentRecord, releasePath: string): void {
  if (resolve(record.releasePath) !== resolve(releasePath)) {
    verifyFail('deployment record release path differs from requested release');
  }
  const lock = readDeployableRelease(releasePath, record.composePath);
  const mismatches = [
    ['image', record.image, lock.image],
    ['imageDigest', record.imageDigest, lock.digest],
    ['sourceRevision', record.sourceRevision, lock.sourceRevision],
    ['composeSha256', record.composeSha256, lock.composeSha256],
    ['previousImage', record.previousImage, lock.previousImage],
    ['previousDigest', record.previousDigest, lock.previousDigest],
  ].filter(([, observed, expected]) => observed !== expected);
  if (mismatches.length > 0) {
    verifyFail(
      `deployment record differs from release: ${mismatches.map(([name]) => name).join(', ')}`
    );
  }
  if (record.services.join(',') !== [...REQUIRED_SERVICES].join(',')) {
    verifyFail('deployment record must contain the exact four ordered services');
  }
  if (record.cutoverActions !== 0 || record.volumeDeletions !== 0) {
    verifyFail('deployment record contains forbidden cutover or volume deletion actions');
  }
}

async function waitForExternalHealth(options: {
  record: DeploymentRecord;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}): Promise<Awaited<ReturnType<typeof verifyExternalDeploymentIdentity>>> {
  const deadline = Date.now() + (options.timeoutMs ?? 180_000);
  let lastError = 'health did not run';
  while (Date.now() < deadline) {
    try {
      return await verifyExternalDeploymentIdentity({
        baseUrl: options.record.baseUrl,
        expected: expectedIdentity(options.record),
        fetchImpl: options.fetchImpl,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await delay(1_000);
    }
  }
  verifyFail(`external health did not recover: ${lastError}`);
}

async function dependencyNegativeControl(options: {
  record: DeploymentRecord;
  cwd: string;
  env: NodeJS.ProcessEnv;
  runner: DeploymentRunner;
  fetchImpl: typeof fetch;
}): Promise<Record<string, unknown>> {
  const prefix = composePrefix(options.record);
  runOrFail(options.runner, options.cwd, options.env, 'docker', [...prefix, 'stop', 'postgres']);
  let responseStatus = 0;
  let body: Record<string, unknown> = {};
  try {
    const response = await options.fetchImpl(`${options.record.baseUrl}/health`, {
      signal: AbortSignal.timeout(15_000),
      headers: { accept: 'application/json' },
    });
    responseStatus = response.status;
    body = asObject(await response.json(), 'dependency-down health');
    if (response.status !== 503 || body.failing_dependency !== 'postgres') {
      verifyFail(
        `Postgres-down health must return 503/postgres; got ${response.status}/${String(body.failing_dependency)}`
      );
    }
  } finally {
    for (const args of postgresDependencyRecoveryArgs(prefix)) {
      runOrFail(options.runner, options.cwd, options.env, 'docker', args);
    }
  }
  await waitForExternalHealth({ record: options.record, fetchImpl: options.fetchImpl });
  return {
    ok: true,
    removed: 'postgres',
    status: responseStatus,
    failingDependency: body.failing_dependency,
    restored: true,
  };
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function inspectNumber(
  runner: DeploymentRunner,
  cwd: string,
  env: NodeJS.ProcessEnv,
  container: string,
  format: string,
  label: string
): number {
  const raw = runOrFail(runner, cwd, env, 'docker', ['inspect', '--format', format, container]);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) verifyFail(`${label} is invalid: ${raw}`);
  return value;
}

async function restartAndDurabilityProbe(options: {
  record: DeploymentRecord;
  cwd: string;
  env: NodeJS.ProcessEnv;
  runner: DeploymentRunner;
  fetchImpl: typeof fetch;
}): Promise<RestartEvidence> {
  const prefix = composePrefix(options.record);
  const containerId = runOrFail(options.runner, options.cwd, options.env, 'docker', [
    ...prefix,
    'ps',
    '-q',
    'mastra',
  ]);
  if (!containerId) verifyFail('Mastra container is missing');
  const sentinelKey = `s29-deploy-sentinel-${options.record.composeGeneration}`;
  const sentinelValue = `s29-deploy-sentinel:${options.record.imageDigest}:${options.record.sourceRevision}`;
  const blobPath = `/var/lib/holocron/blobs/deployment-sentinels/${options.record.composeGeneration}`;
  const sql = `CREATE TABLE IF NOT EXISTS deployment_sentinels (key text PRIMARY KEY, value text NOT NULL); INSERT INTO deployment_sentinels(key,value) VALUES ('${sentinelKey}','${sentinelValue}') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;`;
  runOrFail(options.runner, options.cwd, options.env, 'docker', [
    ...prefix,
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
    sql,
  ]);
  runOrFail(options.runner, options.cwd, options.env, 'docker', [
    ...prefix,
    'exec',
    '-T',
    'mastra',
    '/bin/sh',
    '-ec',
    'mkdir -p "$(dirname "$2")"; printf %s "$1" > "$2"',
    'sentinel-writer',
    sentinelValue,
    blobPath,
  ]);
  const postgresBefore = runOrFail(options.runner, options.cwd, options.env, 'docker', [
    ...prefix,
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
    `SELECT value FROM deployment_sentinels WHERE key='${sentinelKey}'`,
  ]);
  const blobBefore = runOrFail(options.runner, options.cwd, options.env, 'docker', [
    ...prefix,
    'exec',
    '-T',
    'mastra',
    '/bin/sh',
    '-ec',
    'cat "$1"',
    'sentinel-reader',
    blobPath,
  ]);
  if (postgresBefore !== sentinelValue || blobBefore !== sentinelValue) {
    verifyFail('non-empty durable sentinels were not seeded exactly');
  }

  const oldPid = inspectNumber(
    options.runner,
    options.cwd,
    options.env,
    containerId,
    '{{.State.Pid}}',
    'old PID'
  );
  if (oldPid <= 1) verifyFail(`Mastra host PID is unsafe for SIGKILL: ${oldPid}`);
  const restartCountBefore = inspectNumber(
    options.runner,
    options.cwd,
    options.env,
    containerId,
    '{{.RestartCount}}',
    'restart count'
  );
  // `docker kill` is classified by Docker as an operator stop and suppresses
  // restart-policy recovery. Send SIGKILL to the container's host PID from a
  // short-lived host-PID helper instead, which models an actual unexpected PID
  // 1 death and lets Docker's restart manager perform the recovery under test.
  runOrFail(options.runner, options.cwd, options.env, 'docker', [
    'run',
    '--rm',
    '--privileged',
    '--pid=host',
    '--user',
    '0:0',
    '--entrypoint',
    '/bin/sh',
    options.record.image,
    '-ec',
    'kill -KILL "$1"',
    'pid1-killer',
    String(oldPid),
  ]);

  const deadline = Date.now() + 180_000;
  let newPid = oldPid;
  let restartCount = restartCountBefore;
  while (Date.now() < deadline) {
    try {
      newPid = inspectNumber(
        options.runner,
        options.cwd,
        options.env,
        containerId,
        '{{.State.Pid}}',
        'new PID'
      );
      restartCount = inspectNumber(
        options.runner,
        options.cwd,
        options.env,
        containerId,
        '{{.RestartCount}}',
        'restart count'
      );
      if (newPid > 0 && newPid !== oldPid && restartCount > restartCountBefore) {
        await waitForExternalHealth({
          record: options.record,
          fetchImpl: options.fetchImpl,
          timeoutMs: 30_000,
        });
        break;
      }
    } catch {
      // Container is briefly unavailable while Docker restarts PID 1.
    }
    await delay(1_000);
  }
  if (newPid <= 0 || newPid === oldPid || restartCount <= restartCountBefore) {
    verifyFail('Mastra did not recover with a new host PID after SIGKILL');
  }
  const actualImage = runOrFail(options.runner, options.cwd, options.env, 'docker', [
    'inspect',
    '--format',
    '{{.Config.Image}}',
    containerId,
  ]);
  if (actualImage !== options.record.image) verifyFail('Mastra image changed across restart');

  const postgresAfter = runOrFail(options.runner, options.cwd, options.env, 'docker', [
    ...prefix,
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
    `SELECT value FROM deployment_sentinels WHERE key='${sentinelKey}'`,
  ]);
  const blobAfter = runOrFail(options.runner, options.cwd, options.env, 'docker', [
    ...prefix,
    'exec',
    '-T',
    'mastra',
    '/bin/sh',
    '-ec',
    'cat "$1"',
    'sentinel-reader',
    blobPath,
  ]);
  if (postgresAfter !== postgresBefore || blobAfter !== blobBefore) {
    verifyFail('durable sentinel changed or disappeared across SIGKILL recovery');
  }
  return {
    ok: true,
    signal: 'SIGKILL',
    containerId,
    oldPid,
    newPid,
    restartCountBefore,
    restartCount,
    image: actualImage,
    imageDigest: options.record.imageDigest,
    health: 'healthy',
    sentinel: 's29-deploy-sentinel',
    postgresRows: 1,
    blobObjects: 1,
    postgresHash: hash(postgresAfter),
    blobHash: hash(blobAfter),
    deletedVolumes: 0,
  };
}

/**
 * Parse an MCP streamable-HTTP response body. The server replies with SSE framing
 * (`event: message\ndata: {...}`) whenever the request advertises
 * `Accept: text/event-stream`, which this module's discovery requests do. Plain
 * `response.json()` throws on that body — the reason mcpDiscovery never produced
 * toolInvocations > 0. Handles both framings; the JSON-RPC envelope is identical.
 */
export function parseMcpResponseEnvelope(raw: string, label: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    const dataLines = trimmed
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter((line) => line.length > 0);
    if (dataLines.length === 0) {
      verifyFail(`${label} was neither JSON nor an SSE data stream (head: ${trimmed.slice(0, 80)})`);
    }
    // Single-response discovery: the envelope is the (last) data payload.
    try {
      return JSON.parse(dataLines[dataLines.length - 1]);
    } catch (error) {
      verifyFail(
        `${label} SSE data payload failed JSON.parse: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    verifyFail(
      `${label} failed JSON.parse: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function mcpDiscovery(options: {
  record: DeploymentRecord;
  secretsPath: string;
  cwd: string;
  fetchImpl: typeof fetch;
}): Promise<Record<string, unknown>> {
  const key = getSecretValue('HOLO_KEY_MCP', { secretsPath: options.secretsPath });
  if (!key) verifyFail('HOLO_KEY_MCP is missing for registration-only discovery');
  const headers = {
    authorization: `Bearer ${key}`,
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
  };
  const initializeResponse = await options.fetchImpl(`${options.record.baseUrl}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'holocron-deploy-verifier', version: '1.0.0' },
      },
    }),
  });
  if (!initializeResponse.ok)
    verifyFail(`MCP initialize returned HTTP ${initializeResponse.status}`);
  const initialize = asObject(
    parseMcpResponseEnvelope(await initializeResponse.text(), 'MCP initialize response'),
    'MCP initialize response',
  );
  if (!initialize.result) verifyFail('MCP initialize did not return a result');

  const listResponse = await options.fetchImpl(`${options.record.baseUrl}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  });
  if (!listResponse.ok) verifyFail(`MCP tools/list returned HTTP ${listResponse.status}`);
  const list = asObject(
    parseMcpResponseEnvelope(await listResponse.text(), 'MCP tools/list response'),
    'MCP tools/list response',
  );
  const result = asObject(list.result, 'MCP tools/list result');
  if (!Array.isArray(result.tools)) verifyFail('MCP tools/list result is missing tools');

  // ── imp-mcp-schema-drift-hardening T3 — deploy-time contract proof ─———
  // READ-ONLY (no live-write smoke, no cleanup path): the deployed MCP's
  // advertised outputSchemas must match the DECLARED registry schemas this
  // verifier was built from. A stale advertised contract is exactly the
  // store_document output-schema incident's signature.
  const declaredTools = listTools();
  const expectedCount = declaredTools.length;
  if (result.tools.length !== expectedCount) {
    verifyFail(
      `MCP tools/list count must equal the registry (${expectedCount}), got ${result.tools.length}`
    );
  }
  const advertisedTools = result.tools as Array<Record<string, unknown>>;
  const advertisedIds = advertisedTools.map((tool) => String(tool.name)).sort();
  const expectedIds = declaredTools.map((tool) => tool.id).sort();
  if (JSON.stringify(advertisedIds) !== JSON.stringify(expectedIds)) {
    const missing = expectedIds.filter((id) => !advertisedIds.includes(id));
    const extra = advertisedIds.filter((id) => !expectedIds.includes(id));
    verifyFail(
      `MCP tools/list ids diverge from registry (missing=${missing.join(',')} extra=${extra.join(',')})`
    );
  }

  const verifySourceRevision = currentSourceRevision(options.cwd);
  const revisionComparable = verifySourceRevision !== null && Boolean(options.record.sourceRevision);
  const revisionsMatch =
    revisionComparable && verifySourceRevision === options.record.sourceRevision;

  const contractFindings: Array<Record<string, unknown>> = [];
  let compared = 0;
  for (const tool of advertisedTools) {
    const declared = declaredTools.find((row) => row.id === tool.name);
    if (!declared) continue; // covered by the id-set check above
    const advertisedSchema = tool.outputSchema;
    if (advertisedSchema === undefined || advertisedSchema === null) continue;
    const declaredJson = z.toJSONSchema(declared.outputSchema, { io: 'output' });
    const diffs = compareAdvertisedOutputSchema(advertisedSchema, declaredJson);
    compared += 1;
    if (diffs.length > 0) {
      contractFindings.push({
        tool: tool.name,
        diffs,
        advertised: canonicalizeJsonSchema(advertisedSchema),
        declared: canonicalizeJsonSchema(declaredJson),
      });
    }
  }

  const severity =
    contractFindings.length === 0
      ? 'none'
      : revisionsMatch || !revisionComparable
        ? 'fail'
        : 'warning';
  if (severity === 'fail') {
    verifyFail(
      `MCP advertised outputSchema diverges from declared registry schemas: ${JSON.stringify(
        contractFindings.map((finding) => ({ tool: finding.tool, diffs: finding.diffs })),
        null,
        2
      )}`
    );
  }

  return {
    ok: true,
    baseUrl: options.record.baseUrl,
    initialize: true,
    sourceRevision: options.record.sourceRevision,
    verifySourceRevision,
    sourceRevisionMatch: revisionComparable ? revisionsMatch : null,
    toolsListCount: result.tools.length,
    toolsContractProof: {
      compared,
      mismatched: contractFindings.map((finding) => finding.tool),
      severity,
      findings: contractFindings,
    },
    toolInvocations: 0,
    soakInvocations: 0,
  };
}

async function identityNegativeControls(options: {
  record: DeploymentRecord;
  liveHealth: Record<string, unknown>;
  cwd: string;
  env: NodeJS.ProcessEnv;
  runner: DeploymentRunner;
  fetchImpl: typeof fetch;
}): Promise<Record<string, unknown>> {
  const expected = expectedIdentity(options.record);
  const rejected: string[] = [];
  const attempt = async (
    label: string,
    baseUrl: string,
    attemptExpected: ExpectedDeploymentIdentity,
    verifierPid = process.pid
  ) => {
    try {
      await verifyExternalDeploymentIdentity({
        baseUrl,
        expected: attemptExpected,
        verifierPid,
        fetchImpl: options.fetchImpl,
      });
      verifyFail(`identity negative control unexpectedly accepted ${label}`);
    } catch (error) {
      if (error instanceof DeploymentIdentityError) rejected.push(label);
      else throw error;
    }
  };
  try {
    await verifyExternalDeploymentIdentity({
      baseUrl: 'http://127.0.0.1:4111',
      expected,
      fetchImpl: options.fetchImpl,
    });
    verifyFail('loopback identity was accepted');
  } catch (error) {
    if (error instanceof DeploymentIdentityError) rejected.push('loopback');
    else throw error;
  }

  const observedPid = Number(
    asObject(asObject(options.liveHealth.deployment, 'deployment').identity, 'identity').pid
  );
  if (!Number.isInteger(observedPid) || observedPid <= 0) {
    verifyFail('live identity PID is invalid for in-process negative control');
  }
  await attempt('in-process', options.record.baseUrl, expected, observedPid);
  await attempt(
    'stale',
    options.record.baseUrl,
    { ...expected, composeGeneration: 'inference1-stale00000000' },
    -1
  );
  await attempt(
    'mismatched',
    options.record.baseUrl,
    { ...expected, imageDigest: `sha256:${'0'.repeat(64)}` },
    -1
  );

  // Missing/server-independent identity controls must still cross a real
  // non-loopback socket. A disposable container serves the malformed payload;
  // the production verifier fetches it normally and must reject it. The
  // container is never accepted as a deployment and is removed in all paths.
  const malformedScript =
    "Bun.serve({hostname:'0.0.0.0',port:4120,fetch(){return Response.json({status:'ok'})}})";
  const malformedContainer = runOrFail(options.runner, options.cwd, options.env, 'docker', [
    'run',
    '--detach',
    '--rm',
    '--publish',
    '0:4120',
    '--entrypoint',
    'bun',
    options.record.image,
    '-e',
    malformedScript,
  ]);
  try {
    const portOutput = runOrFail(options.runner, options.cwd, options.env, 'docker', [
      'port',
      malformedContainer,
      '4120/tcp',
    ]);
    const portMatch = portOutput.match(/:(\d+)\s*$/m);
    const publishedPort = portMatch?.[1];
    if (!publishedPort) verifyFail('malformed identity container did not publish a port');
    const malformedEndpoint = new URL(options.record.baseUrl);
    malformedEndpoint.protocol = 'http:';
    malformedEndpoint.port = publishedPort;
    const malformedUrl = malformedEndpoint.origin;
    let reachable = false;
    for (let attemptNumber = 0; attemptNumber < 30; attemptNumber += 1) {
      try {
        const response = await options.fetchImpl(`${malformedUrl}/health`, {
          signal: AbortSignal.timeout(1_000),
        });
        if (response.status === 200) {
          reachable = true;
          break;
        }
      } catch {
        await delay(100);
      }
    }
    if (!reachable) verifyFail('malformed external identity endpoint did not become reachable');
    await attempt('missing', malformedUrl, expected, -1);
    await attempt('verifier-supplied', malformedUrl, expected, -1);
  } finally {
    options.runner('docker', ['rm', '--force', malformedContainer], {
      cwd: options.cwd,
      env: options.env,
    });
  }
  const expectedRejected = [
    'loopback',
    'in-process',
    'stale',
    'mismatched',
    'missing',
    'verifier-supplied',
  ];
  if (rejected.join(',') !== expectedRejected.join(',')) {
    verifyFail(`identity negatives incomplete: ${rejected.join(',')}`);
  }
  return { ok: true, rejected, exit: 1, landingEligible: false };
}

/**
 * One-command receipt-driven private verification (IMP-AC-14).
 * Compares receipt identity/memory/services/volumes/Serve against live state and
 * fails closed on identity or memory drift.
 */
export async function verifyPortableDeploymentReceipt(options: {
  recordPath?: string;
  releasePath?: string;
  baseUrl?: string;
  cwd?: string;
  runner?: DeploymentRunner;
  fetchImpl?: typeof fetch;
  /** When set, prove identity mismatch is rejected against this alternate digest. */
  proveIdentityMismatch?: boolean;
  /** When set, prove memory drift rejection against this alternate plan. */
  proveMemoryDrift?: boolean;
}): Promise<PortableVerifyReport> {
  const cwd = options.cwd ?? process.cwd();
  const recordPath = resolve(options.recordPath ?? defaultDeploymentRecordPath(cwd));
  const record = readDeploymentRecord(recordPath);
  if (!record.imageDigest) verifyFail('empty receipt metadata (image digest)');
  if (options.releasePath) assertRecordMatchesRelease(record, resolve(options.releasePath));
  if (options.baseUrl) {
    const normalized = options.baseUrl.replace(/\/$/, '');
    if (normalized !== record.baseUrl && normalized !== record.serveUrl) {
      verifyFail('base URL must equal the authorized receipt baseUrl or serveUrl');
    }
  }
  const runner = options.runner ?? defaultRunner;
  const fetchImpl = options.fetchImpl ?? fetch;
  const dimensions: VerificationDimension[] = [];
  const push = (name: string, ok: boolean, summary: string) => {
    dimensions.push({ name, ok, summary });
  };

  push(
    'receipt_host',
    typeof record.host === 'string' && record.host.length > 0,
    `host=${record.host}`
  );
  push(
    'receipt_loopback_port',
    record.loopbackPort === DEFAULT_LOOPBACK_PORT,
    `loopbackPort=${record.loopbackPort}`
  );
  push(
    'receipt_services',
    record.services.length === REQUIRED_SERVICES.length &&
      [...record.services].sort().join(',') === [...REQUIRED_SERVICES].sort().join(','),
    `service_count=${record.services.length}`
  );
  push(
    'receipt_volumes',
    record.durableVolumes.length === REQUIRED_VOLUME_NAMES.length &&
      [...record.durableVolumes].sort().join(',') === [...REQUIRED_VOLUME_NAMES].sort().join(','),
    `named_volume_count=${record.durableVolumes.length}`
  );
  push(
    'receipt_image_digest',
    Boolean(record.imageDigest && record.imageDigest.startsWith('sha256:')),
    record.imageDigest ? 'digest present' : 'empty image digest'
  );
  push(
    'receipt_generation',
    Boolean(record.composeGeneration),
    `generation=${record.composeGeneration || '(empty)'}`
  );
  push(
    'receipt_memory',
    Boolean(record.memoryLimitsGib),
    `memory_plan=${JSON.stringify(record.memoryLimitsGib ?? null)}`
  );

  // Live Docker service presence (read-only inspect). Exact REQUIRED_SERVICES set.
  let liveServiceCount = 0;
  const liveMemoryBytes: Record<string, number> = {};
  for (const service of REQUIRED_SERVICES) {
    const id = record.containers[service];
    if (!id) continue;
    const inspected = runner(
      'docker',
      [
        'inspect',
        '--format',
        '{{.State.Running}}|{{index .Config.Labels "com.docker.compose.service"}}|{{.HostConfig.Memory}}',
        id,
      ],
      { cwd, env: process.env }
    );
    if (inspected.status === 0) {
      const [running, observed, memoryRaw] = inspected.stdout.trim().split('|');
      if (running === 'true' && observed === service) {
        liveServiceCount += 1;
        const memoryBytes = Number(memoryRaw);
        if (Number.isFinite(memoryBytes) && memoryBytes > 0) {
          liveMemoryBytes[service] = memoryBytes;
        }
      }
    }
  }
  push(
    'live_services',
    liveServiceCount === REQUIRED_SERVICES.length,
    `live_service_count=${liveServiceCount}`
  );

  // Named durable volumes must exist on the engine (exact REQUIRED_VOLUME_NAMES set).
  const requiredVolumes = REQUIRED_VOLUME_NAMES;
  let liveVolumeCount = 0;
  for (const volumeName of requiredVolumes) {
    const vol = runner('docker', ['volume', 'inspect', '--format', '{{.Name}}', volumeName], {
      cwd,
      env: process.env,
    });
    if (vol.status === 0 && vol.stdout.trim() === volumeName) {
      liveVolumeCount += 1;
    }
  }
  const receiptVolumeOk =
    record.durableVolumes.length === REQUIRED_VOLUME_NAMES.length &&
    requiredVolumes.every((name) => record.durableVolumes.includes(name));
  push(
    'live_volumes',
    liveVolumeCount === REQUIRED_VOLUME_NAMES.length && receiptVolumeOk,
    `live_volume_count=${liveVolumeCount}; receipt_named_volume_count=${record.durableVolumes.length}`
  );

  // Private Serve status (no Funnel).
  const serveStatus = readPrivateServeStatus({
    httpsPort: record.serveHttpsPort || DEFAULT_LOOPBACK_PORT,
    runner,
    cwd,
  });
  push(
    'serve_no_funnel',
    !serveStatus.funnelEnabled && serveStatus.funnelEndpointCount === 0,
    `funnel_endpoint_count=${serveStatus.funnelEndpointCount}`
  );

  // Health against private Serve URL when possible; fall back to receipt baseUrl.
  let serveHealthStatus = 0;
  const healthUrls = [record.serveUrl, record.baseUrl].filter(
    (value, index, all) => Boolean(value) && all.indexOf(value) === index
  );
  for (const url of healthUrls) {
    try {
      const response = await fetchImpl(`${url.replace(/\/$/, '')}/health`, {
        signal: AbortSignal.timeout(10_000),
        headers: { accept: 'application/json' },
      });
      serveHealthStatus = response.status;
      if (response.status === 200) break;
    } catch {
      // try next candidate
    }
  }
  push('serve_health', serveHealthStatus === 200, `serve_health_status=${serveHealthStatus}`);

  // Identity mismatch rejection (negative control) — fail closed; never soft-pass on down health.
  let identityMismatchRejected = false;
  const wrongDigest =
    options.proveIdentityMismatch === false ? record.imageDigest : `sha256:${'0'.repeat(64)}`;
  try {
    await verifyExternalDeploymentIdentity({
      baseUrl: record.baseUrl,
      expected: {
        ...expectedIdentity(record),
        imageDigest: wrongDigest,
      },
      fetchImpl,
    });
  } catch (error) {
    if (
      error instanceof DeploymentIdentityError &&
      (error.code === 'IDENTITY_MISMATCH' || error.code === 'STALE_IDENTITY')
    ) {
      identityMismatchRejected = true;
    } else if (
      error instanceof Error &&
      /IDENTITY_MISMATCH|STALE_IDENTITY|differs from the authorized/i.test(error.message)
    ) {
      identityMismatchRejected = true;
    }
  }
  push(
    'identity_mismatch_rejected',
    identityMismatchRejected,
    `identity_mismatch_rejected=${identityMismatchRejected}`
  );

  // Memory contract: receipt plan must match live HostConfig.Memory for each service.
  // Drift rejection: a deliberately altered plan must NOT match live Docker limits.
  const receiptPlan = assertMemoryLimitPlan(record.memoryLimitsGib);
  const liveMemoryComplete =
    liveServiceCount === REQUIRED_SERVICES.length &&
    Object.keys(liveMemoryBytes).length === REQUIRED_SERVICES.length;
  const liveMemoryContractOk =
    liveMemoryComplete && liveMemoryMatchesPlan(liveMemoryBytes, receiptPlan);
  push(
    'live_memory_contract',
    liveMemoryContractOk,
    liveMemoryContractOk
      ? 'live HostConfig.Memory matches receipt.memoryLimitsGib'
      : `live memory mismatch or incomplete (services_with_memory=${Object.keys(liveMemoryBytes).length})`
  );

  // Drift within the 50 GiB budget: decrease the largest service by 1 GiB so the
  // altered plan is valid yet cannot match live HostConfig.Memory.
  const driftService = (REQUIRED_SERVICES as readonly (keyof ServiceMemoryLimits)[]).reduce(
    (best, service) => (receiptPlan[service] > receiptPlan[best] ? service : best),
    REQUIRED_SERVICES[0] as keyof ServiceMemoryLimits
  );
  const driftedLimits: ServiceMemoryLimits = { ...receiptPlan };
  if (receiptPlan[driftService] > 1) {
    driftedLimits[driftService] = receiptPlan[driftService] - 1;
  } else {
    // Tiny non-integer drift when every service is already at the floor.
    driftedLimits[driftService] = receiptPlan[driftService] + 0.25;
  }
  const driftedPlan = assertMemoryLimitPlan(driftedLimits);
  const memoryDriftRejected =
    liveMemoryComplete && !liveMemoryMatchesPlan(liveMemoryBytes, driftedPlan);
  push(
    'memory_drift_rejected',
    memoryDriftRejected,
    `memory_drift_rejected=${memoryDriftRejected}`
  );

  const credentialValueCount = countCredentialValueMatches(JSON.stringify(record));
  push(
    'receipt_no_credentials',
    credentialValueCount === 0,
    `credential_value_count=${credentialValueCount}`
  );

  const ok =
    dimensions.filter((d) => d.ok).length >= 8 &&
    liveServiceCount === REQUIRED_SERVICES.length &&
    liveVolumeCount === REQUIRED_VOLUME_NAMES.length &&
    liveMemoryContractOk &&
    serveHealthStatus === 200 &&
    identityMismatchRejected &&
    memoryDriftRejected &&
    credentialValueCount === 0;

  const report: PortableVerifyReport = {
    ok,
    verification_dimension_count: dimensions.length,
    serve_health_status: serveHealthStatus,
    identity_mismatch_rejected: identityMismatchRejected,
    memory_drift_rejected: memoryDriftRejected,
    dimensions,
    receipt: {
      host: record.host,
      loopbackPort: record.loopbackPort,
      serveUrl: record.serveUrl,
      imageDigest: record.imageDigest,
      sourceRevision: record.sourceRevision,
      composeGeneration: record.composeGeneration,
      serviceCount: record.services.length,
      namedVolumeCount: record.durableVolumes.length,
      memoryLimitsGib: record.memoryLimitsGib,
    },
    funnelEnabled: serveStatus.funnelEnabled,
    credential_value_count: credentialValueCount,
  };
  if (!ok) {
    const failed = dimensions.filter((d) => !d.ok).map((d) => d.name);
    verifyFail(`portable receipt verification failed: ${failed.join(', ') || 'unknown'}`);
  }
  atomicJson(resolve(cwd, DEPLOY_EVIDENCE_DIR, 'portable-verification.json'), report);
  return report;
}

export async function verifyProductionDeployment(
  options: VerifyProductionOptions
): Promise<VerifyProductionReport> {
  const cwd = options.cwd ?? process.cwd();
  const recordPath = resolve(options.recordPath ?? defaultDeploymentRecordPath(cwd));
  const record = readDeploymentRecord(recordPath);
  if (record.baseUrl !== options.baseUrl.replace(/\/$/, '')) {
    verifyFail('one base URL is required and must equal the authorized deployment record');
  }
  assertRecordMatchesRelease(record, resolve(options.releasePath));
  const runner = options.runner ?? defaultRunner;
  const fetchImpl = options.fetchImpl ?? fetch;
  const env = runtimeEnvironment(record);
  const accepted = await verifyExternalDeploymentIdentity({
    baseUrl: options.baseUrl,
    expected: expectedIdentity(record),
    fetchImpl,
  });
  const readiness = accepted.health;
  for (const field of ['postgres', 'fleet', 'queue', 'zeroCache', 'deployment']) {
    const probe = asObject(readiness[field], `health ${field}`);
    if (probe.ready !== true) verifyFail(`health ${field} is not ready`);
  }

  const dependency =
    (options.dependencyProbe ?? options.restartProbe)
      ? await dependencyNegativeControl({ record, cwd, env, runner, fetchImpl })
      : null;
  const negatives = options.negativeControls
    ? await identityNegativeControls({
        record,
        liveHealth: accepted.health,
        cwd,
        env,
        runner,
        fetchImpl,
      })
    : null;
  const restart = options.restartProbe
    ? await restartAndDurabilityProbe({ record, cwd, env, runner, fetchImpl })
    : null;
  const secretsPath = resolve(options.secretsPath ?? resolveSecretsPathFromEnv(process.env, cwd));
  const mcp =
    (options.mcpDiscovery ?? options.restartProbe)
      ? await mcpDiscovery({ record, secretsPath, cwd, fetchImpl })
      : null;

  const evidenceDir = resolve(cwd, DEPLOY_EVIDENCE_DIR);
  if (dependency) atomicJson(resolve(evidenceDir, 'readiness-negative.json'), dependency);
  if (negatives) atomicJson(resolve(evidenceDir, 'identity-negatives.json'), negatives);
  if (restart) atomicJson(resolve(evidenceDir, 'restart.json'), restart);
  if (mcp) atomicJson(resolve(evidenceDir, 'mcp.json'), mcp);
  const report: VerifyProductionReport = {
    ok: true,
    verifiedAt: new Date().toISOString(),
    baseUrl: record.baseUrl,
    identityClass: 'deployed-http',
    handoffVerified: true,
    release: {
      host: record.host,
      runtime: record.runtime,
      imageDigest: record.imageDigest,
      sourceRevision: record.sourceRevision,
      composeGeneration: record.composeGeneration,
    },
    readiness,
    dependency,
    identityNegatives: negatives,
    restart,
    mcp,
    cutoverActions: 0,
    toolInvocations: 0,
    soakInvocations: 0,
  };
  atomicJson(resolve(evidenceDir, 'verification.json'), report);
  return report;
}

/** Redacted second-device peer receipt (IMP-AC-5/18/19). No credentials, no raw env. */
export const CROSS_TAILNET_PEER_RECEIPT_SCHEMA = 'holo.deploy.cross-tailnet-peer-receipt.v1';
export const CROSS_TAILNET_DRILL_SCHEMA = 'holo.deploy.cross-tailnet-drill.v1';

export type CrossTailnetPeerReceipt = {
  schema: typeof CROSS_TAILNET_PEER_RECEIPT_SCHEMA;
  peer_identity_hash: string;
  target_fqdn_hash: string;
  serve_https_port: number;
  health_status: number;
  health_after_restart_status: number;
  mcp_tool_count: number;
  mcp_after_restart_tool_count: number;
  unreachable_serve_rejection_count: number;
  observed_at: string;
  compose_generation: string;
  image_digest: string;
};

export type CrossTailnetDrillEvidence = {
  schema: typeof CROSS_TAILNET_DRILL_SCHEMA;
  status: 'pass' | 'blocked' | 'failed';
  classification?: 'human_required' | 'needs_ops' | null;
  target_fqdn_hash: string;
  peer_identity_hash: string;
  image_digest: string;
  source_revision: string;
  compose_generation: string;
  started_at: string;
  completed_at: string;
  real_device_count: number;
  serve_https_port: number;
  second_device_health_status: number;
  funnel_enabled: boolean;
  funnel_endpoint_count: number;
  healthy_service_count: number;
  postgres_down_health_status: number;
  recovered_health_status: number;
  mcp_tool_count: number;
  mastra_restart_count: number;
  postgres_sentinel_rows: number;
  blob_sentinel_objects: number;
  unreachable_serve_rejection_count: number;
  wrong_identity_rejection_count: number;
  missing_dependency_rejection_count: number;
  credential_value_count: number;
  raw_environment_present: boolean;
  blocker_summary?: string;
  missing?: string[];
};

/** Stable privacy-preserving identity hash for MagicDNS names / peer IDs. */
export function hashStableIdentity(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function requireSha256Hex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    verifyFail(`${label} must be a 64-hex sha256 hash`);
  }
  return value.toLowerCase();
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    verifyFail(`${label} must be a non-empty string`);
  }
  return value;
}

/**
 * Consume a redacted peer-produced receipt from an authorized second real device.
 * Rejects mismatched target/generation/digest, wrong port, empty health/MCP, and
 * any credential-shaped content. Never inherits peer environment variables.
 */
export function verifyCrossTailnetPeerReceipt(options: {
  peerReceiptPath: string;
  expectedGeneration?: string;
  expectedDigest?: string;
  expectedTargetFqdnHash?: string;
  maxAgeMs?: number;
}): CrossTailnetPeerReceipt {
  const path = resolve(options.peerReceiptPath);
  if (!existsSync(path)) verifyFail(`peer receipt missing: ${path}`);
  const raw = readFileSync(path, 'utf8');
  if (countCredentialValueMatches(raw) > 0) {
    verifyFail('peer receipt contains credential-shaped values');
  }
  const body = asObject(JSON.parse(raw), 'peer receipt');
  if (body.schema !== CROSS_TAILNET_PEER_RECEIPT_SCHEMA) {
    verifyFail(`peer receipt schema must be ${CROSS_TAILNET_PEER_RECEIPT_SCHEMA}`);
  }
  const receipt: CrossTailnetPeerReceipt = {
    schema: CROSS_TAILNET_PEER_RECEIPT_SCHEMA,
    peer_identity_hash: requireSha256Hex(body.peer_identity_hash, 'peer_identity_hash'),
    target_fqdn_hash: requireSha256Hex(body.target_fqdn_hash, 'target_fqdn_hash'),
    serve_https_port: Number(body.serve_https_port),
    health_status: Number(body.health_status),
    health_after_restart_status: Number(body.health_after_restart_status),
    mcp_tool_count: Number(body.mcp_tool_count),
    mcp_after_restart_tool_count: Number(body.mcp_after_restart_tool_count),
    unreachable_serve_rejection_count: Number(body.unreachable_serve_rejection_count),
    observed_at: requireNonEmptyString(body.observed_at, 'observed_at'),
    compose_generation: requireNonEmptyString(body.compose_generation, 'compose_generation'),
    image_digest: requireNonEmptyString(body.image_digest, 'image_digest'),
  };
  if (receipt.serve_https_port !== DEFAULT_LOOPBACK_PORT) {
    verifyFail(`peer serve_https_port must be ${DEFAULT_LOOPBACK_PORT}`);
  }
  if (receipt.health_status !== 200 || receipt.health_after_restart_status !== 200) {
    verifyFail('peer health before/after restart must be HTTP 200');
  }
  if (receipt.mcp_tool_count !== 50 || receipt.mcp_after_restart_tool_count !== 50) {
    verifyFail('peer authenticated MCP tool count must be 44 before and after restart');
  }
  if (receipt.unreachable_serve_rejection_count !== 1) {
    verifyFail('peer unreachable Serve rejection count must be exactly 1');
  }
  if (!receipt.image_digest.startsWith('sha256:')) {
    verifyFail('peer image_digest must be a sha256 digest');
  }
  if (options.expectedGeneration && receipt.compose_generation !== options.expectedGeneration) {
    verifyFail('peer receipt compose_generation does not match the drill target');
  }
  if (options.expectedDigest && receipt.image_digest !== options.expectedDigest) {
    verifyFail('peer receipt image_digest does not match the drill target');
  }
  if (
    options.expectedTargetFqdnHash &&
    receipt.target_fqdn_hash !== options.expectedTargetFqdnHash.toLowerCase()
  ) {
    verifyFail('peer receipt target_fqdn_hash does not match the serving host');
  }
  const observedMs = Date.parse(receipt.observed_at);
  if (!Number.isFinite(observedMs)) verifyFail('peer observed_at is not a valid timestamp');
  const maxAge = options.maxAgeMs ?? 6 * 60 * 60 * 1000;
  if (Date.now() - observedMs > maxAge) verifyFail('peer receipt is older than the drill window');
  if (observedMs > Date.now() + 60_000) verifyFail('peer observed_at is in the future');
  return receipt;
}

/**
 * Seal cross-tailnet drill evidence from server-side probes + a validated peer receipt.
 * Pass only when both real devices, recovery, sentinels, MCP, Funnel=0, and three
 * negatives are proven; otherwise write a blocked/failed immutable record.
 */
export function sealCrossTailnetDrillEvidence(options: {
  peer: CrossTailnetPeerReceipt;
  server: {
    target_fqdn_hash: string;
    image_digest: string;
    source_revision: string;
    compose_generation: string;
    healthy_service_count: number;
    postgres_down_health_status: number;
    recovered_health_status: number;
    mastra_restart_count: number;
    postgres_sentinel_rows: number;
    blob_sentinel_objects: number;
    funnel_enabled: boolean;
    funnel_endpoint_count: number;
    wrong_identity_rejection_count: number;
    missing_dependency_rejection_count: number;
  };
  startedAt: string;
  completedAt?: string;
  cwd?: string;
  evidencePath?: string;
}): CrossTailnetDrillEvidence {
  const completedAt = options.completedAt ?? new Date().toISOString();
  const peer = options.peer;
  const server = options.server;
  if (peer.target_fqdn_hash !== server.target_fqdn_hash) {
    verifyFail('peer and server target_fqdn_hash must match');
  }
  if (peer.compose_generation !== server.compose_generation) {
    verifyFail('peer and server compose_generation must match');
  }
  if (peer.image_digest !== server.image_digest) {
    verifyFail('peer and server image_digest must match');
  }

  const pass =
    server.healthy_service_count === REQUIRED_SERVICES.length &&
    server.postgres_down_health_status === 503 &&
    server.recovered_health_status === 200 &&
    peer.health_status === 200 &&
    peer.health_after_restart_status === 200 &&
    peer.mcp_tool_count === 50 &&
    peer.mcp_after_restart_tool_count === 50 &&
    server.mastra_restart_count >= 1 &&
    server.postgres_sentinel_rows === 1 &&
    server.blob_sentinel_objects === 1 &&
    server.funnel_enabled === false &&
    server.funnel_endpoint_count === 0 &&
    peer.unreachable_serve_rejection_count === 1 &&
    server.wrong_identity_rejection_count === 1 &&
    server.missing_dependency_rejection_count === 1;

  const evidence: CrossTailnetDrillEvidence = {
    schema: CROSS_TAILNET_DRILL_SCHEMA,
    status: pass ? 'pass' : 'failed',
    classification: null,
    target_fqdn_hash: server.target_fqdn_hash,
    peer_identity_hash: peer.peer_identity_hash,
    image_digest: server.image_digest,
    source_revision: server.source_revision,
    compose_generation: server.compose_generation,
    started_at: options.startedAt,
    completed_at: completedAt,
    real_device_count: 2,
    serve_https_port: DEFAULT_LOOPBACK_PORT,
    second_device_health_status: peer.health_status,
    funnel_enabled: server.funnel_enabled,
    funnel_endpoint_count: server.funnel_endpoint_count,
    healthy_service_count: server.healthy_service_count,
    postgres_down_health_status: server.postgres_down_health_status,
    recovered_health_status: server.recovered_health_status,
    mcp_tool_count: peer.mcp_tool_count,
    mastra_restart_count: server.mastra_restart_count,
    postgres_sentinel_rows: server.postgres_sentinel_rows,
    blob_sentinel_objects: server.blob_sentinel_objects,
    unreachable_serve_rejection_count: peer.unreachable_serve_rejection_count,
    wrong_identity_rejection_count: server.wrong_identity_rejection_count,
    missing_dependency_rejection_count: server.missing_dependency_rejection_count,
    credential_value_count: 0,
    raw_environment_present: false,
  };

  const serialized = JSON.stringify(evidence);
  const credentialHits = countCredentialValueMatches(serialized);
  evidence.credential_value_count = credentialHits;
  if (credentialHits > 0) {
    evidence.status = 'failed';
    verifyFail('cross-tailnet evidence contains credential-shaped values');
  }

  const out =
    options.evidencePath ??
    resolve(
      options.cwd ?? process.cwd(),
      '.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json'
    );
  atomicJson(out, evidence);
  return evidence;
}
