/**
 * GATE-FIX-G2 — this-cycle Maestro cold-boot green without historical SUCCESS
 * substitution.
 *
 *   AC-1: this-cycle E2E_ARTIFACT_DIR junit failures=0 + non-empty final.png +
 *         reference-flow.mov; must not be the official11 SUCCESS checksum.
 *   AC-2: capstone-verdict.sh derives coldboot_gate green from this-cycle
 *         artifacts + live Postgres/Zero.
 *   AC-3: reject historical official11 SUCCESS as this-cycle green; failed-this-
 *         cycle remains red under capstone.
 *   AC-4: regenerate-sprint-gate steps 1 and 3 PASS from this-cycle only.
 *
 * Gating: PLATFORM_IT=1 required. NEVER mocks Maestro/capstone/regenerator.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const ARTIFACT_DIR = resolve(REPO_ROOT, '.tmp', 'maestro-reference-flow');
const FAILED_CYCLE = join(ARTIFACT_DIR, 'failed-this-cycle');
const OFFICIAL11 = resolve(REPO_ROOT, '.tmp', 'maestro-reference-flow-official11');
const VERIFIER = join(REPO_ROOT, 'scripts', 'e2e', 'capstone-verdict.sh');
const REGENERATOR = join(REPO_ROOT, 'scripts', 'e2e', 'regenerate-sprint-gate.sh');
const SPRINT_DIR = resolve(
  REPO_ROOT,
  '.spec',
  'prds',
  'mk6-migration',
  'tasks',
  'sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow'
);
const GATE_RESULTS = join(SPRINT_DIR, 'gate-results.json');
const STAGE_DIR = join(REPO_ROOT, '.tmp', 'GATE-FIX-G2', 'honesty-stage');

/** Known official11 SUCCESS junit sha — must never be promoted as this-cycle alone. */
const OFFICIAL11_SUCCESS_SHA = 'a9eb6f7adb5771585d6d4efae16a7f5123bd6f6c2694923e9ef7269ece15738d';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const skip = !PLATFORM_IT;

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function parseFailuresAttr(junitXml: string): number {
  const m = junitXml.match(/<testsuite[^>]*\sfailures="(\d+)"/);
  return m ? Number(m[1]) : -1;
}

function runRegenerator(artifactDir: string): {
  steps: Array<{ n: number; verdict: string; evidence_path: string }>;
  artifact_dir: string;
} {
  execFileSync(REGENERATOR, ['sprint-20'], {
    cwd: REPO_ROOT,
    env: { ...process.env, E2E_ARTIFACT_DIR: artifactDir },
    encoding: 'utf8',
  });
  return JSON.parse(readFileSync(GATE_RESULTS, 'utf8')) as {
    steps: Array<{ n: number; verdict: string; evidence_path: string }>;
    artifact_dir: string;
  };
}

function runCapstone(artifactDir: string): {
  exitCode: number;
  verdict: Record<string, unknown>;
} {
  const result = spawnSync(VERIFIER, [], {
    cwd: REPO_ROOT,
    env: { ...process.env, E2E_ARTIFACT_DIR: artifactDir },
    encoding: 'utf8',
  });
  const jsonPath = join(artifactDir, 'capstone-verdict.json');
  const verdict = existsSync(jsonPath)
    ? (JSON.parse(readFileSync(jsonPath, 'utf8')) as Record<string, unknown>)
    : {};
  return { exitCode: result.status ?? 1, verdict };
}

describe.skipIf(skip)('GATE-FIX-G2 — this-cycle Maestro cold-boot', () => {
  let gateResultsBackup: string | null = null;

  beforeEach(() => {
    expect(existsSync(REGENERATOR), 'regenerate-sprint-gate.sh missing').toBe(true);
    expect(existsSync(VERIFIER), 'capstone-verdict.sh missing').toBe(true);
    expect(existsSync(join(OFFICIAL11, 'junit.xml')), 'official11 junit missing').toBe(true);
    if (existsSync(GATE_RESULTS)) {
      gateResultsBackup = readFileSync(GATE_RESULTS, 'utf8');
    }
  });

  afterEach(() => {
    if (gateResultsBackup !== null) {
      writeFileSync(GATE_RESULTS, gateResultsBackup);
      gateResultsBackup = null;
    }
    rmSync(STAGE_DIR, { recursive: true, force: true });
  });

  it('AC-1: this-cycle Maestro artifacts junit failures=0 + non-empty screenshot/video', () => {
    const junitPath = join(ARTIFACT_DIR, 'junit.xml');
    const finalPng = join(ARTIFACT_DIR, 'final.png');
    const video = join(ARTIFACT_DIR, 'reference-flow.mov');

    expect(existsSync(junitPath), 'this-cycle junit.xml missing — run Maestro --run').toBe(true);
    expect(existsSync(finalPng), 'this-cycle final.png missing').toBe(true);
    expect(existsSync(video), 'this-cycle reference-flow.mov missing').toBe(true);

    const junit = readFileSync(junitPath, 'utf8');
    const failures = parseFailuresAttr(junit);
    expect(failures, `junit failures must be 0; got ${failures}\n${junit}`).toBe(0);

    const junitSha = sha256File(junitPath);
    expect(
      junitSha,
      'this-cycle junit must not be the official11 SUCCESS checksum (historical substitution)'
    ).not.toBe(OFFICIAL11_SUCCESS_SHA);

    expect(statSync(finalPng).size, 'final.png must be non-empty').toBeGreaterThan(0);
    expect(statSync(video).size, 'reference-flow.mov must be non-empty').toBeGreaterThan(0);

    // Evidence path must be the live this-cycle dir, not official11.
    expect(ARTIFACT_DIR).not.toContain('official11');
    expect(junitPath).not.toContain('official11');
  });

  it('AC-2: capstone green from this-cycle artifacts + live Zero/Postgres', () => {
    const { exitCode, verdict } = runCapstone(ARTIFACT_DIR);
    expect(exitCode, `capstone exit must be 0; reasons=${JSON.stringify(verdict.reasons)}`).toBe(
      0
    );
    expect(verdict.coldboot_gate).toBe('green');
    expect(verdict.junit_failures).toBe(0);
    expect(Number(verdict.zero_agent_content_len)).toBeGreaterThanOrEqual(1);
    expect(Number(verdict.postgres_agent_count)).toBeGreaterThanOrEqual(1);

    const evidence = (verdict.evidence as Array<{ path: string; sha256: string; bytes: number }>) ?? [];
    expect(evidence.length).toBeGreaterThanOrEqual(3);
    for (const e of evidence) {
      expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(e.bytes).toBeGreaterThan(0);
      expect(e.path).not.toContain('official11');
    }
  });

  it('AC-3: reject historical official11 SUCCESS as this-cycle green', () => {
    expect(existsSync(join(FAILED_CYCLE, 'junit.xml')), 'failed-this-cycle junit missing').toBe(
      true
    );

    const officialJunit = join(OFFICIAL11, 'junit.xml');
    const failedJunit = join(FAILED_CYCLE, 'junit.xml');

    const officialSha = sha256File(officialJunit);
    expect(officialSha).toBe(OFFICIAL11_SUCCESS_SHA);
    expect(parseFailuresAttr(readFileSync(officialJunit, 'utf8'))).toBe(0);
    expect(parseFailuresAttr(readFileSync(failedJunit, 'utf8'))).toBe(1);

    // Attack stage: official11 SUCCESS in live dir + failed-this-cycle red retained.
    rmSync(STAGE_DIR, { recursive: true, force: true });
    mkdirSync(join(STAGE_DIR, 'failed-this-cycle'), { recursive: true });
    copyFileSync(officialJunit, join(STAGE_DIR, 'junit.xml'));
    copyFileSync(failedJunit, join(STAGE_DIR, 'failed-this-cycle', 'junit.xml'));
    // Minimal media so capstone can evaluate junit honesty (not media-missing).
    if (existsSync(join(OFFICIAL11, 'final.png'))) {
      copyFileSync(join(OFFICIAL11, 'final.png'), join(STAGE_DIR, 'final.png'));
    }
    if (existsSync(join(OFFICIAL11, 'reference-flow.mov'))) {
      copyFileSync(join(OFFICIAL11, 'reference-flow.mov'), join(STAGE_DIR, 'reference-flow.mov'));
    }

    expect(sha256File(join(STAGE_DIR, 'junit.xml'))).toBe(OFFICIAL11_SUCCESS_SHA);

    const gate = runRegenerator(STAGE_DIR);
    const step1 = gate.steps.find((s) => s.n === 1);
    expect(step1, 'step 1 missing').toBeDefined();
    if (!step1) throw new Error('step 1 missing');

    expect(
      step1.verdict,
      `step1 must not PASS from substituted official11 SUCCESS; evidence=${step1.evidence_path}`
    ).not.toBe('PASS');

    const ev = `${step1.evidence_path}`.toLowerCase();
    const rejectReason =
      ev.includes('historical') ||
      ev.includes('official') ||
      ev.includes('failed-this-cycle') ||
      ev.includes('this-cycle') ||
      ev.includes('substitut');
    expect(
      rejectReason || step1.verdict === 'FAIL',
      `reject_reason must surface historical/this-cycle provenance; got ${step1.evidence_path}`
    ).toBe(true);

    // Capstone against failed-this-cycle artifacts must stay red.
    const failStage = join(STAGE_DIR, 'failed-this-cycle-capstone');
    mkdirSync(failStage, { recursive: true });
    copyFileSync(failedJunit, join(failStage, 'junit.xml'));
    if (existsSync(join(OFFICIAL11, 'final.png'))) {
      copyFileSync(join(OFFICIAL11, 'final.png'), join(failStage, 'final.png'));
    }
    if (existsSync(join(OFFICIAL11, 'reference-flow.mov'))) {
      copyFileSync(join(OFFICIAL11, 'reference-flow.mov'), join(failStage, 'reference-flow.mov'));
    }
    const { exitCode, verdict } = runCapstone(failStage);
    expect(exitCode, 'capstone must exit non-zero for failed-this-cycle').not.toBe(0);
    expect(verdict.coldboot_gate).toBe('red');
    expect(Number(verdict.junit_failures)).toBeGreaterThanOrEqual(1);
  });

  it('AC-4: regenerate-sprint-gate steps 1 and 3 PASS from this-cycle only', () => {
    const junitPath = join(ARTIFACT_DIR, 'junit.xml');
    expect(existsSync(junitPath), 'this-cycle junit required for AC-4').toBe(true);
    expect(parseFailuresAttr(readFileSync(junitPath, 'utf8'))).toBe(0);
    expect(sha256File(junitPath)).not.toBe(OFFICIAL11_SUCCESS_SHA);

    // Capstone must be current for step3.
    const { exitCode, verdict } = runCapstone(ARTIFACT_DIR);
    expect(exitCode, `capstone must be green first; reasons=${JSON.stringify(verdict.reasons)}`).toBe(
      0
    );
    expect(verdict.coldboot_gate).toBe('green');

    const gate = runRegenerator(ARTIFACT_DIR);
    const step1 = gate.steps.find((s) => s.n === 1);
    const step3 = gate.steps.find((s) => s.n === 3);
    expect(step1?.verdict, `step1 evidence=${step1?.evidence_path}`).toBe('PASS');
    expect(step3?.verdict, `step3 evidence=${step3?.evidence_path}`).toBe('PASS');

    // Must not cite official11 as evidence path for step1.
    expect(`${step1?.evidence_path}`).not.toContain('official11');
    expect(gate.artifact_dir).toContain('maestro-reference-flow');
    expect(gate.artifact_dir).not.toContain('official11');
  });
});

describe.skipIf(!skip)(
  'GATE-FIX-G2 — this-cycle cold-boot (skipped: PLATFORM_IT unset)',
  () => {
    it('skips with reason when PLATFORM_IT=1 is unset (refuse skip-to-green)', () => {
      console.warn(
        '[GATE-FIX-G2] SKIPPED: set PLATFORM_IT=1 to drive real this-cycle cold-boot checks'
      );
      expect(skip).toBe(true);
    });
  }
);
