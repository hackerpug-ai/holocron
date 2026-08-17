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
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(import.meta.dirname, '../..');
const VERIFIER = resolve(REPO_ROOT, 'scripts/verify-s33-router-capacity.sh');
const ROUTER_URL = 'http://holocron.tail011a51.ts.net:4545';
const HEALTH_URL = 'https://holocron.tail011a51.ts.net:44111/health';
const INFERENCE1 = 'inference1';
const INFERENCE2 = 'inference2';
const EXPECTED_BASES = [
  'http://inference1.tail011a51.ts.net:8003/v1',
  'http://inference2.tail011a51.ts.net:8003/v1',
];
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
  return resolve(REPO_ROOT, artifact.path);
}

async function assertNonEmptyArtifact(artifact: Artifact, label: string): Promise<void> {
  expect(artifact.exists, `${label} exists`).toBe(true);
  expect(artifact.byte_length, `${label} byte length`).toBeGreaterThan(0);
  const info = await stat(artifactPath(artifact));
  expect(info.isFile(), `${label} is a regular file`).toBe(true);
  expect(info.size, `${label} live byte length`).toBeGreaterThan(0);
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

async function runMissingDependency(
  mode: 'models-reviewer' | 'implementer-distribution',
  evidenceName: string
): Promise<void> {
  const evidenceDir = `.tmp/S33-OPS-02/${evidenceName}`;
  const outputDir = resolve(REPO_ROOT, evidenceDir);
  await mkdir(outputDir, { recursive: true });
  const args = [
    VERIFIER,
    '--mode',
    mode,
    '--router-url',
    'http://127.0.0.1:1',
    '--inference1-host',
    INFERENCE1,
    '--evidence-dir',
    evidenceDir,
  ];
  if (mode === 'models-reviewer') {
    args.push('--health-url', 'http://127.0.0.1:1/health');
  } else {
    args.push('--inference2-host', INFERENCE2, '--request-count', '6');
  }
  let rejected = false;
  try {
    await execFileAsync('bash', args, {
      cwd: REPO_ROOT,
      env: { ...process.env, PLATFORM_IT: '1' },
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      timeout: 120_000,
    });
  } catch (error) {
    rejected = true;
    const result = error as { stdout?: string; stderr?: string };
    await writeFile(resolve(outputDir, 'verifier.stdout.log'), result.stdout ?? '', 'utf8');
    await writeFile(resolve(outputDir, 'verifier.stderr.log'), result.stderr ?? '', 'utf8');
  }
  expect(rejected, `${mode} must reject an unreachable router`).toBe(true);
}

describe('S33-OPS-02 router capacity against real services', () => {
  function requireLiveEnvironment(): void {
    if (process.env.PLATFORM_IT !== '1') {
      throw new Error('PLATFORM_IT=1 is required; this real-service test never skips');
    }
  }

  it('AC-1 independently verifies health, both model observers, and reviewer inference2 routing', async () => {
    requireLiveEnvironment();
    const run = await runVerifier('models-reviewer', 'integration-models-reviewer');
    const result = run.result;
    expect(result.laptop_models_has_both_roles).toBe(true);
    expect(result.inference1_models_has_both_roles).toBe(true);
    expect(result.laptop_models_artifact_path).not.toBe(result.inference1_models_artifact_path);

    const laptopArtifact = result.artifact_manifest as Record<string, Artifact>;
    for (const [name, artifact] of Object.entries(laptopArtifact)) {
      await assertNonEmptyArtifact(artifact, `models ${name}`);
    }
    const laptopModels = JSON.parse(
      await readFile(artifactPath(laptopArtifact.laptop_models), 'utf8')
    ) as unknown;
    const inference1Models = JSON.parse(
      await readFile(artifactPath(laptopArtifact.inference1_models), 'utf8')
    ) as unknown;
    modelIds(laptopModels);
    modelIds(inference1Models);
    expect(laptopArtifact.laptop_models.path).not.toBe(laptopArtifact.inference1_models.path);
    expect((result.reviewer_completion as { api_base?: string }).api_base).toBe(
      'http://inference2.tail011a51.ts.net:8003/v1'
    );
    expect(JSON.stringify(result.health)).toContain('fleet_ready');
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
    expect(result.backend_headers).toEqual(EXPECTED_BASES);
    expect(result.distinct_nonempty_body_count).toBeGreaterThanOrEqual(2);
    expect(result.inference1_fresh_request_count).toBeGreaterThanOrEqual(1);
    expect(result.inference2_fresh_request_count).toBeGreaterThanOrEqual(1);
    const requestSummary = result.request_summaries_artifact as Artifact;
    await assertNonEmptyArtifact(requestSummary, 'implementer request summaries');
    const rows = (await readFile(artifactPath(requestSummary), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { api_base: string; body_bytes: number; pid: number });
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((row) => row.api_base))).toEqual(new Set(EXPECTED_BASES));
    expect(rows.every((row) => row.body_bytes > 0 && row.pid > 0)).toBe(true);
    await assertNonEmptyArtifact(
      result.inference1_log_post_baseline_artifact as Artifact,
      'inference1 fresh log'
    );
    await assertNonEmptyArtifact(
      result.inference2_log_post_baseline_artifact as Artifact,
      'inference2 fresh log'
    );
  }, 360_000);

  it('rejects both modes when the real router dependency is unavailable', async () => {
    requireLiveEnvironment();
    await runMissingDependency('models-reviewer', 'negative-models-reviewer');
    await runMissingDependency('implementer-distribution', 'negative-implementer-distribution');
  }, 180_000);
});
