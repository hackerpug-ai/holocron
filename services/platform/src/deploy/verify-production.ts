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
  DEPLOY_EVIDENCE_DIR,
  type DeploymentProcessResult,
  type DeploymentRecord,
  type DeploymentRunner,
  defaultDeploymentRecordPath,
  defaultRuntimeSecretsPath,
  readDeployableRelease,
  readDeploymentRecord,
} from './production-deploy.ts';

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
  runner?: DeploymentRunner;
  fetchImpl?: typeof fetch;
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
    host: 'inference1';
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
    HOLO_BLOB_VOLUME: 'holocron-blobs',
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

function runOrFail(
  runner: DeploymentRunner,
  cwd: string,
  env: NodeJS.ProcessEnv,
  command: string,
  args: string[]
): string {
  const result: DeploymentProcessResult = runner(command, args, { cwd, env });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    verifyFail(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout.trim();
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
  if (record.services.join(',') !== 'postgres,mastra,scheduler,zero-cache') {
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
    runOrFail(options.runner, options.cwd, options.env, 'docker', [...prefix, 'start', 'postgres']);
    runOrFail(options.runner, options.cwd, options.env, 'docker', [
      ...prefix,
      'up',
      '-d',
      '--wait',
      '--wait-timeout',
      '240',
    ]);
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

async function mcpDiscovery(options: {
  record: DeploymentRecord;
  secretsPath: string;
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
  const initialize = asObject(await initializeResponse.json(), 'MCP initialize response');
  if (!initialize.result) verifyFail('MCP initialize did not return a result');

  const listResponse = await options.fetchImpl(`${options.record.baseUrl}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  });
  if (!listResponse.ok) verifyFail(`MCP tools/list returned HTTP ${listResponse.status}`);
  const list = asObject(await listResponse.json(), 'MCP tools/list response');
  const result = asObject(list.result, 'MCP tools/list result');
  if (!Array.isArray(result.tools)) verifyFail('MCP tools/list result is missing tools');
  if (result.tools.length !== 44)
    verifyFail(`MCP tools/list count must be 44, got ${result.tools.length}`);
  return {
    ok: true,
    baseUrl: options.record.baseUrl,
    initialize: true,
    toolsListCount: result.tools.length,
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
      ? await mcpDiscovery({ record, secretsPath, fetchImpl })
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
