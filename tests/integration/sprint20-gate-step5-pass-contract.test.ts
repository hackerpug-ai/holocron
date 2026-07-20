/**
 * GATE-FIX-G6 AC-2 — Human Gate Step-5 PASS only with dual evidence:
 *   (1) PLATFORM_IT harness suite green (step5-harness-suite.json exitCode==0)
 *   (2) missing-build --run left no junit.xml (step5-missing-build-run.json)
 *
 * File existence alone → PARTIAL. Suite-only or missing-build-only → PARTIAL.
 * Dual evidence → PASS with evidence_path naming both suite and missing-build.
 *
 * NEVER PASS Step-5 from file existence alone.
 * NEVER require full Maestro cold-boot green for Step-5.
 * STRICTLY real regenerate-sprint-gate.sh + real evidence files (no mocks).
 *
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-gate-step5-pass-contract.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const REGENERATOR = join(REPO_ROOT, 'scripts', 'e2e', 'regenerate-sprint-gate.sh');
const SPRINT_DIR = join(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow'
);
const GATE_RESULTS = join(SPRINT_DIR, 'gate-results.json');
const HARNESS_TEST = join(REPO_ROOT, 'tests/integration/sprint20-maestro-harness.test.ts');

type GateStep = {
  n: number;
  text: string;
  verdict: string;
  evidence_path: string;
};

type GateResults = {
  steps: GateStep[];
  committed_sha?: string;
};

const stagedDirs: string[] = [];
let gateBackup: string | null = null;

function backupGateResults(): void {
  if (existsSync(GATE_RESULTS)) {
    gateBackup = readFileSync(GATE_RESULTS, 'utf8');
  } else {
    gateBackup = null;
  }
}

function restoreGateResults(): void {
  if (gateBackup !== null) {
    writeFileSync(GATE_RESULTS, gateBackup);
  } else if (existsSync(GATE_RESULTS)) {
    rmSync(GATE_RESULTS, { force: true });
  }
}

function stageArtifactDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gate-fix-g6-step5-'));
  stagedDirs.push(dir);
  return dir;
}

function writeSuiteEvidence(artifactDir: string, exitCode: number): string {
  const path = join(artifactDir, 'step5-harness-suite.json');
  writeFileSync(
    path,
    JSON.stringify({
      ok: exitCode === 0,
      exitCode,
      suite: 'tests/integration/sprint20-maestro-harness.test.ts',
      captured_at: new Date().toISOString(),
    })
  );
  return path;
}

function writeMissingBuildEvidence(
  artifactDir: string,
  opts: { exitCode: number; junitPresent: boolean }
): string {
  const path = join(artifactDir, 'step5-missing-build-run.json');
  // Optionally plant a junit so the regenerator can observe a contradictory state.
  if (opts.junitPresent) {
    writeFileSync(join(artifactDir, 'junit.xml'), '<testsuite failures="0"></testsuite>\n');
  }
  writeFileSync(
    path,
    JSON.stringify({
      mode: '--run',
      exitCode: opts.exitCode,
      junit_present: opts.junitPresent,
      artifact_dir: artifactDir,
      note: 'EXPO_DEV_BUILD_PATH empty; preflight fail-closed before maestro',
      captured_at: new Date().toISOString(),
    })
  );
  return path;
}

function runRegenerator(artifactDir: string): GateResults {
  const result = spawnSync(REGENERATOR, ['sprint-20'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      E2E_ARTIFACT_DIR: artifactDir,
      // Avoid live psql noise for steps 2 — not under test.
      DATABASE_URL: process.env.DATABASE_URL ?? '',
    },
    encoding: 'utf8',
  });
  expect(
    result.status,
    `regenerate-sprint-gate failed: status=${result.status} stderr=${result.stderr}`
  ).toBe(0);
  // Prefer the written file (canonical); fall back to stdout.
  const raw = existsSync(GATE_RESULTS) ? readFileSync(GATE_RESULTS, 'utf8') : (result.stdout ?? '');
  return JSON.parse(raw) as GateResults;
}

function step5(results: GateResults): GateStep {
  const s = results.steps.find((x) => x.n === 5);
  expect(s, 'gate-results steps[] must include step n=5').toBeTruthy();
  return s!;
}

describe('GATE-FIX-G6 AC-2 — Step-5 PASS requires suite green AND missing-build no-junit', () => {
  beforeAll(() => {
    if (!PLATFORM_IT) {
      throw new Error(
        'PLATFORM_IT=1 required for Step-5 dual-evidence contract — refusing skip-to-green'
      );
    }
    expect(existsSync(REGENERATOR), 'regenerate-sprint-gate.sh missing').toBe(true);
    expect(existsSync(HARNESS_TEST), 'harness test file must exist (file-only baseline)').toBe(
      true
    );
  });

  afterEach(() => {
    restoreGateResults();
    for (const d of stagedDirs.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('GATE-FIX-G6 AC-2 file-only: Step-5 is not PASS when only harness test file exists', () => {
    backupGateResults();
    const artifactDir = stageArtifactDir();
    // No suite / missing-build evidence files — file existence alone.
    const results = runRegenerator(artifactDir);
    const s5 = step5(results);
    expect(
      s5.verdict,
      `file-only must not PASS; got ${s5.verdict} ev=${s5.evidence_path}`
    ).not.toBe('PASS');
    // Baseline today/after fix: PARTIAL (test file present) or FAIL.
    expect(['PARTIAL', 'FAIL']).toContain(s5.verdict);
  });

  it('GATE-FIX-G6 AC-2 suite-only: suite green alone is not PASS', () => {
    backupGateResults();
    const artifactDir = stageArtifactDir();
    writeSuiteEvidence(artifactDir, 0);
    const results = runRegenerator(artifactDir);
    const s5 = step5(results);
    expect(
      s5.verdict,
      `suite-only must not PASS; got ${s5.verdict} ev=${s5.evidence_path}`
    ).not.toBe('PASS');
    expect(['PARTIAL', 'FAIL']).toContain(s5.verdict);
  });

  it('GATE-FIX-G6 AC-2 missing-build-only: missing-build no-junit alone is not PASS', () => {
    backupGateResults();
    const artifactDir = stageArtifactDir();
    writeMissingBuildEvidence(artifactDir, { exitCode: 1, junitPresent: false });
    const results = runRegenerator(artifactDir);
    const s5 = step5(results);
    expect(
      s5.verdict,
      `missing-build-only must not PASS; got ${s5.verdict} ev=${s5.evidence_path}`
    ).not.toBe('PASS');
    expect(['PARTIAL', 'FAIL']).toContain(s5.verdict);
  });

  it('GATE-FIX-G6 AC-2 dual-evidence: Step-5 PASS only with suite green AND missing-build no-junit', () => {
    backupGateResults();
    const artifactDir = stageArtifactDir();
    const suitePath = writeSuiteEvidence(artifactDir, 0);
    const missPath = writeMissingBuildEvidence(artifactDir, {
      exitCode: 1,
      junitPresent: false,
    });
    expect(existsSync(join(artifactDir, 'junit.xml'))).toBe(false);

    const results = runRegenerator(artifactDir);
    const s5 = step5(results);
    expect(s5.verdict, `dual evidence must PASS; got ${s5.verdict} ev=${s5.evidence_path}`).toBe(
      'PASS'
    );
    // evidence_path must name both suite and missing-build evidence.
    const ev = s5.evidence_path.toLowerCase();
    expect(
      ev.includes('suite') || ev.includes('step5-harness-suite'),
      `evidence_path must reference suite evidence: ${s5.evidence_path}`
    ).toBe(true);
    expect(
      ev.includes('missing-build') || ev.includes('step5-missing-build'),
      `evidence_path must reference missing-build evidence: ${s5.evidence_path}`
    ).toBe(true);
    // Concrete paths (or basenames) should be recoverable from evidence_path.
    expect(
      s5.evidence_path.includes(suitePath) || s5.evidence_path.includes('step5-harness-suite.json'),
      `evidence_path should name suite file: ${s5.evidence_path}`
    ).toBe(true);
    expect(
      s5.evidence_path.includes(missPath) ||
        s5.evidence_path.includes('step5-missing-build-run.json'),
      `evidence_path should name missing-build file: ${s5.evidence_path}`
    ).toBe(true);
  });

  it('GATE-FIX-G6 AC-2: suite exit!=0 with missing-build evidence is not PASS', () => {
    backupGateResults();
    const artifactDir = stageArtifactDir();
    writeSuiteEvidence(artifactDir, 1);
    writeMissingBuildEvidence(artifactDir, { exitCode: 1, junitPresent: false });
    const results = runRegenerator(artifactDir);
    const s5 = step5(results);
    expect(s5.verdict).not.toBe('PASS');
  });
});
