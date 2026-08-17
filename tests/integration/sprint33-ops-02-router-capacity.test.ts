/**
 * S33-OPS-02 real-service integration contract.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     tests/integration/sprint33-ops-02-router-capacity.test.ts
 *
 * The verifier owns all HTTP/SSH assertions. This suite deliberately invokes
 * it as a real child process and independently reads its persisted artifacts;
 * fetch, SSH, filesystem, LiteLLM, and oMLX remain un-substituted boundaries.
 */
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(import.meta.dirname, '../..');
const VERIFIER = resolve(REPO_ROOT, 'scripts/verify-s33-router-capacity.sh');
const EVIDENCE_ROOT = resolve(REPO_ROOT, '.tmp/S33-OPS-02');
const ROUTER_URL = 'http://holocron.tail011a51.ts.net:4545';
const HEALTH_URL = 'https://holocron.tail011a51.ts.net:44111/health';
const HOLOCRON_HOST = 'holocron';
const REMOTE_COMPOSE_FILE =
  '/Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml';
const REMOTE_DOCKER_BIN = '/usr/local/bin/docker';
const INFERENCE1 = 'inference1';
const INFERENCE2 = 'inference2';
const EXPECTED_BASES = [
  'http://inference1.tail011a51.ts.net:8003/v1',
  'http://inference2.tail011a51.ts.net:8003/v1',
];
const REVIEWER_BASE = 'http://inference2.tail011a51.ts.net:8003/v1';
const IMPLEMENTER_MODEL = 'Qwen3.6-35B-A3B-MLX-8bit';
type Artifact = {
  path: string;
  exists: boolean;
  byte_length: number;
};

type VerifierResult = {
  ok: boolean;
  mode: string;
  [key: string]: unknown;
};

type VerifierRun = {
  result: VerifierResult;
  stdoutPath: string;
  stderrPath: string;
};

function artifactPath(artifact: Artifact, expectedRunDir?: string): string {
  const path = resolve(REPO_ROOT, artifact.path);
  if (path !== EVIDENCE_ROOT && !path.startsWith(`${EVIDENCE_ROOT}/`)) {
    throw new Error(`artifact path is outside approved evidence root: ${artifact.path}`);
  }
  const info = lstatSync(path);
  if (info.isSymbolicLink()) {
    throw new Error(`artifact path is a symlink: ${artifact.path}`);
  }
  const canonical = realpathSync(path);
  if (
    canonical !== EVIDENCE_ROOT &&
    !canonical.startsWith(`${EVIDENCE_ROOT}/`)
  ) {
    throw new Error(
      `artifact path physically escapes approved evidence root: ${artifact.path}`
    );
  }
  if (expectedRunDir) {
    const canonicalRunDir = realpathSync(expectedRunDir);
    if (
      canonical !== canonicalRunDir &&
      !canonical.startsWith(`${canonicalRunDir}/`)
    ) {
      throw new Error(
        `artifact path is outside emitted run directory: ${artifact.path}`
      );
    }
    if (!info.isFile()) {
      throw new Error(`artifact path is not a regular file: ${artifact.path}`);
    }
  }
  return path;
}

function manifestArtifact(result: VerifierResult, name: string): Artifact {
  const manifest = result.artifact_manifest;
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('verifier result has no artifact manifest');
  }
  const artifact = (manifest as Record<string, unknown>)[name];
  if (!artifact || typeof artifact !== 'object') {
    throw new Error(`verifier result is missing artifact ${name}`);
  }
  return artifact as Artifact;
}

async function assertResultArtifacts(
  result: VerifierResult,
  runDir: string
): Promise<void> {
  const manifest = result.artifact_manifest;
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('verifier result has no artifact manifest');
  }
  for (const [name, value] of Object.entries(
    manifest as Record<string, unknown>
  )) {
    if (!value || typeof value !== 'object')
      throw new Error(`artifact ${name} is malformed`);
    const artifact = value as Partial<Artifact>;
    if (artifact.exists !== true || typeof artifact.path !== 'string') {
      throw new Error(`artifact ${name} is not a real manifest file`);
    }
    const path = artifactPath(artifact as Artifact, runDir);
    const info = lstatSync(path);
    expect(info.isFile(), `${name} is a regular file`).toBe(true);
    expect(info.isSymbolicLink(), `${name} is not a symlink`).toBe(false);
    expect(typeof artifact.byte_length, `${name} byte_length type`).toBe(
      'number'
    );
    expect(
      Number.isInteger(artifact.byte_length),
      `${name} byte_length integer`
    ).toBe(true);
    expect(
      artifact.byte_length,
      `${name} byte_length positive`
    ).toBeGreaterThan(0);
    expect(info.size, `${name} byte_length exact`).toBe(artifact.byte_length);
  }
}

function emittedRunDir(result: VerifierResult, evidenceBase?: string): string {
  expect(typeof result.run_id, 'verifier run_id').toBe('string');
  expect((result.run_id as string).length, 'verifier run_id nonempty').toBeGreaterThan(0);
  expect(typeof result.run_dir, 'verifier run_dir').toBe('string');
  const runDir = artifactPath({
    path: result.run_dir as string,
    exists: true,
    byte_length: 1,
  });
  const info = lstatSync(runDir);
  expect(info.isDirectory(), 'emitted run directory').toBe(true);
  expect(info.isSymbolicLink(), 'emitted run directory is not a symlink').toBe(
    false
  );
  if (evidenceBase) {
    const expectedRunDir = resolve(
      REPO_ROOT,
      evidenceBase,
      'runs',
      result.run_id as string
    );
    expect(runDir, 'emitted run directory is exact stdout-selected path').toBe(
      expectedRunDir
    );
  }
  return runDir;
}

function headerValue(rawHeaders: string, headerName: string): string | undefined {
  for (const line of rawHeaders.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    if (line.slice(0, separator).trim().toLowerCase() === headerName.toLowerCase()) {
      return line.slice(separator + 1).trim();
    }
  }
  return undefined;
}

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${String(error)}`);
  }
}

function assertGeneratedContent(value: unknown, label: string): void {
  if (!value || typeof value !== 'object') throw new Error(`${label} is not an object`);
  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) throw new Error(`${label} has no choices`);
  const message =
    choices[0] && typeof choices[0] === 'object'
      ? (choices[0] as { message?: unknown }).message
      : undefined;
  const content =
    message && typeof message === 'object' ? (message as { content?: unknown }).content : undefined;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error(`${label} has empty generated content`);
  }
}

async function assertNonEmptyArtifact(artifact: Artifact, label: string): Promise<void> {
  expect(artifact.exists, `${label} exists`).toBe(true);
  expect(artifact.byte_length, `${label} byte length`).toBeGreaterThan(0);
  const info = await stat(artifactPath(artifact));
  expect(info.isFile(), `${label} is a regular file`).toBe(true);
  expect(info.size, `${label} live byte length`).toBeGreaterThan(0);
  expect(info.size, `${label} manifest byte length`).toBe(artifact.byte_length);
}

async function assertCaptureReceipt(
  artifact: Artifact,
  runDir: string,
  label: string
): Promise<void> {
  const receipt = parseJson(
    await readFile(artifactPath(artifact, runDir), 'utf8'),
    `${label} receipt`
  );
  if (!receipt || typeof receipt !== 'object') {
    throw new Error(`${label} receipt is not an object`);
  }
  const value = receipt as Record<string, unknown>;
  expect(typeof value.kind, `${label} kind`).toBe('string');
  expect(value.exists, `${label} raw exists`).toBe(true);
  expect(typeof value.raw_path, `${label} raw path`).toBe('string');
  expect(typeof value.byte_length, `${label} raw byte length`).toBe('number');
  expect(
    Number.isInteger(value.byte_length),
    `${label} raw byte length integer`
  ).toBe(true);
  expect(typeof value.sha256, `${label} raw SHA-256`).toBe('string');
  const rawPath = artifactPath(
    {
      path: value.raw_path as string,
      exists: true,
      byte_length: value.byte_length as number,
    },
    runDir
  );
  const rawInfo = lstatSync(rawPath);
  expect(rawInfo.isFile(), `${label} raw is a regular file`).toBe(true);
  expect(rawInfo.isSymbolicLink(), `${label} raw is not a symlink`).toBe(false);
  expect(rawInfo.size, `${label} raw byte length`).toBe(value.byte_length);
  expect(
    createHash('sha256')
      .update(await readFile(rawPath))
      .digest('hex'),
    `${label} raw SHA-256`
  ).toBe(value.sha256);
}

type LogIdentity = {
  host: string;
  device: number;
  inode: number;
  byte_size: number;
};

function assertLogIdentity(value: unknown, label: string, expectedHost: string): LogIdentity {
  if (!value || typeof value !== 'object') throw new Error(`${label} is not an object`);
  const identity = value as Partial<LogIdentity>;
  expect(identity.host, `${label} host`).toBe(expectedHost);
  for (const field of ['device', 'inode', 'byte_size'] as const) {
    expect(typeof identity[field], `${label} ${field} type`).toBe('number');
    expect(Number.isInteger(identity[field]), `${label} ${field} integer`).toBe(true);
    expect(identity[field], `${label} ${field} nonnegative`).toBeGreaterThanOrEqual(0);
  }
  expect(identity.byte_size, `${label} nonempty`).toBeGreaterThan(0);
  return identity as LogIdentity;
}

type DeploymentIdentity = {
  host: string;
  runtime: string;
  imageDigest: string;
  sourceRevision: string;
  composeGeneration: string;
  pid: number;
  uptimeMs: number;
};

function deploymentIdentity(value: unknown, label: string): DeploymentIdentity {
  if (!value || typeof value !== 'object') throw new Error(`${label} is not an object`);
  const deployment = (value as { deployment?: unknown }).deployment;
  if (!deployment || typeof deployment !== 'object') {
    throw new Error(`${label} deployment is missing`);
  }
  const identity = (deployment as { identity?: unknown }).identity;
  if (!identity || typeof identity !== 'object') {
    throw new Error(`${label} deployment identity is missing`);
  }
  const candidate = identity as Partial<DeploymentIdentity>;
  for (const field of [
    'host',
    'runtime',
    'imageDigest',
    'sourceRevision',
    'composeGeneration',
  ] as const) {
    expect(typeof candidate[field], `${label} ${field} type`).toBe('string');
    expect(candidate[field], `${label} ${field} nonempty`).not.toBe('');
  }
  expect(Number.isInteger(candidate.pid), `${label} pid integer`).toBe(true);
  expect(candidate.pid, `${label} pid positive`).toBeGreaterThan(0);
  expect(typeof candidate.uptimeMs, `${label} uptimeMs type`).toBe('number');
  expect(candidate.uptimeMs, `${label} uptimeMs nonnegative`).toBeGreaterThanOrEqual(0);
  return candidate as DeploymentIdentity;
}

function modelIds(value: unknown): string[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { data?: unknown }).data)) {
    throw new Error('models artifact does not contain a data array');
  }
  const ids = (value as { data: unknown[] }).data.map((entry) => {
    if (!entry || typeof entry !== 'object' || typeof (entry as { id?: unknown }).id !== 'string') {
      throw new Error('models artifact contains a malformed model entry');
    }
    return (entry as { id: string }).id;
  });
  expect(ids).toContain('implementer');
  expect(ids).toContain('reviewer');
  return ids;
}

async function runVerifier(
  mode: 'models-reviewer' | 'implementer-distribution',
  evidenceName: string
): Promise<VerifierRun> {
  const evidenceDir = `.tmp/S33-OPS-02/${evidenceName}`;
  const outputBase = resolve(REPO_ROOT, evidenceDir);
  await assertCleanEvidenceBase(outputBase);
  const beforeBase = await snapshotBaseLevelArtifacts(outputBase);
  const beforeRuns = await snapshotRunNames(outputBase);
  const args = [
    VERIFIER,
    '--mode',
    mode,
    '--router-url',
    ROUTER_URL,
    '--inference1-host',
    INFERENCE1,
    '--evidence-dir',
    evidenceDir,
  ];
  if (mode === 'models-reviewer') {
    args.push('--health-url', HEALTH_URL);
  } else {
    args.push('--inference2-host', INFERENCE2, '--request-count', '6');
  }
  const childEnv = { ...process.env, PLATFORM_IT: '1' };
  const { stdout, stderr } = await execFileAsync('bash', args, {
    cwd: REPO_ROOT,
    env: childEnv,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: 360_000,
  });
  const result = JSON.parse(stdout) as VerifierResult;
  expect(result.ok, `${mode} result`).toBe(true);
  expect(result.mode, `${mode} result mode`).toBe(mode);
  const outputDir = emittedRunDir(result, evidenceDir);
  await assertResultArtifacts(result, outputDir);
  await assertOnlySelectedRunWasAdded(outputBase, beforeBase, beforeRuns, result.run_id as string);
  const stdoutPath = resolve(outputDir, 'verifier.stdout.json');
  const stderrPath = resolve(outputDir, 'verifier.stderr.log');
  await writeFile(stdoutPath, stdout, 'utf8');
  await writeFile(stderrPath, stderr, 'utf8');
  return { result, stdoutPath, stderrPath };
}

async function runVerifierFailure(
  mode: 'models-reviewer' | 'implementer-distribution',
  evidenceName: string,
  overrides: {
    evidenceDir?: string;
    routerUrl?: string;
    healthUrl?: string;
    inference1?: string;
    remoteLogPath?: string;
  } = {}
): Promise<string> {
  const captureId = randomUUID();
  const evidenceDir =
    overrides.evidenceDir ?? `.tmp/S33-OPS-02/negative-captures/${evidenceName}/${captureId}`;
  const outputDir = resolve(
    REPO_ROOT,
    `.tmp/S33-OPS-02/negative-captures/${evidenceName}/${captureId}-capture`
  );
  await mkdir(outputDir, { recursive: true });
  const args = [
    VERIFIER,
    '--mode',
    mode,
    '--router-url',
    overrides.routerUrl ?? 'http://127.0.0.1:1',
    '--inference1-host',
    overrides.inference1 ?? INFERENCE1,
    '--evidence-dir',
    evidenceDir,
  ];
  if (mode === 'models-reviewer') {
    args.push('--health-url', overrides.healthUrl ?? 'http://127.0.0.1:1/health');
  } else {
    args.push('--inference2-host', INFERENCE2, '--request-count', '6');
  }
  if (overrides.remoteLogPath) args.push('--remote-log-path', overrides.remoteLogPath);
  try {
    await execFileAsync('bash', args, {
      cwd: REPO_ROOT,
      env: { ...process.env, PLATFORM_IT: '1' },
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      timeout: 120_000,
    });
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string };
    await writeFile(resolve(outputDir, 'verifier.stdout.log'), result.stdout ?? '', 'utf8');
    await writeFile(resolve(outputDir, 'verifier.stderr.log'), result.stderr ?? '', 'utf8');
    return result.stderr ?? '';
  }
  throw new Error(`${mode} unexpectedly succeeded in a negative control`);
}

async function runHealthFlip(
  negative = false
): Promise<{ stdout: string; stderr: string; result?: VerifierResult }> {
  const evidenceName = negative ? 'health-flip-negative' : 'health-flip';
  const outputBase = resolve(REPO_ROOT, `.tmp/S33-OPS-02/${evidenceName}`);
  await assertCleanEvidenceBase(outputBase);
  const beforeBase = await snapshotBaseLevelArtifacts(outputBase);
  const beforeRuns = await snapshotRunNames(outputBase);
  const args = [
    VERIFIER,
    '--mode',
    'health-flip',
    '--holocron-host',
    HOLOCRON_HOST,
    '--remote-compose-file',
    REMOTE_COMPOSE_FILE,
    '--remote-docker-bin',
    REMOTE_DOCKER_BIN,
    '--router-url',
    ROUTER_URL,
    '--health-url',
    HEALTH_URL,
  ];
  if (negative) args.push('--negative-control', 'fail-after-stop');
  args.push('--evidence-dir', '.tmp/S33-OPS-02/' + evidenceName);
  try {
    const { stdout, stderr } = await execFileAsync('bash', args, {
      cwd: REPO_ROOT,
      env: { ...process.env, PLATFORM_IT: '1' },
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      timeout: 240_000,
    });
    const result = JSON.parse(stdout) as VerifierResult;
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('health-flip');
    const outputDir = emittedRunDir(result, `.tmp/S33-OPS-02/${evidenceName}`);
    await assertResultArtifacts(result, outputDir);
    await assertOnlySelectedRunWasAdded(
      outputBase,
      beforeBase,
      beforeRuns,
      result.run_id as string
    );
    await writeFile(resolve(outputDir, 'verifier.stdout.txt'), stdout, 'utf8');
    await writeFile(resolve(outputDir, 'verifier.stderr.txt'), stderr, 'utf8');
    return { stdout, stderr, result };
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string };
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    if (!negative) throw error;
    const failure = JSON.parse(stdout) as VerifierResult;
    expect(failure.ok).toBe(false);
    expect(failure.mode).toBe('health-flip');
    const outputDir = emittedRunDir(failure, `.tmp/S33-OPS-02/${evidenceName}`);
    await assertResultArtifacts(failure, outputDir);
    await assertOnlySelectedRunWasAdded(
      outputBase,
      beforeBase,
      beforeRuns,
      failure.run_id as string
    );
    await writeFile(resolve(outputDir, 'verifier.stdout.txt'), stdout, 'utf8');
    await writeFile(resolve(outputDir, 'verifier.stderr.txt'), stderr, 'utf8');
    return { stdout, stderr, result: failure };
  }
}

async function snapshotTree(root: string): Promise<string> {
  const entries: string[] = [];
  async function visit(current: string, relative: string): Promise<void> {
    const children = await readdir(current, { withFileTypes: true });
    for (const child of children) {
      const childRelative = relative ? `${relative}/${child.name}` : child.name;
      const childPath = resolve(current, child.name);
      const info = await lstat(childPath);
      let detail: string;
      if (info.isSymbolicLink()) {
        detail = `symlink|${await readlink(childPath)}`;
      } else if (info.isDirectory()) {
        detail = 'directory';
      } else {
        detail = `file|${createHash('sha256')
          .update(await readFile(childPath))
          .digest('hex')}`;
      }
      entries.push(`${childRelative}|${detail}`);
      if (info.isDirectory()) await visit(childPath, childRelative);
    }
  }
  await visit(root, '');
  return entries.sort().join('\n');
}

async function snapshotBaseLevelArtifacts(root: string): Promise<string> {
  let children: import('node:fs').Dirent[] = [];
  try {
    children = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return '<base-missing>';
    throw error;
  }
  const entries: string[] = [];
  for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
    if (child.name === 'runs') continue;
    const childPath = resolve(root, child.name);
    const info = await lstat(childPath);
    const detail = info.isDirectory()
      ? await snapshotTree(childPath)
      : info.isSymbolicLink()
        ? `symlink|${await readlink(childPath)}`
        : `file|${createHash('sha256')
            .update(await readFile(childPath))
            .digest('hex')}`;
    entries.push(`${child.name}|${detail}`);
  }
  return entries.join('\n');
}

async function snapshotRunNames(root: string): Promise<string[]> {
  try {
    const children = await readdir(resolve(root, 'runs'), { withFileTypes: true ,
    });
    return children
      .map(
        (child) =>
          `${child.name}|${child.isDirectory() ? 'directory' : child.isSymbolicLink() ? 'symlink' : 'file'}`
      )
      .sort();
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return [];
    throw error;
  }
}

async function assertOnlySelectedRunWasAdded(
  root: string,
  beforeBase: string,
  beforeRuns: string[],
  runId: string
): Promise<void> {
  expect(await snapshotBaseLevelArtifacts(root), 'base-level artifacts unchanged').toBe(beforeBase);
  await assertCleanEvidenceBase(root);
  expect(await snapshotRunNames(root), 'only selected immutable run added').toEqual(
    [...beforeRuns, `${runId}|directory`].sort()
  );
  const info = await lstat(resolve(root, 'runs', runId));
  expect(info.isDirectory(), 'selected run is a directory').toBe(true);
  expect(info.isSymbolicLink(), 'selected run is not a symlink').toBe(false);
}

async function assertCleanEvidenceBase(root: string): Promise<void> {
  let children: import('node:fs').Dirent[];
  try {
    children = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return;
    throw error;
  }
  expect(
    children
      .map(
        (child) =>
          `${child.name}|${child.isDirectory() ? 'directory' : child.isSymbolicLink() ? 'symlink' : 'file'}`
      )
      .sort(),
    'evidence base must be missing or contain only a real runs directory'
  ).toEqual(['runs|directory']);
  const info = await lstat(resolve(root, 'runs'));
  expect(info.isDirectory(), 'evidence runs directory').toBe(true);
  expect(
    info.isSymbolicLink(),
    'evidence runs directory is not a symlink'
  ).toBe(false);
}

async function runHealthFlipContractFailure(
  overrides: Partial<Record<'holocronHost' | 'remoteDockerBin' | 'evidenceDir', string>>
): Promise<string> {
  const args = [
    VERIFIER,
    '--mode',
    'health-flip',
    '--holocron-host',
    overrides.holocronHost ?? HOLOCRON_HOST,
    '--remote-compose-file',
    REMOTE_COMPOSE_FILE,
    '--remote-docker-bin',
    overrides.remoteDockerBin ?? REMOTE_DOCKER_BIN,
    '--router-url',
    ROUTER_URL,
    '--health-url',
    HEALTH_URL,
    '--evidence-dir',
    overrides.evidenceDir ?? '.tmp/S33-OPS-02/health-flip',
  ];
  try {
    await execFileAsync('bash', args, {
      cwd: REPO_ROOT,
      env: { ...process.env, PLATFORM_IT: '1' },
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    });
  } catch (error) {
    return (error as { stderr?: string }).stderr ?? '';
  }
  throw new Error('health-flip contract control unexpectedly succeeded');
}

async function readRawHealth(runDir: string, name: string): Promise<Record<string, unknown>> {
  const raw = await readFile(resolve(runDir, name), 'utf8');
  return parseJson(raw, `${runDir}/${name}`) as Record<string, unknown>;
}

function assertHealthTriplet(
  pre: Record<string, unknown>,
  degraded: Record<string, unknown>,
  restored: Record<string, unknown>
): DeploymentIdentity[] {
  const states: Array<[Record<string, unknown>, string, boolean, string | null]> = [
    [pre, 'ok', true, null],
    [degraded, 'degraded', false, 'fleet'],
    [restored, 'ok', true, null],
  ];
  const identities = states.map(([health, status, ready, failing], index) => {
    expect(health.status, 'health ' + index + ' status').toBe(status);
    const fleet = health.fleet as { ready?: unknown } | undefined;
    expect(fleet?.ready, 'health ' + index + ' fleet.ready').toBe(ready);
    expect(Object.hasOwn(health, 'failing_dependency')).toBe(true);
    expect(health.failing_dependency, 'health ' + index + ' failing_dependency').toBe(failing);
    const identity = deploymentIdentity(health, 'health ' + index);
    expect(Number.isFinite(identity.uptimeMs), 'health ' + index + ' uptimeMs finite').toBe(true);
    return identity;
  });
  for (const field of [
    'host',
    'runtime',
    'imageDigest',
    'sourceRevision',
    'composeGeneration',
    'pid',
  ] as const) {
    expect(identities[1][field], 'health ' + field + ' stable').toBe(identities[0][field]);
    expect(identities[2][field], 'health ' + field + ' stable').toBe(identities[0][field]);
  }
  expect(identities[1].uptimeMs).toBeGreaterThanOrEqual(identities[0].uptimeMs);
  expect(identities[2].uptimeMs).toBeGreaterThanOrEqual(identities[1].uptimeMs);
  return identities;
}

type ProductionIdentity = {
  id: string;
  image: string;
  startedAt: string;
};

function productionIdentities(value: unknown, label: string): Record<string, ProductionIdentity> {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error(label + ' must contain exactly four Docker inspect records');
  }
  const expected = new Set(['postgres', 'mastra', 'scheduler', 'zero-cache']);
  const result: Record<string, ProductionIdentity> = {};
  for (const record of value) {
    if (!record || typeof record !== 'object') throw new Error(label + ' has a malformed record');
    const item = record as {
      Id?: unknown;
      Image?: unknown;
      State?: { StartedAt?: unknown };
      Config?: { Labels?: Record<string, unknown> };
    };
    const service = item.Config?.Labels?.['com.docker.compose.service'];
    if (typeof service !== 'string' || !expected.has(service) || result[service]) {
      throw new Error(label + ' has an invalid service identity');
    }
    expect(typeof item.Id, label + ' ' + service + ' id').toBe('string');
    expect(typeof item.Image, label + ' ' + service + ' image').toBe('string');
    expect(typeof item.State?.StartedAt, label + ' ' + service + ' startedAt').toBe('string');
    result[service] = {
      id: item.Id as string,
      image: item.Image as string,
      startedAt: item.State?.StartedAt as string,
    };
  }
  expect(new Set(Object.keys(result))).toEqual(expected);
  return result;
}

function primarySentinel(value: unknown, label: string): Record<string, string> {
  if (!value || typeof value !== 'object') throw new Error(label + ' is malformed');
  const result = value as Record<string, unknown>;
  expect(Object.keys(result).sort(), label + ' exact keys').toEqual([
    'head',
    'status_sha256',
    'tracked_hash',
  ]);
  for (const key of ['head', 'status_sha256', 'tracked_hash']) {
    expect(typeof result[key], label + ' ' + key + ' type').toBe('string');
    expect(result[key], label + ' ' + key + ' nonempty').not.toBe('');
  }
  return result as Record<string, string>;
}

async function independentlyVerifyHealthFlip(runDir: string): Promise<void> {
  const pre = await readRawHealth(runDir, 'health.pre.json');
  const degraded = await readRawHealth(runDir, 'health.degraded.json');
  const restored = await readRawHealth(runDir, 'health.restored.json');
  assertHealthTriplet(pre, degraded, restored);
  const root = runDir;
  const productionPre = productionIdentities(
    parseJson(
      await readFile(resolve(root, 'production-containers.pre.json'), 'utf8'),
      'production pre'
    ),
    'production pre'
  );
  const productionPost = productionIdentities(
    parseJson(
      await readFile(resolve(root, 'production-containers.post.json'), 'utf8'),
      'production post'
    ),
    'production post'
  );
  expect(productionPost).toEqual(productionPre);
  const primaryPre = primarySentinel(
    parseJson(await readFile(resolve(root, 'remote-primary.pre.json'), 'utf8'), 'primary pre'),
    'primary pre'
  );
  const primaryPost = primarySentinel(
    parseJson(await readFile(resolve(root, 'remote-primary.post.json'), 'utf8'), 'primary post'),
    'primary post'
  );
  expect(primaryPost).toEqual(primaryPre);
}

async function independentlyProbeRestoredState(): Promise<void> {
  const health = await execFileAsync(
    'curl',
    [
      '--fail',
      '--silent',
      '--show-error',
      '--connect-timeout',
      '5',
      '--max-time',
      '20',
      HEALTH_URL,
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 }
  );
  const parsed = parseJson(health.stdout, 'independent restored health');
  expect((parsed as { status?: string }).status).toBe('ok');
  expect((parsed as { fleet?: { ready?: boolean } }).fleet?.ready).toBe(true);
  expect((parsed as { failing_dependency?: unknown }).failing_dependency).toBeNull();
  const command =
    REMOTE_DOCKER_BIN +
    ' inspect "$(' +
    REMOTE_DOCKER_BIN +
    ' compose -f ' +
    REMOTE_COMPOSE_FILE +
    ' ps -q litellm-router)"';
  const router = await execFileAsync(
    'ssh',
    [
      '-o',
      'BatchMode=yes',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'ConnectTimeout=10',
      '-o',
      'ServerAliveInterval=5',
      '-o',
      'ServerAliveCountMax=2',
      HOLOCRON_HOST,
      command,
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 }
  );
  const records = parseJson(router.stdout, 'independent restored router');
  expect(Array.isArray(records)).toBe(true);
  expect(records).toHaveLength(1);
  const record = (
    records as Array<{ State?: { Status?: string; Health?: { Status?: string } } ;
    }>
  )[0];
  expect(record.State?.Status).toBe('running');
  expect(record.State?.Health?.Status).toBe('healthy');
}

type RemoteMutationSentinel = {
  health: DeploymentIdentity;
  routerId: string;
  routerStatus: string;
  routerHealth: string;
  primary: Record<string, string>;
};

async function captureRemoteMutationSentinel(): Promise<RemoteMutationSentinel> {
  const health = await execFileAsync(
    'curl',
    [
      '--fail',
      '--silent',
      '--show-error',
      '--connect-timeout',
      '5',
      '--max-time',
      '20',
      HEALTH_URL,
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 30_000 ,
    }
  );
  const healthValue = parseJson(health.stdout, 'remote mutation health sentinel');
  const identity = deploymentIdentity(healthValue, 'remote mutation health sentinel');
  const sshOptions = [
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'ConnectTimeout=10',
    '-o',
    'ServerAliveInterval=5',
    '-o',
    'ServerAliveCountMax=2',
  ];
  const routerCommand =
    'set -eu; D=/usr/local/bin/docker; C=' +
    REMOTE_COMPOSE_FILE +
    '; ids=$("$D" compose -f "$C" ps -q litellm-router); set -- $ids; test $# -eq 1; test -n "$1"; "$D" inspect "$1"';
  const router = await execFileAsync('ssh', [...sshOptions, HOLOCRON_HOST, routerCommand], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: 30_000,
  });
  const records = parseJson(router.stdout, 'remote mutation router sentinel');
  expect(Array.isArray(records)).toBe(true);
  expect(records).toHaveLength(1);
  const record = records as Array<{
    Id?: unknown;
    State?: { Status?: unknown; Health?: { Status?: unknown } };
  }>;
  expect(typeof record[0].Id).toBe('string');
  expect(typeof record[0].State?.Status).toBe('string');
  expect(typeof record[0].State?.Health?.Status).toBe('string');
  const primaryCommand =
    'set -eu; P=/Users/holocron/Projects/holocron; head=$(git -C "$P" rev-parse HEAD); status_sha256=$(git -C "$P" status --porcelain=v1 | shasum -a 256 | awk \'{print $1}\'); tracked_hash=$(git -C "$P" ls-files -s | shasum -a 256 | awk \'{print $1}\'); printf \'{"head":"%s","status_sha256":"%s","tracked_hash":"%s"}\\n\' "$head" "$status_sha256" "$tracked_hash"';
  const primary = await execFileAsync('ssh', [...sshOptions, HOLOCRON_HOST, primaryCommand], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  });
  const primaryValue = primarySentinel(
    parseJson(primary.stdout, 'remote mutation primary sentinel'),
    'remote mutation primary sentinel'
  );
  return {
    health: identity,
    routerId: record[0].Id as string,
    routerStatus: record[0].State?.Status as string,
    routerHealth: record[0].State?.Health?.Status as string,
    primary: primaryValue,
  };
}

function assertNoRemoteMutation(
  before: RemoteMutationSentinel,
  after: RemoteMutationSentinel
): void {
  for (const field of [
    'host',
    'runtime',
    'imageDigest',
    'sourceRevision',
    'composeGeneration',
    'pid',
  ] as const) {
    expect(after.health[field], `remote health ${field} unchanged`).toBe(before.health[field]);
  }
  expect(after.health.uptimeMs, 'remote health uptime monotonic').toBeGreaterThanOrEqual(
    before.health.uptimeMs
  );
  expect(after.routerId, 'router container identity unchanged').toBe(before.routerId);
  expect(after.routerStatus, 'router status unchanged').toBe('running');
  expect(after.routerHealth, 'router health unchanged').toBe('healthy');
  expect(after.primary, 'protected primary unchanged').toEqual(before.primary);
}

async function captureIndependentModelsObserver(runDir: string): Promise<unknown> {
  const outputDir = resolve(runDir, 'independent-ssh-observer');
  await mkdir(outputDir, { recursive: true });
  const command = `curl --silent --show-error --fail --connect-timeout 8 --max-time 180 ${ROUTER_URL}/v1/models`;
  await writeFile(
    resolve(outputDir, 'ssh-provenance.txt'),
    `host=${INFERENCE1}\nssh_options=BatchMode=yes,StrictHostKeyChecking=yes,ConnectTimeout=12,ConnectionAttempts=1,ServerAliveInterval=5,ServerAliveCountMax=2\ncommand=${command}\n`,
    'utf8'
  );
  const sshArgs = [
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'ConnectTimeout=12',
    '-o',
    'ConnectionAttempts=1',
    '-o',
    'ServerAliveInterval=5',
    '-o',
    'ServerAliveCountMax=2',
    INFERENCE1,
    command,
  ];
  try {
    const result = await execFileAsync('ssh', sshArgs, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 240_000,
    });
    await writeFile(resolve(outputDir, 'models.json'), result.stdout, 'utf8');
    await writeFile(resolve(outputDir, 'stderr.log'), result.stderr, 'utf8');
    await writeFile(resolve(outputDir, 'exit.txt'), '0\n', 'utf8');
    return parseJson(result.stdout, 'independent inference1 models observer');
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string; code?: string | number ;
    };
    await writeFile(resolve(outputDir, 'models.json'), result.stdout ?? '', 'utf8');
    await writeFile(resolve(outputDir, 'stderr.log'), result.stderr ?? '', 'utf8');
    await writeFile(resolve(outputDir, 'exit.txt'), `${String(result.code ?? 1)}\n`, 'utf8');
    throw error;
  }
}

async function probeRouter(): Promise<{ reachable: boolean; detail: string }> {
  try {
    const result = await execFileAsync(
      'curl',
      [
        '--silent',
        '--show-error',
        '--fail',
        '--connect-timeout',
        '8',
        '--max-time',
        '8',
        `${ROUTER_URL}/v1/models`,
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 15_000,
      }
    );
    return { reachable: result.stdout.trim().length > 0, detail: result.stdout ,
    };
  } catch (error) {
    const result = error as { stderr?: string; stdout?: string };
    return { reachable: false, detail: `${result.stderr ?? ''}${result.stdout ?? ''}`.trim() ,
    };
  }
}

describe('S33-OPS-02 router capacity against real services', () => {
  function requireLiveEnvironment(): void {
    if (process.env.PLATFORM_IT !== '1') {
      throw new Error('PLATFORM_IT=1 is required; this real-service test never skips');
    }
  }

  it('changed transport commands keep TLS and SSH verification strict', async () => {
    const sourcePaths = [
      VERIFIER,
      resolve(REPO_ROOT, 'tests/integration/sprint33-ops-02-router-capacity.test.ts'),
    ];
    const sourceTexts = await Promise.all(sourcePaths.map((path) => readFile(path, 'utf8')));
    const forbiddenTokens = [
      ['-', 'k'].join(''),
      ['--', 'insecure'].join(''),
      ['StrictHostKeyChecking=', 'no'].join(''),
      ['StrictHostKeyChecking=', 'accept-new'].join(''),
      ['UserKnownHostsFile=', '/dev/null'].join(''),
      ['ssh', '-', 'keyscan'].join(''),
    ];
    for (const [index, source] of sourceTexts.entries()) {
      for (const token of forbiddenTokens) {
        const optionPattern = new RegExp(`(?:^|[\\s'"=])${token}(?:$|[\\s'"=])`);
        expect(
          source,
          `${sourcePaths[index]} contains unsafe transport token ${token}`
        ).not.toMatch(optionPattern);
      }
    }
  });

  it('verifier health assertion rejects missing and non-null failing_dependency', async () => {
    const { stdout } = await execFileAsync('bash', [VERIFIER, '--health-regression'], {
      cwd: REPO_ROOT,
      env: { ...process.env, PLATFORM_IT: '1' },
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    });
    expect(stdout).toContain('"fleet_ready": true');
  });

  it('rejects a polluted evidence base before allocation or network I/O', async () => {
    const base = resolve(EVIDENCE_ROOT, 'models-reviewer');
    const pollution = resolve(base, 'polluted-before-allocation.txt');
    await rm(pollution, { force: true });
    await assertCleanEvidenceBase(base);
    const pristine = await snapshotTree(base);
    const pristineRuns = await snapshotRunNames(base);
    await writeFile(pollution, 'pollution\n', 'utf8');
    let failure:
      | { stderr?: string; stdout?: string; code?: number }
      | undefined;
    try {
      await execFileAsync(
        'bash',
        [
          VERIFIER,
          '--mode',
          'models-reviewer',
          '--router-url',
          'http://127.0.0.1:1',
          '--health-url',
          'http://127.0.0.1:1/health',
          '--inference1-host',
          INFERENCE1,
          '--evidence-dir',
          '.tmp/S33-OPS-02/models-reviewer',
        ],
        {
          cwd: REPO_ROOT,
          env: { ...process.env, PLATFORM_IT: '1' },
          encoding: 'utf8',
          timeout: 30_000,
        }
      );
    } catch (error) {
      failure = error as { stderr?: string; stdout?: string; code?: number };
    } finally {
      await rm(pollution, { force: true });
    }
    expect(failure?.code).not.toBe(0);
    expect(failure?.stderr).toContain('evidence base must contain only runs');
    expect(await snapshotTree(base)).toBe(pristine);
    expect(await snapshotRunNames(base)).toEqual(pristineRuns);
  });

  it('rejects manifest leaf symlinks and physical escapes', async () => {
    const target = resolve(EVIDENCE_ROOT, 'manifest-leaf-target.txt');
    const leaf = resolve(EVIDENCE_ROOT, 'manifest-leaf-symlink.txt');
    const outsideTarget = resolve(
      EVIDENCE_ROOT,
      '..',
      `manifest-leaf-outside-${randomUUID()}.txt`
    );
    const outsideLeaf = resolve(EVIDENCE_ROOT, 'manifest-leaf-escape.txt');
    await rm(target, { force: true });
    await rm(leaf, { force: true });
    await rm(outsideTarget, { force: true });
    await rm(outsideLeaf, { force: true });
    await writeFile(target, 'manifest target\n', 'utf8');
    await writeFile(outsideTarget, 'outside target\n', 'utf8');
    await symlink(target, leaf, 'file');
    await symlink(outsideTarget, outsideLeaf, 'file');
    try {
      expect(() =>
        artifactPath({
          path: '.tmp/S33-OPS-02/manifest-leaf-symlink.txt',
          exists: true,
          byte_length: 1,
        })
      ).toThrow('symlink');
      expect(() =>
        artifactPath({
          path: `.tmp/S33-OPS-02/${outsideLeaf.split('/').pop()}`,
          exists: true,
          byte_length: 1,
        })
      ).toThrow(/symlink|physically escapes/);
    } finally {
      await rm(leaf, { force: true });
      await rm(target, { force: true });
      await rm(outsideLeaf, { force: true });
      await rm(outsideTarget, { force: true });
    }
  });

  it('recipe rejects stale nonzero gate output and preserves exact backend count labels', async () => {
    const script = String.raw`
import importlib.util
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path

recipe_path = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location('stamp_raw_references', recipe_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

rows = {
    'TC-5': {
        'exit_code': 0,
        'verify': module.EXPECTED_GATE_COMMANDS['TC-5'],
        'output_file': module.REQUIREMENT_OUTPUT_FILES['TC-5'],
    },
    'TC-6': {
        'exit_code': 0,
        'verify': module.EXPECTED_GATE_COMMANDS['TC-6'],
        'output_file': module.REQUIREMENT_OUTPUT_FILES['TC-6'],
    },
}
inference1 = module.BACKEND_URLS['inference1']
inference2 = module.BACKEND_URLS['inference2']
seeded = module.derive_seeded('AC-2', {
    'run_id': 'filesystem-test-run',
    'request_count': 6,
    'tracked_request_count': 6,
    'distinct_nonempty_body_count': 2,
    'backend_headers': [inference1, inference2],
    'backend_request_counts': {inference1: 1, inference2: 1},
    'backend_fresh_completion_counts': {inference1: 2, inference2: 7},
})
assert f'inference1[{inference1}]=2' in seeded
assert f'inference2[{inference2}]=7' in seeded

repo_root = Path(sys.argv[2])
expected_test_count = module.focused_test_case_count(repo_root / module.FOCUSED_TEST_SOURCE, repo_root)
assert expected_test_count != 8

with tempfile.TemporaryDirectory(prefix='s33-manifestless-run-') as temp:
    root = Path(temp)
    run = root / 'models-reviewer' / 'runs' / 'manifestless-run'
    run.mkdir(parents=True)
    errors = run / 'errors.log'
    errors.write_text('', encoding='utf-8')
    try:
        module.validate_active_run('models-reviewer', run, root)
    except SystemExit:
        pass
    else:
        raise AssertionError('nonempty manifestless active run was accepted')

with tempfile.TemporaryDirectory(prefix='s33-archive-coverage-') as temp:
    root = Path(temp)
    shutil.copytree(repo_root / '.tmp' / 'S33-OPS-02', root, dirs_exist_ok=True)
    uncovered = root / 'historical-archive' / 'c3-base-blobs' / 'models-reviewer' / 'uncovered.txt'
    uncovered.write_text('uncovered archive payload\n', encoding='utf-8')
    try:
        module.validate_archive_and_base_shape(root)
    except SystemExit:
        pass
    else:
        raise AssertionError('uncovered archive payload was accepted')
    uncovered.unlink()
    tampered = root / 'historical-archive' / 'c3-base-blobs' / 'models-reviewer' / 'result.json'
    original_tampered = tampered.read_bytes()
    tampered.write_bytes(original_tampered + b'\ntampered')
    try:
        module.validate_archive_and_base_shape(root)
    except SystemExit:
        pass
    else:
        raise AssertionError('tampered archive payload was accepted')
    assert tampered.read_bytes() != original_tampered

with tempfile.TemporaryDirectory(prefix='s33-stamp-gates-') as temp:
    root = Path(temp)
    tc5 = root / 'tc-5-output.txt'
    tc6 = root / 'tc-6-output.txt'
    native_tc5 = (repo_root / '.tmp' / 'S33-OPS-02' / 'tc-5-output.txt').read_text(encoding='utf-8')
    assert re.search(r'(?m)^[ \t]*Test Files[ \t]+1[ \t]+passed[ \t]+\(1\)[ \t]*$', native_tc5)
    assert re.search(r'(?m)^[ \t]*Tests[ \t]+8[ \t]+passed[ \t]+\(8\)[ \t]*$', native_tc5)
    positive_tc5 = re.sub(r'(?m)^[ \t]*Tests[ \t]+8[ \t]+passed[ \t]+\(8\)[ \t]*$', f'      Tests  {expected_test_count} passed ({expected_test_count})', native_tc5)
    tc5.write_text(positive_tc5, encoding='utf-8')
    tc6.write_text(json.dumps({
        'overall': 'REAL',
        'acs': [
            {'ac_id': 'AC-1', 'verdict': 'REAL', 'boundary_mocked': False, 'watched_red': True, 'boundary_matches': [], 'unreadable_test_files': []},
            {'ac_id': 'AC-2', 'verdict': 'REAL', 'boundary_mocked': False, 'watched_red': True, 'boundary_matches': [], 'unreadable_test_files': []},
        ],
    }), encoding='utf-8')
    module.validate_gate_outputs(root, rows, repo_root)
    tc5.write_text(re.sub(r'(?m)^[ \t]*Tests[ \t]+\d+[ \t]+passed[ \t]+\(\d+\)[ \t]*$', '      Tests  8 passed (8)', positive_tc5), encoding='utf-8')
    tc5_bytes = tc5.read_bytes()
    try:
        module.validate_gate_outputs(root, rows, repo_root)
    except SystemExit:
        pass
    else:
        raise AssertionError('stale TC-5 test count was accepted')
    assert tc5.read_bytes() == tc5_bytes
    tc5.write_text(re.sub(r'(?m)^[ \t]*Tests[ \t]+\d+[ \t]+passed[ \t]+\(\d+\)[ \t]*$', f'      Tests  {expected_test_count} passed | 1 skipped ({expected_test_count + 1})', positive_tc5), encoding='utf-8')
    tc5_bytes = tc5.read_bytes()
    try:
        module.validate_gate_outputs(root, rows, repo_root)
    except SystemExit:
        pass
    else:
        raise AssertionError('skipped TC-5 test was accepted')
    assert tc5.read_bytes() == tc5_bytes
    tc5.write_text(re.sub(r'(?m)^[ \t]*Tests[ \t]+\d+[ \t]+passed[ \t]+\(\d+\)[ \t]*$', '      Tests  8 failed (8)', re.sub(r'(?m)^[ \t]*Test Files[ \t]+1[ \t]+passed[ \t]+\(1\)[ \t]*$', ' Test Files  1 failed (1)', positive_tc5)), encoding='utf-8')
    tc5_bytes = tc5.read_bytes()
    try:
        module.validate_gate_outputs(root, rows, repo_root)
    except SystemExit:
        pass
    else:
        raise AssertionError('stale TC-5 failure was accepted')
    assert tc5.read_bytes() == tc5_bytes
    tc5.write_text(positive_tc5, encoding='utf-8')
    tc6.write_text(json.dumps({'overall': 'NOT_REAL', 'acs': []}), encoding='utf-8')
    tc6_bytes = tc6.read_bytes()
    try:
        module.validate_gate_outputs(root, rows, repo_root)
    except SystemExit:
        pass
    else:
        raise AssertionError('stale TC-6 non-REAL result was accepted')
    assert tc6.read_bytes() == tc6_bytes
`;
    await execFileAsync('python3', ['-c', script, resolve(EVIDENCE_ROOT, 'stamp-raw-references.py'), REPO_ROOT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
    });
  });

  it('AC-1 independently verifies health, both model observers, and reviewer inference2 routing', async () => {
    requireLiveEnvironment();
    const run = await runVerifier('models-reviewer', 'integration-models-reviewer');
    const result = run.result;
    const manifestNames = [
      'health_pre_deploy',
      'health_pre_deploy_curl_stderr_receipt',
      'health',
      'health_headers',
      'health_status',
      'laptop_models',
      'laptop_models_headers',
      'laptop_models_status',
      'inference1_models',
      'inference1_ssh_provenance',
      'inference1_ssh_exit',
      'router_compose_up_stdout_receipt',
      'router_compose_up_stderr_receipt',
      'router_compose_up_provenance',
      'router_compose_up_exit',
      'reviewer_payload',
      'reviewer_body',
      'reviewer_headers',
      'reviewer_status',
    ];
    const artifacts = Object.fromEntries(
      await Promise.all(
        manifestNames.map(async (name) => [name, manifestArtifact(result, name)] as const)
      )
    );
    for (const [name, artifact] of Object.entries(artifacts)) {
      await assertNonEmptyArtifact(artifact, `models ${name}`);
    }

    const runDir = emittedRunDir(
      result,
      '.tmp/S33-OPS-02/integration-models-reviewer'
    );
    await assertCaptureReceipt(
      artifacts.health_pre_deploy_curl_stderr_receipt,
      runDir,
      'health pre-deploy stderr'
    );
    await assertCaptureReceipt(
      artifacts.router_compose_up_stdout_receipt,
      runDir,
      'router compose stdout'
    );
    await assertCaptureReceipt(
      artifacts.router_compose_up_stderr_receipt,
      runDir,
      'router compose stderr'
    );

    const health = parseJson(await readFile(artifactPath(artifacts.health), 'utf8'), 'raw health');
    const preDeployHealth = parseJson(
      await readFile(artifactPath(artifacts.health_pre_deploy), 'utf8'),
      'raw pre-deploy health baseline'
    );
    if (!health || typeof health !== 'object') throw new Error('raw health is not an object');
    expect((health as { status?: string }).status).toBe('ok');
    expect((health as { fleet?: { ready?: boolean } }).fleet?.ready).toBe(true);
    expect(Object.hasOwn(health, 'failing_dependency')).toBe(true);
    expect((health as { failing_dependency?: unknown }).failing_dependency).toBeNull();
    const preIdentity = deploymentIdentity(preDeployHealth, 'raw pre-deploy health baseline');
    const postIdentity = deploymentIdentity(health, 'raw post-deploy health');
    for (const field of [
      'host',
      'runtime',
      'imageDigest',
      'sourceRevision',
      'composeGeneration',
      'pid',
    ] as const) {
      expect(postIdentity[field], `deployment ${field} unchanged`).toBe(preIdentity[field]);
    }
    expect(postIdentity.uptimeMs, 'deployment uptime monotonic').toBeGreaterThanOrEqual(
      preIdentity.uptimeMs
    );
    expect(result.deployment_identity_unchanged).toBe(true);
    expect(result.deployment_pid_unchanged).toBe(true);
    expect(result.deployment_uptime_monotonic).toBe(true);
    expect(result.deployment_restart_oracle_limitation).toContain('no container restart count');
    expect((await readFile(artifactPath(artifacts.health_status), 'utf8')).trim()).toMatch(
      /^2\d\d$/
    );

    const laptopModels = parseJson(
      await readFile(artifactPath(artifacts.laptop_models), 'utf8'),
      'raw laptop models'
    );
    const inference1Models = parseJson(
      await readFile(artifactPath(artifacts.inference1_models), 'utf8'),
      'raw inference1 models'
    );
    modelIds(laptopModels);
    modelIds(inference1Models);
    expect(artifacts.laptop_models.path).not.toBe(artifacts.inference1_models.path);

    const reviewerStatus = (await readFile(artifactPath(artifacts.reviewer_status), 'utf8')).trim();
    expect(reviewerStatus).toMatch(/^2\d\d$/);
    const reviewerBody = parseJson(
      await readFile(artifactPath(artifacts.reviewer_body), 'utf8'),
      'raw reviewer body'
    );
    assertGeneratedContent(reviewerBody, 'raw reviewer body');
    const reviewerHeaders = await readFile(artifactPath(artifacts.reviewer_headers), 'utf8');
    expect(headerValue(reviewerHeaders, 'x-litellm-model-api-base')).toBe(REVIEWER_BASE);
    expect((result.reviewer_completion as { api_base?: string }).api_base).toBe(REVIEWER_BASE);
    expect((await readFile(artifactPath(artifacts.inference1_ssh_exit), 'utf8')).trim()).toBe('0');
    const sshProvenance = await readFile(artifactPath(artifacts.inference1_ssh_provenance), 'utf8');
    expect(sshProvenance).toContain('host=inference1');
    expect(sshProvenance).toContain('StrictHostKeyChecking=yes');
    const independentModels = await captureIndependentModelsObserver(runDir);
    modelIds(independentModels);
    expect(
      (await readFile(resolve(runDir, 'independent-ssh-observer/ssh-provenance.txt'), 'utf8'))
        .length
    ).toBeGreaterThan(0);
    expect(run.stdoutPath).toContain('integration-models-reviewer');
  }, 360_000);

  it('AC-2 verifies concurrent implementer distribution and fresh log evidence on both minis', async () => {
    requireLiveEnvironment();
    const run = await runVerifier(
      'implementer-distribution',
      'integration-implementer-distribution'
    );
    const result = run.result;
    expect(result.request_count).toBe(6);
    expect(result.tracked_request_count).toBe(6);
    const requestRoot = resolve(REPO_ROOT, result.requests_artifact_path as string);
    const requestDirs = (await readdir(requestRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('request-'))
      .map((entry) => resolve(requestRoot, entry.name))
      .sort();
    expect(requestDirs).toHaveLength(6);
    const rawRequests = await Promise.all(
      requestDirs.map(async (requestDir) => {
        const status = (await readFile(resolve(requestDir, 'status.txt'), 'utf8')).trim();
        const exitCode = (await readFile(resolve(requestDir, 'curl-exit.txt'), 'utf8')).trim();
        expect(exitCode).toBe('0');
        expect(status).toMatch(/^2\d\d$/);
        const headers = await readFile(resolve(requestDir, 'headers.txt'), 'utf8');
        const apiBase = headerValue(headers, 'x-litellm-model-api-base');
        expect(EXPECTED_BASES).toContain(apiBase);
        const bodyBytes = await readFile(resolve(requestDir, 'body.json'));
        const body = parseJson(bodyBytes.toString('utf8'), `${requestDir}/body.json`);
        assertGeneratedContent(body, `${requestDir}/body.json`);
        const metadata = parseJson(
          await readFile(resolve(requestDir, 'metadata.json'), 'utf8'),
          `${requestDir}/metadata.json`
        ) as { pid?: number };
        expect(metadata.pid).toBeGreaterThan(0);
        return {
          apiBase,
          bodyHash: createHash('sha256').update(bodyBytes).digest('hex'),
        };
      })
    );
    const bodyHashes = new Set(rawRequests.map((request) => request.bodyHash));
    expect(bodyHashes.size).toBeGreaterThanOrEqual(2);
    const requestCounts = new Map<string, number>();
    for (const request of rawRequests) {
      requestCounts.set(request.apiBase ?? '', (requestCounts.get(request.apiBase ?? '') ?? 0) + 1);
    }
    expect(new Set(requestCounts.keys())).toEqual(new Set(EXPECTED_BASES));
    const resultRequestCounts = result.backend_request_counts as Record<string, number>;
    const resultFreshCounts = result.backend_fresh_completion_counts as Record<string, number>;
    for (const backend of EXPECTED_BASES) {
      expect(resultRequestCounts[backend], `${backend} result request count`).toBe(
        requestCounts.get(backend)
      );
      expect(
        resultFreshCounts[backend],
        `${backend} result fresh completion count`
      ).toBeGreaterThanOrEqual(requestCounts.get(backend) ?? 0);
    }
    expect(result.backend_completion_counts_sufficient).toBe(true);

    const baseline1 = parseJson(
      await readFile(
        artifactPath(manifestArtifact(result, 'inference1_log_baseline_identity')),
        'utf8'
      ),
      'inference1 log baseline identity'
    );
    const baseline2 = parseJson(
      await readFile(
        artifactPath(manifestArtifact(result, 'inference2_log_baseline_identity')),
        'utf8'
      ),
      'inference2 log baseline identity'
    );
    const post1 = parseJson(
      await readFile(
        artifactPath(manifestArtifact(result, 'inference1_log_post_identity')),
        'utf8'
      ),
      'inference1 log post identity'
    );
    const post2 = parseJson(
      await readFile(
        artifactPath(manifestArtifact(result, 'inference2_log_post_identity')),
        'utf8'
      ),
      'inference2 log post identity'
    );
    const baseline1Identity = assertLogIdentity(
      baseline1,
      'inference1 log baseline identity',
      INFERENCE1
    );
    const baseline2Identity = assertLogIdentity(
      baseline2,
      'inference2 log baseline identity',
      INFERENCE2
    );
    const post1Identity = assertLogIdentity(post1, 'inference1 log post identity', INFERENCE1);
    const post2Identity = assertLogIdentity(post2, 'inference2 log post identity', INFERENCE2);
    expect(post1Identity.device).toBe(baseline1Identity.device);
    expect(post1Identity.inode).toBe(baseline1Identity.inode);
    expect(post2Identity.device).toBe(baseline2Identity.device);
    expect(post2Identity.inode).toBe(baseline2Identity.inode);
    expect(post1Identity.byte_size).toBeGreaterThan(baseline1Identity.byte_size);
    expect(post2Identity.byte_size).toBeGreaterThan(baseline2Identity.byte_size);

    const log1 = await readFile(
      artifactPath(manifestArtifact(result, 'inference1_log_post_baseline')),
      'utf8'
    );
    const log2 = await readFile(
      artifactPath(manifestArtifact(result, 'inference2_log_post_baseline')),
      'utf8'
    );
    expect(Buffer.byteLength(log1)).toBe(post1Identity.byte_size - baseline1Identity.byte_size);
    expect(Buffer.byteLength(log2)).toBe(post2Identity.byte_size - baseline2Identity.byte_size);
    const completionCount1 = (
      log1.match(new RegExp(`Chat completion: model=${IMPLEMENTER_MODEL}`, 'g')) ?? []
    ).length;
    const completionCount2 = (
      log2.match(new RegExp(`Chat completion: model=${IMPLEMENTER_MODEL}`, 'g')) ?? []
    ).length;
    expect(completionCount1).toBeGreaterThanOrEqual(requestCounts.get(EXPECTED_BASES[0]) ?? 0);
    expect(completionCount2).toBeGreaterThanOrEqual(requestCounts.get(EXPECTED_BASES[1]) ?? 0);
  }, 360_000);

  it('rejects both modes when the real router dependency is unavailable', async () => {
    requireLiveEnvironment();
    const ac1Failure = await runVerifierFailure(
      'models-reviewer',
      'negative-ac1-router-unreachable',
      { }
    );
    expect(ac1Failure).toContain(
      'S33-OPS-02 verifier failed: curl failed for http://127.0.0.1:1/health'
    );
    const ac2Failure = await runVerifierFailure(
      'implementer-distribution',
      'negative-ac2-router-unreachable'
    );
    expect(ac2Failure).toContain('S33-OPS-02 verifier failed: tracked concurrent request failed');
  }, 180_000);

  it('rejects lexical traversal and symlink evidence candidates before any write', async () => {
    requireLiveEnvironment();
    const evidenceRoot = resolve(REPO_ROOT, '.tmp/S33-OPS-02');
    const symlinkTarget = resolve(evidenceRoot, 'path-regression-target');
    const symlinkCandidate = resolve(evidenceRoot, 'path-regression-symlink');
    const outsideCandidate = resolve(REPO_ROOT, `.tmp/S33-OPS-02-path-traversal-${randomUUID()}`);
    await rm(symlinkCandidate, { recursive: true, force: true });
    await rm(symlinkTarget, { recursive: true, force: true });
    await expect(stat(outsideCandidate)).rejects.toThrow();
    await mkdir(symlinkTarget, { recursive: true });
    await symlink(symlinkTarget, symlinkCandidate, 'dir');
    try {
      const traversalFailure = await runVerifierFailure(
        'models-reviewer',
        'path-regression-traversal-control',
        {
          routerUrl: 'http://127.0.0.1:1',
          inference1: INFERENCE1,
          evidenceDir: '.tmp/S33-OPS-02/../S33-OPS-02-path-traversal',
        }
      );
      expect(traversalFailure).toContain('candidate evidence path contains ..');
      const symlinkFailure = await runVerifierFailure(
        'models-reviewer',
        'path-regression-symlink-control',
        {
          routerUrl: 'http://127.0.0.1:1',
          inference1: INFERENCE1,
          evidenceDir: '.tmp/S33-OPS-02/path-regression-symlink/child',
        }
      );
      expect(symlinkFailure).toContain('candidate evidence path contains a symlink');
      expect(await stat(symlinkTarget)).toBeTruthy();
      await expect(stat(outsideCandidate)).rejects.toThrow();
    } finally {
      await rm(symlinkCandidate, { recursive: true, force: true });
      await rm(symlinkTarget, { recursive: true, force: true });
    }
  }, 180_000);

  it('keeps live invalid-observer and invalid-log controls exact when the router is available', async () => {
    requireLiveEnvironment();
    const probe = await probeRouter();
    const controlDir = resolve(REPO_ROOT, '.tmp/S33-OPS-02/live-negative-controls');
    await mkdir(controlDir, { recursive: true });
    if (!probe.reachable) {
      await writeFile(
        resolve(controlDir, 'router-unavailable.json'),
        `${JSON.stringify({ router_reachable: false, detail: probe.detail }, null, 2)}\n`,
        'utf8'
      );
      expect(probe.detail).toMatch(
        /(Failed to connect|Could not connect|Connection refused|curl)/i
      );
      throw new Error(
        `router unavailable; invalid-observer/log controls not executable: ${probe.detail}`
      );
    }
    const invalidObserverFailure = await runVerifierFailure(
      'models-reviewer',
      'negative-invalid-inference1-observer',
      {
        routerUrl: ROUTER_URL,
        healthUrl: HEALTH_URL,
        inference1: 'not-a-real-inference1-host',
        }
    );
    expect(invalidObserverFailure).toContain(
      'S33-OPS-02 verifier failed: SSH-originated models curl failed'
    );
    const invalidLogFailure = await runVerifierFailure(
      'implementer-distribution',
      'negative-invalid-log-observer',
      { routerUrl: ROUTER_URL, remoteLogPath: '/tmp/s33-ops-02-no-such-log' }
    );
    expect(invalidLogFailure).toContain(
      'S33-OPS-02 verifier failed: could not read oMLX log identity'
    );
  }, 180_000);

  it('executes the bounded health flip and fail-after-stop cleanup against real Docker and HTTP', async () => {
    requireLiveEnvironment();
    const healthEvidenceBase = resolve(REPO_ROOT, '.tmp/S33-OPS-02/health-flip');
    const beforeInvalidHost = await snapshotTree(healthEvidenceBase);
    const remoteBeforeInvalidHost = await captureRemoteMutationSentinel();
    const invalidHostFailure = await runHealthFlipContractFailure({ holocronHost: 'not-holocron' ,
    });
    expect(invalidHostFailure).toContain('--holocron-host must be exactly holocron');
    expect(await snapshotTree(healthEvidenceBase)).toBe(beforeInvalidHost);
    assertNoRemoteMutation(remoteBeforeInvalidHost, await captureRemoteMutationSentinel());

    const beforeInvalidDocker = await snapshotTree(healthEvidenceBase);
    const remoteBeforeInvalidDocker = await captureRemoteMutationSentinel();
    const invalidDockerFailure = await runHealthFlipContractFailure({
      remoteDockerBin: '/usr/bin/docker',
    });
    expect(invalidDockerFailure).toContain(
      '--remote-docker-bin must be exactly /usr/local/bin/docker'
    );
    expect(await snapshotTree(healthEvidenceBase)).toBe(beforeInvalidDocker);
    assertNoRemoteMutation(remoteBeforeInvalidDocker, await captureRemoteMutationSentinel());

    const invalidEvidenceName = '.tmp/S33-OPS-02/health-flip-invalid-' + randomUUID();
    const invalidEvidence = resolve(REPO_ROOT, invalidEvidenceName);
    await expect(stat(invalidEvidence)).rejects.toThrow();
    let invalid: | { stderr?: string; stdout?: string; code?: number } | undefined;
    try {
      await execFileAsync(
        'bash',
        [
          VERIFIER,
          '--mode',
          'health-flip',
          '--holocron-host',
          HOLOCRON_HOST,
          '--remote-compose-file',
          REMOTE_COMPOSE_FILE,
          '--remote-docker-bin',
          REMOTE_DOCKER_BIN,
          '--router-url',
          ROUTER_URL,
          '--health-url',
          HEALTH_URL,
          '--evidence-dir',
          invalidEvidenceName,
        ],
        {
          cwd: REPO_ROOT,
          env: { ...process.env, PLATFORM_IT: '1' },
          encoding: 'utf8',
          timeout: 30_000,
        }
      );
    } catch (error) {
      invalid = error as { stderr?: string; stdout?: string; code?: number };
    }
    expect(invalid, 'invalid evidence path must fail').toBeDefined();
    expect(invalid?.code).not.toBe(0);
    expect(invalid?.stderr).toContain('health-flip evidence path is not allowlisted');
    await expect(stat(invalidEvidence)).rejects.toThrow();

    const normal = await runHealthFlip(false);
    expect(normal.result?.cleanup_restore_armed).toBe(true);
    expect(normal.result?.restore_succeeded).toBe(true);
    const normalRunDir = emittedRunDir(normal.result as VerifierResult,
      '.tmp/S33-OPS-02/health-flip'
    );
    await independentlyVerifyHealthFlip(normalRunDir);

    const negative = await runHealthFlip(true);
    expect(negative.stderr).toContain('intentional fail-after-stop control');
    const failure = negative.result as VerifierResult;
    expect(failure.ok).toBe(false);
    expect(failure.mode).toBe('health-flip');
    expect(failure.negative_control).toBe('fail-after-stop');
    expect(failure.intentional_failure_observed).toBe(true);
    expect(failure.cleanup_restore_armed).toBe(true);
    expect(failure.cleanup_restore_attempted).toBe(true);
    expect(failure.restore_succeeded).toBe(true);
    expect(failure.deployment_identity_unchanged).toBe(true);
    expect(failure.deployment_pid_unchanged).toBe(true);
    expect(failure.deployment_uptime_monotonic).toBe(true);
    expect(failure.production_service_identities_unchanged).toBe(true);
    expect(failure.remote_primary_unchanged).toBe(true);
    expect(failure.final_router).toEqual({ state: 'running', health: 'healthy' ,
    });
    expect((failure.restored_health as { status?: string }).status).toBe('ok');
    expect((failure.restored_health as { fleet?: { ready?: boolean } }).fleet?.ready).toBe(true);
    expect(
      (failure.restored_health as { failing_dependency?: unknown }).failing_dependency
    ).toBeNull();
    const negativeRunDir = emittedRunDir(failure,
      '.tmp/S33-OPS-02/health-flip-negative'
    );
    await independentlyVerifyHealthFlip(negativeRunDir);
    await independentlyProbeRestoredState();
  }, 360_000);
});
