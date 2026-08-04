/**
 * GATE-FIX-G5 AC-2 — gate regenerator provenance honesty.
 *
 * Proves scripts/e2e/regenerate-sprint-gate.sh refuses Step-1 PASS when a
 * historical SUCCESS junit (official11) is substituted into the this-cycle
 * artifact dir while failed-this-cycle/junit.xml still reports failures=1.
 *
 * NEVER mocks the regenerator. Spawns the real script with a staged
 * E2E_ARTIFACT_DIR. Restores gate-results.json after each run.
 *
 *   AC-2: official11 SUCCESS checksum swap must not force step1 PASS while
 *         failed-this-cycle failures=1 remains.
 *
 * Gating: PLATFORM_IT=1 required (refuse skip-to-green without it).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
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
const STAGE_DIR = join(REPO_ROOT, '.tmp', 'GATE-FIX-G5', 'provenance-stage');

const HISTORICAL_SUCCESS_JUNIT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites><testsuite name="historical-negative-control" tests="1" failures="0" time="1.0"><testcase name="historical-pass" status="SUCCESS"/></testsuite></testsuites>
`;
const FAILED_CYCLE_JUNIT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites><testsuite name="this-cycle-negative-control" tests="1" failures="1"><testcase name="intentional-failure"><failure message="negative control"/></testcase></testsuite></testsuites>
`;

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const skip = !PLATFORM_IT;

let gateResultsBackup: string | null = null;

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function parseFailuresAttr(junitXml: string): number {
  const m = junitXml.match(/<testsuite[^>]*\sfailures="(\d+)"/);
  return m ? Number(m[1]) : -1;
}

function runRegenerator(
  artifactDir: string,
  rejectedHistoricalSha: string
): {
  stdout: string;
  gate: {
    steps: Array<{ n: number; verdict: string; evidence_path: string }>;
    artifact_dir: string;
  };
} {
  const stdout = execFileSync(REGENERATOR, ['sprint-20'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      E2E_ARTIFACT_DIR: artifactDir,
      REJECTED_HISTORICAL_JUNIT_SHA: rejectedHistoricalSha,
    },
    encoding: 'utf8',
  });
  const gate = JSON.parse(readFileSync(GATE_RESULTS, 'utf8')) as {
    steps: Array<{ n: number; verdict: string; evidence_path: string }>;
    artifact_dir: string;
  };
  return { stdout, gate };
}

describe.skipIf(skip)('GATE-FIX-G5 — gate regenerator provenance', () => {
  beforeEach(() => {
    expect(existsSync(REGENERATOR), 'regenerate-sprint-gate.sh missing').toBe(true);
    expect(existsSync(GATE_RESULTS), 'gate-results.json missing').toBe(true);

    // Snapshot real gate-results so we never leave a substituted PASS on disk.
    gateResultsBackup = readFileSync(GATE_RESULTS, 'utf8');

    rmSync(STAGE_DIR, { recursive: true, force: true });
    mkdirSync(join(STAGE_DIR, 'failed-this-cycle'), { recursive: true });
    writeFileSync(join(STAGE_DIR, 'failed-this-cycle', 'junit.xml'), FAILED_CYCLE_JUNIT);
  });

  afterEach(() => {
    if (gateResultsBackup !== null) {
      writeFileSync(GATE_RESULTS, gateResultsBackup);
      gateResultsBackup = null;
    }
    rmSync(STAGE_DIR, { recursive: true, force: true });
  });

  it('GATE-FIX-G5 AC-2: reject historical SUCCESS junit substitution for this-cycle Step-1 PASS', () => {
    const failedJunit = join(STAGE_DIR, 'failed-this-cycle', 'junit.xml');

    // Prove fixture identities: deterministic historical SUCCESS vs an
    // explicitly labeled this-cycle negative control.
    expect(parseFailuresAttr(HISTORICAL_SUCCESS_JUNIT)).toBe(0);
    expect(parseFailuresAttr(readFileSync(failedJunit, 'utf8'))).toBe(1);

    // Attack: stage historical SUCCESS while retaining failed-this-cycle.
    writeFileSync(join(STAGE_DIR, 'junit.xml'), HISTORICAL_SUCCESS_JUNIT);

    const historicalSha = sha256File(join(STAGE_DIR, 'junit.xml'));
    expect(historicalSha).toMatch(/^[0-9a-f]{64}$/);
    // failed-this-cycle still honest-red.
    expect(
      parseFailuresAttr(readFileSync(join(STAGE_DIR, 'failed-this-cycle', 'junit.xml'), 'utf8'))
    ).toBe(1);

    const { gate } = runRegenerator(STAGE_DIR, historicalSha);
    const step1 = gate.steps.find((s) => s.n === 1);
    expect(step1, 'step 1 missing from regenerator output').toBeDefined();
    if (!step1) throw new Error('step 1 missing');

    // MUST NOT observe step1 PASS solely from the official11 SUCCESS copy.
    expect(
      step1.verdict,
      `step1 must not PASS from substituted official11 SUCCESS; evidence=${step1.evidence_path}`
    ).not.toBe('PASS');

    // failed-this-cycle must still report failures=1 (not rewritten by regenerator).
    const retained = readFileSync(join(STAGE_DIR, 'failed-this-cycle', 'junit.xml'), 'utf8');
    expect(retained).toMatch(/failures="1"/);
    expect(parseFailuresAttr(retained)).toBe(1);

    // Evidence path should surface this-cycle failure provenance, not blind success.
    const ev = `${step1.evidence_path}`.toLowerCase();
    const mentionsFailedCycle =
      ev.includes('failed-this-cycle') ||
      ev.includes('failures=1') ||
      ev.includes('failures>0') ||
      ev.includes('this-cycle');
    expect(
      mentionsFailedCycle || step1.verdict === 'FAIL' || step1.verdict === 'PARTIAL',
      `step1 must fail-closed with this-cycle provenance; got verdict=${step1.verdict} evidence=${step1.evidence_path}`
    ).toBe(true);
  });
});

describe.skipIf(!skip)(
  'GATE-FIX-G5 — gate regenerator provenance (skipped: PLATFORM_IT unset)',
  () => {
    it('skips with reason when PLATFORM_IT=1 is unset (refuse skip-to-green)', () => {
      console.warn(
        '[GATE-FIX-G5] SKIPPED: set PLATFORM_IT=1 to drive real regenerate-sprint-gate.sh provenance checks'
      );
      expect(skip).toBe(true);
    });
  }
);
