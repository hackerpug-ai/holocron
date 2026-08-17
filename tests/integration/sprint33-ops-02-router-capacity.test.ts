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
import { mkdir, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(import.meta.dirname, '../..');
const VERIFIER = resolve(REPO_ROOT, 'scripts/verify-s33-router-capacity.sh');
const EVIDENCE_ROOT = resolve(REPO_ROOT, '.tmp/S33-OPS-02');
const ROUTER_URL = 'http://holocron.tail011a51.ts.net:4545';
const HEALTH_URL = 'https://holocron.tail011a51.ts.net:44111/health';
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

function artifactPath(artifact: Artifact): string {
  const path = resolve(REPO_ROOT, artifact.path);
  if (path !== EVIDENCE_ROOT && !path.startsWith(`${EVIDENCE_ROOT}/`)) {
    throw new Error(`artifact path is outside approved evidence root: ${artifact.path}`);
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
  const outputDir = resolve(REPO_ROOT, evidenceDir);
  await mkdir(outputDir, { recursive: true });
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
  const stdoutPath = resolve(outputDir, 'verifier.stdout.json');
  const stderrPath = resolve(outputDir, 'verifier.stderr.log');
  const childEnv = { ...process.env, PLATFORM_IT: '1' };
  const { stdout, stderr } = await execFileAsync('bash', args, {
    cwd: REPO_ROOT,
    env: childEnv,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: 360_000,
  });
  await writeFile(stdoutPath, stdout, 'utf8');
  await writeFile(stderrPath, stderr, 'utf8');
  const result = JSON.parse(stdout) as VerifierResult;
  expect(result.ok, `${mode} result`).toBe(true);
  expect(result.mode, `${mode} result mode`).toBe(mode);
  return { result, stdoutPath, stderrPath };
}

async function captureCurrentHealthBaseline(evidenceDir: string): Promise<void> {
  const outputDir = resolve(REPO_ROOT, evidenceDir);
  await mkdir(outputDir, { recursive: true });
  const { stdout } = await execFileAsync(
    'curl',
    ['--silent', '--show-error', '--connect-timeout', '8', '--max-time', '15', '-k', HEALTH_URL],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 30_000 }
  );
  const baseline = parseJson(stdout, 'negative-control current health baseline');
  deploymentIdentity(baseline, 'negative-control current health baseline');
  await writeFile(resolve(outputDir, 'health.pre-deploy.json'), `${stdout.trim()}\n`, 'utf8');
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
    captureBaseline?: boolean;
  } = {}
): Promise<string> {
  const evidenceDir = overrides.evidenceDir ?? `.tmp/S33-OPS-02/${evidenceName}`;
  const outputDir = resolve(REPO_ROOT, `.tmp/S33-OPS-02/negative-captures/${evidenceName}`);
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
  if (overrides.captureBaseline) await captureCurrentHealthBaseline(evidenceDir);
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

async function captureIndependentModelsObserver(evidenceName: string): Promise<unknown> {
  const outputDir = resolve(REPO_ROOT, `.tmp/S33-OPS-02/${evidenceName}`);
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
    const result = error as { stdout?: string; stderr?: string; code?: string | number };
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
    return { reachable: result.stdout.trim().length > 0, detail: result.stdout };
  } catch (error) {
    const result = error as { stderr?: string; stdout?: string };
    return { reachable: false, detail: `${result.stderr ?? ''}${result.stdout ?? ''}`.trim() };
  }
}

describe('S33-OPS-02 router capacity against real services', () => {
  function requireLiveEnvironment(): void {
    if (process.env.PLATFORM_IT !== '1') {
      throw new Error('PLATFORM_IT=1 is required; this real-service test never skips');
    }
  }

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

  it('AC-1 independently verifies health, both model observers, and reviewer inference2 routing', async () => {
    requireLiveEnvironment();
    const run = await runVerifier('models-reviewer', 'integration-models-reviewer');
    const result = run.result;
    const manifestNames = [
      'health_pre_deploy',
      'health',
      'health_headers',
      'health_status',
      'laptop_models',
      'laptop_models_headers',
      'laptop_models_status',
      'inference1_models',
      'inference1_ssh_provenance',
      'inference1_ssh_exit',
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

    const independentModels = await captureIndependentModelsObserver(
      'integration-models-reviewer/independent-ssh-observer'
    );
    modelIds(independentModels);
    expect(
      (
        await readFile(
          resolve(
            REPO_ROOT,
            '.tmp/S33-OPS-02/integration-models-reviewer/independent-ssh-observer/ssh-provenance.txt'
          ),
          'utf8'
        )
      ).length
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
      { captureBaseline: true }
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
        captureBaseline: true,
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
});
