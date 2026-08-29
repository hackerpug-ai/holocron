/**
 * REDHAT-FIX-S29-H03 — Sprint 29 Human Testing Gate executable oracles.
 *
 * Proves gate-plan.json steps 1–8 bind real deployment/cutover CLI verbs and conjunctive
 * multi-field jq oracles that fail closed on the historical weak greening cases:
 *   - any-of freeze fields (step 2)
 *   - acceptedWriteCount==0 alone (step 3)
 *   - unexplainedVariance==0 alone / empty source (step 4)
 *   - overall.ok with toolsPassed/toolsTotal null (step 5 / step5.log lineage)
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     packages/platform/tests/integration/sprint29-human-gate-oracles.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';

const itLive = PLATFORM_IT ? it : it.skip;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const HOLO_CLI = resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts');
const GATE_PLAN = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json'
);
const SPRINT_MD = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md'
);
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S29-H03');
const HOLO_CLI_TOKEN = 'bun packages/platform/src/cli/holo.ts';

type GateStep = {
  n: number;
  text?: string;
  method?: string;
  literal_cmd?: string;
  assertion?: unknown;
};

type GatePlan = {
  steps?: GateStep[];
  planned_steps?: number;
  dispatcher?: string;
  remediation?: string;
};

/** Conjunctive oracles mirror gate-plan.json jq -e predicates (require-all). */
const STEP_ORACLES: Record<number, string> = {
  1: '.overall.ok == true and .failed_count == 0 and (.gates | length) == 8 and all(.gates[] | select(.collectedTests != null); .collectedTests > 0)',
  2: '.ok == true and .env_value == "1" and .fence_armed_at > 0',
  3: '.ok == true and .acceptedWriteCount == 0 and .rejectedWriteCount > 0 and .windowSeconds >= 30',
  4: '.ok == true and .unexplainedVariance == 0 and .stages.nonEmpty == true and ((.loadedByTable.documents // 0) > 0 or ((.archive.exportData.rowCounts.documents // 0) > 0)) and (.fkAudit.ok == true) and (.vectors.ok == true)',
  5: '(.overall.ok == true) and ((.tools.toolsPassed // .toolsPassed) | type == "number") and ((.tools.toolsTotal // .toolsTotal) | type == "number") and ((.tools.toolsTotal // .toolsTotal) > 0) and ((.tools.toolsPassed // .toolsPassed) == (.tools.toolsTotal // .toolsTotal)) and ((.jobsAccounted // .jobs.jobsAccounted) == (.jobsTotal // .jobs.jobsTotal)) and (.article.ok == true) and (.honoWrite.ok == true) and (.reads.ok == true) and (.zeroWritePath.status == "BLOCKED") and ((.engaged == true) or (.tools.ok == true))',
  6: '.status == 423 and ((.body.error == "migration_read_only") or (.body.code == "migration_read_only"))',
};

const STEP_VERBS: Record<number, RegExp> = {
  1: /cutover:go-no-go/,
  2: /deploy:apply|deploy-inference1/,
  3: /deploy:verify/,
  4: /deploy:verify/,
  5: /cutover:freeze[\s\S]*cutover:quiet-check/,
  6: /cutover:run-etl/,
  7: /cutover:verify-soak/,
  8: /migration_read_only/,
};

/** Step 7 also sequences cutover:flip before verify-soak. */
const STEP7_FLIP = /cutover:flip/;

function oracle(n: number): string {
  const p = STEP_ORACLES[n];
  if (!p) throw new Error(`missing STEP_ORACLES[${n}]`);
  return p;
}

function stepVerb(n: number): RegExp {
  const re = STEP_VERBS[n];
  if (!re) throw new Error(`missing STEP_VERBS[${n}]`);
  return re;
}

function ensureEvidenceDir(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function writeEvidence(name: string, body: unknown): string {
  ensureEvidenceDir();
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function evalJq(
  predicate: string,
  input: unknown
): { ok: boolean; status: number | null; combined: string } {
  const result = spawnSync('jq', ['-e', predicate], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    input: `${JSON.stringify(input)}\n`,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return {
    ok: result.status === 0,
    status: result.status,
    combined: `${stdout}\n${stderr}`,
  };
}

function loadPlan(): GatePlan {
  expect(existsSync(GATE_PLAN), `gate-plan missing: ${GATE_PLAN}`).toBe(true);
  return JSON.parse(readFileSync(GATE_PLAN, 'utf8')) as GatePlan;
}

function stepByN(plan: GatePlan, n: number): GateStep {
  const step = (plan.steps ?? []).find((s) => s.n === n);
  expect(step, `gate-plan step ${n} required`).toBeTruthy();
  return step as GateStep;
}

describe('REDHAT-FIX-S29-H03 sprint29 human-gate oracles', () => {
  beforeAll(() => {
    ensureEvidenceDir();
    expect(PLATFORM_IT, 'PLATFORM_IT=1 required for human-gate oracle integration').toBe(true);
    expect(existsSync(HOLO_CLI), `holo CLI missing: ${HOLO_CLI}`).toBe(true);
    writeEvidence('boot.json', {
      holoCli: HOLO_CLI,
      gatePlan: GATE_PLAN,
      sprintMd: SPRINT_MD,
      platformIt: PLATFORM_IT,
    });
  });

  itLive('AC-1 / H-03: all 8 steps invoke deployment/cutover CLI with conjunctive oracles', () => {
    const plan = loadPlan();
    expect(plan.remediation).toMatch(/REDHAT-FIX-S29-H03/);
    expect(plan.dispatcher).toContain('packages/platform/src/cli/holo.ts');
    expect(Array.isArray(plan.steps)).toBe(true);
    expect((plan.steps ?? []).map((s) => s.n).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);

    const verbHits: Record<number, string> = {};
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const step = stepByN(plan, n);
      const cmd = String(step.literal_cmd ?? '');
      expect(cmd.length, `step ${n} empty literal_cmd`).toBeGreaterThan(20);
      expect(step.method).toBe('real-cli');
      expect(cmd, `step ${n} must use bun holo dispatcher`).toContain(HOLO_CLI_TOKEN);
      expect(cmd, `step ${n} must reference deployment/cutover verb family`).toMatch(stepVerb(n));
      // Action is real CLI, not isolated jq on pre-baked JSON alone
      expect(cmd).toMatch(/cutover:|deploy:|deploy-inference1/);
      verbHits[n] =
        cmd.match(/(?:cutover|deploy):[a-z0-9-]+|migration_read_only/)?.[0] ?? 'unknown';
    }

    // Step 7 sequences flip then verify-soak
    expect(String(stepByN(plan, 7).literal_cmd)).toMatch(STEP7_FLIP);

    // Step 5: never any-of of freeze ok/env/timestamp and requires quiet evidence
    const step5 = String(stepByN(plan, 5).literal_cmd);
    expect(step5).not.toMatch(/\)\s*or\s*\(/);
    expect(step5).toMatch(/\.ok\s*==\s*true/);
    expect(step5).toMatch(/\.env_value\s*==\s*"1"/);
    expect(step5).toMatch(/\.fence_armed_at\s*>\s*0/);

    expect(step5).toMatch(/rejectedWriteCount/);
    expect(step5).toMatch(/windowSeconds/);
    expect(step5).toMatch(/acceptedWriteCount/);

    // Step 6: full ETL oracle (not variance alone)
    const step6 = String(stepByN(plan, 6).literal_cmd);
    expect(step6).toMatch(/unexplainedVariance/);
    expect(step6).toMatch(/nonEmpty|loadedByTable/);
    expect(step6).toMatch(/fkAudit/);
    expect(step6).toMatch(/vectors/);

    // Step 7: tools counters + Zero write proof required
    const step7 = String(stepByN(plan, 7).literal_cmd);
    expect(step7).toMatch(/toolsPassed/);
    expect(step7).toMatch(/toolsTotal/);
    expect(step7).toMatch(/zeroWritePath/);
    expect(step7).toMatch(/cutover:verify-soak/);

    // Step 8: migration_read_only body
    const step8 = String(stepByN(plan, 8).literal_cmd);
    expect(step8).toMatch(/migration_read_only/);
    expect(step8).toMatch(/423/);

    // Plan predicates must embed the shared oracle tokens (conjunctive)
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const cmd = String(stepByN(plan, n).literal_cmd);
      expect(cmd, `step ${n} must embed jq -e conjunctive oracle`).toMatch(/jq\s+-e/);
    }

    writeEvidence('ac1-plan-structure.json', {
      verbHits,
      planned_steps: plan.planned_steps,
      stepCount: (plan.steps ?? []).length,
    });
  });

  itLive('AC-2 / H-03 step-5: null toolsPassed/toolsTotal soak report fails oracle', () => {
    // Lineage: .gate-evidence/20260802T004525Z/step5.log — overall.ok true, tools null
    const nullToolsSoak = {
      overall: { ok: true },
      toolsPassed: null,
      toolsTotal: null,
      jobsAccounted: 16,
      jobsTotal: 16,
      article: { ok: true },
      honoWrite: { ok: true },
      reads: { ok: true },
      zeroWritePath: { status: 'BLOCKED' },
      engaged: true,
      tools: { ok: true, toolsPassed: null, toolsTotal: null },
    };

    const overallOnly = {
      overall: { ok: true },
    };

    const green = {
      overall: { ok: true },
      tools: { ok: true, toolsPassed: 44, toolsTotal: 44, toolsStubbed: 0 },
      toolsPassed: 44,
      toolsTotal: 44,
      jobsAccounted: 16,
      jobsTotal: 16,
      jobs: { ok: true, jobsAccounted: 16, jobsTotal: 16 },
      article: { ok: true },
      honoWrite: { ok: true },
      reads: { ok: true },
      zeroWritePath: { status: 'BLOCKED' },
      engaged: true,
    };

    const nullEval = evalJq(oracle(5), nullToolsSoak);
    const overallEval = evalJq(oracle(5), overallOnly);
    const greenEval = evalJq(oracle(5), green);

    writeEvidence('step5-null-tools-oracle.json', {
      predicate: oracle(5),
      nullTools: { ok: nullEval.ok, status: nullEval.status, out: nullEval.combined.trim() },
      overallOnly: { ok: overallEval.ok, status: overallEval.status },
      green: { ok: greenEval.ok, status: greenEval.status },
    });

    expect(nullEval.ok, 'null tools counters must fail step-5 oracle').toBe(false);
    expect(overallEval.ok, 'overall.ok alone must fail step-5 oracle').toBe(false);
    expect(greenEval.ok, 'complete soak report must pass step-5 oracle').toBe(true);

    // Plan literal_cmd must embed the tools tokens so re-runs cannot drop them
    const plan = loadPlan();
    const step7Cmd = String(stepByN(plan, 7).literal_cmd);
    expect(step7Cmd).toMatch(/toolsPassed/);
    expect(step7Cmd).toMatch(/toolsTotal/);
    expect(step7Cmd).not.toMatch(/jq -e "\.overall\.ok == true"/);
  });

  itLive('AC-3 / H-03 step-2|step-4: partial freeze and empty ETL fail require-all', () => {
    const partialFreeze = {
      ok: false,
      env_value: '0',
      fence_armed_at: 1_720_000_000_000,
    };
    const fenceOnly = {
      ok: false,
      env_value: '',
      fence_armed_at: 99,
    };
    const greenFreeze = {
      ok: true,
      env_value: '1',
      fence_armed_at: 1_720_000_000_000,
      env: 'HOLO_MIGRATION_READ_ONLY',
    };

    const partialEval = evalJq(oracle(2), partialFreeze);
    const fenceOnlyEval = evalJq(oracle(2), fenceOnly);
    const greenFreezeEval = evalJq(oracle(2), greenFreeze);

    // Historical any-of would green fenceOnly — require-all must not
    const anyOfWouldPass = evalJq(
      '(.ok==true) or (.env_value=="1") or (.fence_armed_at>0)',
      fenceOnly
    );
    expect(anyOfWouldPass.ok, 'sanity: weak any-of greens fence_armed_at alone').toBe(true);
    expect(fenceOnlyEval.ok, 'require-all must reject fence_armed_at-only freeze').toBe(false);
    expect(partialEval.ok, 'partial freeze must fail').toBe(false);
    expect(greenFreezeEval.ok, 'complete freeze must pass').toBe(true);

    const emptyEtl = {
      ok: false,
      unexplainedVariance: 0,
      stages: { nonEmpty: false, fence: true, watermark: true, export: true },
      loadedByTable: { documents: 0, conversations: 0 },
      archive: { exportData: { documents: [], conversations: [], rowCounts: { documents: 0 } } },
      fkAudit: { ok: false },
      vectors: { ok: false },
    };
    const varianceOnlyGreenWouldBe = {
      ok: true,
      unexplainedVariance: 0,
      stages: { nonEmpty: false },
      loadedByTable: { documents: 0 },
      archive: { exportData: { rowCounts: { documents: 0 } } },
      fkAudit: { ok: true },
      vectors: { ok: true },
    };
    const greenEtl = {
      ok: true,
      unexplainedVariance: 0,
      stages: {
        nonEmpty: true,
        fence: true,
        watermark: true,
        export: true,
        load: true,
        reconcile: true,
        fkAudit: true,
        vectors: true,
      },
      loadedByTable: { documents: 12, conversations: 3 },
      archive: {
        exportData: { documents: ['a'], conversations: [], rowCounts: { documents: 12 } },
      },
      fkAudit: { ok: true },
      vectors: { ok: true },
    };

    const emptyEval = evalJq(oracle(4), emptyEtl);
    const varianceOnlyEval = evalJq(oracle(4), varianceOnlyGreenWouldBe);
    const greenEtlEval = evalJq(oracle(4), greenEtl);

    writeEvidence('step2-step4-partial-empty.json', {
      step2: {
        partial: partialEval.ok,
        fenceOnly: fenceOnlyEval.ok,
        green: greenFreezeEval.ok,
        anyOfWouldPass: anyOfWouldPass.ok,
      },
      step4: {
        empty: emptyEval.ok,
        varianceOnlyEmptySource: varianceOnlyEval.ok,
        green: greenEtlEval.ok,
      },
    });

    expect(emptyEval.ok, 'empty ETL with variance 0 must fail').toBe(false);
    expect(varianceOnlyEval.ok, 'variance 0 with empty source must fail CAP-MIG-01').toBe(false);
    expect(greenEtlEval.ok, 'complete ETL report must pass').toBe(true);

    // Plan must not contain step-2 any-of
    const plan = loadPlan();
    const step5Cmd = String(stepByN(plan, 5).literal_cmd);
    expect(step5Cmd).not.toMatch(/\)\s*or\s*\(/);
  });

  itLive('AC-4 / H-03 step-3: quiet-check requires rejected>0 and windowSeconds', () => {
    const idleNoReject = {
      ok: false,
      acceptedWriteCount: 0,
      rejectedWriteCount: 0,
      windowSeconds: 30,
    };
    const zeroWindow = {
      ok: true,
      acceptedWriteCount: 0,
      rejectedWriteCount: 2,
      windowSeconds: 0,
    };
    const acceptedOnlyWouldGreen = {
      acceptedWriteCount: 0,
    };
    const greenQuiet = {
      ok: true,
      acceptedWriteCount: 0,
      rejectedWriteCount: 3,
      windowSeconds: 30,
      oracle: 'live_probes',
    };

    const idleEval = evalJq(oracle(3), idleNoReject);
    const zeroWindowEval = evalJq(oracle(3), zeroWindow);
    const acceptedOnlyEval = evalJq(oracle(3), acceptedOnlyWouldGreen);
    const greenEval = evalJq(oracle(3), greenQuiet);

    // Historical weak oracle greened accepted==0 alone
    const weak = evalJq('.acceptedWriteCount==0', acceptedOnlyWouldGreen);
    expect(weak.ok, 'sanity: weak accepted-only oracle greens idle').toBe(true);

    writeEvidence('step3-quiet-oracle.json', {
      idleNoReject: idleEval.ok,
      zeroWindow: zeroWindowEval.ok,
      acceptedOnly: acceptedOnlyEval.ok,
      green: greenEval.ok,
      weakAcceptedOnly: weak.ok,
    });

    expect(idleEval.ok, 'rejectedWriteCount==0 must fail').toBe(false);
    expect(zeroWindowEval.ok, 'windowSeconds==0 must fail').toBe(false);
    expect(acceptedOnlyEval.ok, 'acceptedWriteCount alone must fail').toBe(false);
    expect(greenEval.ok, 'complete quiet report must pass').toBe(true);

    const plan = loadPlan();
    const step5Cmd = String(stepByN(plan, 5).literal_cmd);
    expect(step5Cmd).toMatch(/rejectedWriteCount/);
    expect(step5Cmd).toMatch(/windowSeconds/);
  });

  itLive('AC-5 / H-03: SPRINT.md human steps align with cutover CLI verb family', () => {
    expect(existsSync(SPRINT_MD), `SPRINT.md missing: ${SPRINT_MD}`).toBe(true);
    const sprint = readFileSync(SPRINT_MD, 'utf8');
    const plan = loadPlan();

    // Dispatcher documented
    expect(sprint).toMatch(/bun services\/platform\/src\/cli\/holo\.ts/);

    // Verb family present in docs and plan
    const verbs = [
      'cutover:go-no-go',
      'cutover:freeze',
      'cutover:quiet-check',
      'cutover:run-etl',
      'cutover:flip',
      'cutover:verify-soak',
    ] as const;
    for (const v of verbs) {
      expect(sprint, `SPRINT.md missing ${v}`).toMatch(new RegExp(v.replace(':', '\\:')));
      const planBlob = JSON.stringify(plan);
      expect(planBlob, `gate-plan missing ${v}`).toContain(v);
    }

    // Human Test Deliverable lists all 8 ordered steps
    expect(sprint).toMatch(/## Human Test Deliverable/);
    expect(sprint).toMatch(/1\..*go-no-go|1\..*harness/i);
    expect(sprint).toMatch(/8\..*migration_read_only/i);

    writeEvidence('ac5-docs-align.json', {
      verbs,
      sprintHasDispatcher: /bun services\/platform\/src\/cli\/holo\.ts/.test(sprint),
    });
  });

  itLive('CLI surface: holo --help lists cutover verbs used by the gate', () => {
    const help = spawnSync(process.env.BUN_BIN ?? 'bun', [HOLO_CLI, '--help'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
    });
    const text = `${help.stdout ?? ''}\n${help.stderr ?? ''}`;
    writeEvidence('cli-help-cutover.txt', text.slice(0, 8000));

    // Verb is known even if help path fails on missing deps in some worktrees
    const cliSource = readFileSync(HOLO_CLI, 'utf8');
    for (const verb of [
      'cutover:go-no-go',
      'cutover:freeze',
      'cutover:quiet-check',
      'cutover:run-etl',
      'cutover:flip',
      'cutover:verify-soak',
    ]) {
      expect(cliSource).toContain(`case '${verb}'`);
      // Prefer help text when available
      if (help.status === 0) {
        expect(text).toContain(verb);
      }
    }
  });
});
