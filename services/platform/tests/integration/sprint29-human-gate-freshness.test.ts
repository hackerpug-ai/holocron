/**
 * REDHAT-FIX-S29-R2-H01 + REDHAT-FIX-S29-R3-C01 — Sprint 29 human-gate freshness.
 *
 * AC-1 (PRIMARY / RED→GREEN): Authoritative gate-results.json MUST NOT present
 * historical false-pass run_id 20260802T004525Z as verdict:pass for the remediated
 * gate-plan/source. While that stale pass is still current, this suite fails closed.
 * After GREEN re-run: new run_id, evidence binds SHA + deployed identity, honest verdict.
 *
 * R3-C01 (CRITICAL): gate-results.git_sha / source_sha MUST equal `git rev-parse HEAD`
 * of the candidate worktree — not merely "looks like a SHA". local-process:// identity
 * is recorded honestly but is non-landing; 6/6 against a deployed HTTP identity is
 * required before landing claims.
 *
 * AC-2–AC-5: re-run harness executes gate-plan literal_cmds via real cutover CLI;
 * step1 failed_count==0; sibling incomplete does not authorize fake 6/6.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint29-human-gate-freshness.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';

const itLive = PLATFORM_IT ? it : it.skip;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const SPRINT_DIR = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip'
);
const GATE_PLAN = resolve(SPRINT_DIR, 'gate-plan.json');
const GATE_RESULTS = resolve(SPRINT_DIR, 'gate-results.json');
const GATE_RESULTS_MD = resolve(SPRINT_DIR, 'GATE-RESULTS.md');
const SPRINT_MD = resolve(SPRINT_DIR, 'SPRINT.md');
const EVIDENCE_ROOT = resolve(SPRINT_DIR, '.gate-evidence');
const STALE_RUN_ID = '20260802T004525Z';
const STALE_EVIDENCE = resolve(EVIDENCE_ROOT, STALE_RUN_ID);
const RERUN_SCRIPT = resolve(REPO_ROOT, 'scripts/run-sprint29-human-gate-rerun.sh');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const HOLO_CLI_TOKEN = 'bun services/platform/src/cli/holo.ts';
/** R2-H01 lineage evidence root (preserved). */
const EVIDENCE_DIR_R2 = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S29-R2-H01');
/** R3-C01 evidence root — HEAD-bound freshness + landing eligibility. */
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S29-R3-C01');
const LOCAL_PROCESS_IDENTITY_RE = /^local-process:\/\//i;

type GateResults = {
  run_id?: string;
  verdict?: string;
  steps_total?: number;
  steps_executed?: number;
  steps_passed?: number;
  steps_failed?: number;
  source_sha?: string;
  git_sha?: string;
  tree_sha?: string;
  deployed_base_url?: string;
  service_identity?: string;
  landing_eligible?: boolean;
  identity_class?: string;
  started_at?: string;
  finished_at?: string;
  written_at?: string;
  meta?: {
    source_sha?: string;
    git_sha?: string;
    deployed_base_url?: string;
    service_identity?: string;
    sibling_blockers_for_full_6_of_6?: string[];
    task_id?: string;
    landing_eligible?: boolean;
    identity_class?: string;
    non_landing_reason?: string;
    head_bound?: boolean;
  };
  steps?: Array<{
    n: number;
    executed?: boolean;
    result?: string;
    log?: string;
    exit_code?: number;
  }>;
};

function revParseHead(): string {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  expect(head.status, `git rev-parse HEAD failed: ${head.stderr ?? ''}`).toBe(0);
  const sha = (head.stdout ?? '').trim();
  expect(sha).toMatch(/^[0-9a-f]{40}$/);
  return sha;
}

/**
 * R3-C01: gate-results must bind to the code under test.
 * Prefer exact `git rev-parse HEAD` equality. If HEAD only adds evidence artifacts
 * on top of the bound SHA (self-referential commit-hash problem), allow git_sha ===
 * HEAD~N when the diff from git_sha..HEAD is evidence-only paths.
 */
function assertGitShaBoundToHead(gitSha: string): { head: string; mode: string } {
  const head = revParseHead();
  if (gitSha === head) {
    return { head, mode: 'exact-HEAD' };
  }

  // Evidence-only delta allowance (never silent ancestor drift across product code).
  const mergeBase = spawnSync('git', ['merge-base', gitSha, head], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const base = (mergeBase.stdout ?? '').trim();
  expect(
    mergeBase.status,
    `git_sha ${gitSha} is not an ancestor of HEAD ${head} (stale ancestor binding forbidden)`
  ).toBe(0);
  expect(base).toBe(gitSha);

  const diff = spawnSync('git', ['diff', '--name-only', `${gitSha}..${head}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  expect(diff.status, `git diff ${gitSha}..${head} failed`).toBe(0);
  const files = (diff.stdout ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const evidenceOnly = files.every(
    (f) =>
      /gate-results\.json$/.test(f) ||
      /GATE-RESULTS\.md$/.test(f) ||
      /\/\.gate-evidence\//.test(f) ||
      /^\.tmp\//.test(f) ||
      /REDHAT-FIX-S29-R3-C01/.test(f)
  );
  expect(
    evidenceOnly && files.length > 0,
    `git_sha ${gitSha} != HEAD ${head}; diff includes non-evidence paths:\n${files.join('\n') || '(empty)'}`
  ).toBe(true);
  return { head, mode: 'evidence-only-delta' };
}

function isLocalProcessIdentity(identity: string | null | undefined): boolean {
  return LOCAL_PROCESS_IDENTITY_RE.test(String(identity ?? ''));
}

type GatePlan = {
  steps?: Array<{ n: number; method?: string; literal_cmd?: string; text?: string }>;
  remediation?: string;
  remediated_at?: string;
  dispatcher?: string;
};

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

function loadResults(): GateResults {
  expect(existsSync(GATE_RESULTS), `gate-results missing: ${GATE_RESULTS}`).toBe(true);
  return JSON.parse(readFileSync(GATE_RESULTS, 'utf8')) as GateResults;
}

function loadPlan(): GatePlan {
  expect(existsSync(GATE_PLAN), `gate-plan missing: ${GATE_PLAN}`).toBe(true);
  return JSON.parse(readFileSync(GATE_PLAN, 'utf8')) as GatePlan;
}

function sourceSha(r: GateResults): string | null {
  return r.source_sha ?? r.git_sha ?? r.tree_sha ?? r.meta?.source_sha ?? null;
}

function deployedIdentity(r: GateResults): string | null {
  return (
    r.deployed_base_url ??
    r.meta?.deployed_base_url ??
    r.service_identity ??
    r.meta?.service_identity ??
    null
  );
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
  return {
    ok: result.status === 0,
    status: result.status,
    combined: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  };
}

/** Current step1 oracle (C01 / H03) — never length-only. */
const STEP1_ORACLE =
  '.overall.ok == true and .failed_count == 0 and (.gates | length) == 8 and all(.gates[] | select(.collectedTests != null); .collectedTests > 0)';

/** Current step5 oracle — toolsPassed/toolsTotal non-null. */
const STEP5_ORACLE =
  '(.overall.ok == true) and ((.tools.toolsPassed // .toolsPassed) | type == "number") and ((.tools.toolsTotal // .toolsTotal) | type == "number") and ((.tools.toolsTotal // .toolsTotal) > 0) and ((.tools.toolsPassed // .toolsPassed) == (.tools.toolsTotal // .toolsTotal)) and ((.jobsAccounted // .jobs.jobsAccounted) == (.jobsTotal // .jobs.jobsTotal)) and (.article.ok == true) and (.honoWrite.ok == true) and (.reads.ok == true) and ((.zeroWritePath.status == "NOT_LANDED") or (.zeroWritePath.status == "BLOCKED")) and ((.engaged == true) or (.tools.ok == true))';

describe('REDHAT-FIX-S29-R2-H01 / R3-C01 sprint29 human-gate freshness', () => {
  beforeAll(() => {
    ensureEvidenceDir();
    mkdirSync(EVIDENCE_DIR_R2, { recursive: true });
    expect(PLATFORM_IT, 'PLATFORM_IT=1 required for R2-H01 freshness integration').toBe(true);
    expect(existsSync(HOLO_CLI), `holo CLI missing: ${HOLO_CLI}`).toBe(true);
    writeEvidence('boot.json', {
      task: 'REDHAT-FIX-S29-R3-C01',
      lineage: 'REDHAT-FIX-S29-R2-H01',
      gateResults: GATE_RESULTS,
      gatePlan: GATE_PLAN,
      staleRunId: STALE_RUN_ID,
      rerunScript: RERUN_SCRIPT,
      platformIt: PLATFORM_IT,
      head: revParseHead(),
    });
  });

  itLive(
    'AC-1 / R2-H01: refuses stale run_id 20260802T004525Z as current pass for remediated plan',
    () => {
      const results = loadResults();
      const plan = loadPlan();

      // Remediated plan markers (H03)
      expect(plan.remediation).toMatch(/REDHAT-FIX-S29-H03/);
      expect(String(plan.remediated_at ?? '')).toMatch(/20260802T020000Z|2026/);

      const isStalePass = results.run_id === STALE_RUN_ID && results.verdict === 'pass';

      writeEvidence('ac1-stale-check.json', {
        run_id: results.run_id,
        verdict: results.verdict,
        isStalePass,
        plan_remediation: plan.remediation,
        plan_remediated_at: plan.remediated_at,
        message: isStalePass
          ? `FAIL: run_id ${STALE_RUN_ID} still claims pass — not evidence for remediated plan/source`
          : `ok: current run_id=${results.run_id} verdict=${results.verdict}`,
      });

      // PRIMARY freshness oracle: fail closed while historical false-pass is still current.
      expect(
        isStalePass,
        `stale gate-results run_id ${STALE_RUN_ID} with verdict pass cannot certify remediated gate-plan (H03/C01). Re-run via scripts/run-sprint29-human-gate-rerun.sh`
      ).toBe(false);

      // If still somehow the historical id, must not be pass (double belt).
      if (results.run_id === STALE_RUN_ID) {
        expect(results.verdict).not.toBe('pass');
      }
    }
  );

  itLive(
    'AC-1 lineage: historical step1 length-only + failed_count=5 and step5 null-tools preserved & fail current oracles',
    () => {
      expect(
        existsSync(STALE_EVIDENCE),
        'historical false-pass evidence dir must be preserved'
      ).toBe(true);
      const step1Log = resolve(STALE_EVIDENCE, 'step1.log');
      const step5Log = resolve(STALE_EVIDENCE, 'step5.log');
      expect(existsSync(step1Log)).toBe(true);
      expect(existsSync(step5Log)).toBe(true);

      const s1 = readFileSync(step1Log, 'utf8');
      const s5 = readFileSync(step5Log, 'utf8');

      // Lineage signatures of the false-pass theatre
      expect(s1).toMatch(/length\s*==\s*8|gates\s*\|\s*length/);
      expect(s1).toMatch(/failed_count["\s:]+5|"failed_count":\s*5|failed_count.: 5/);
      expect(s1).toMatch(/GATE-EXIT=0/);
      // Historical step1 was jq-only peek, not cutover:go-no-go CLI
      expect(s1).not.toMatch(/cutover:go-no-go/);

      expect(s5).toMatch(/toolsPassed["\s:]+null|"toolsPassed":\s*null/);
      expect(s5).toMatch(/toolsTotal["\s:]+null|"toolsTotal":\s*null/);
      expect(s5).toMatch(/GATE-EXIT=0/);

      // Current oracles reject those fixtures
      const lengthOnlyReport = {
        overall: { ok: false },
        failed_count: 5,
        gates: Array.from({ length: 8 }, (_, i) => ({
          name: `g${i}`,
          pass: i < 3,
          collectedTests: i < 3 ? 1 : 0,
        })),
      };
      const lengthOnlyEval = evalJq(STEP1_ORACLE, lengthOnlyReport);
      expect(lengthOnlyEval.ok, 'failed_count=5 must fail step1 oracle').toBe(false);

      const weakLengthOnly = evalJq('.gates | length == 8', lengthOnlyReport);
      expect(weakLengthOnly.ok, 'sanity: historical length-only greened 8 gates').toBe(true);

      const nullTools = {
        overall: { ok: true },
        toolsPassed: null,
        toolsTotal: null,
        jobsAccounted: 16,
        jobsTotal: 16,
        article: { ok: true },
        honoWrite: { ok: true },
        reads: { ok: true },
        zeroWritePath: { status: 'NOT_LANDED' },
        engaged: true,
        tools: { ok: true, toolsPassed: null, toolsTotal: null },
      };
      const nullEval = evalJq(STEP5_ORACLE, nullTools);
      expect(nullEval.ok, 'null tools counters must fail step5 oracle').toBe(false);

      writeEvidence('ac1-lineage-oracles.json', {
        staleEvidence: STALE_EVIDENCE,
        step1_lengthOnlyWouldPass: weakLengthOnly.ok,
        step1_currentOracle: lengthOnlyEval.ok,
        step5_nullToolsOracle: nullEval.ok,
        artifact: 'redhat-fix-s29-r2',
      });
    }
  );

  itLive(
    'AC-2 / R2-H01: re-run harness + gate-plan bind all 6 steps to real cutover CLI and conjunctive oracles',
    () => {
      expect(existsSync(RERUN_SCRIPT), `re-run harness missing: ${RERUN_SCRIPT}`).toBe(true);
      const script = readFileSync(RERUN_SCRIPT, 'utf8');
      expect(script).toMatch(/REDHAT-FIX-S29-R2-H01|REDHAT-FIX-S29-R3-C01/);
      expect(script).toMatch(/gate-plan\.json/);
      expect(script).toMatch(/literal_cmd/);
      expect(script).toMatch(/20260802T004525Z/);
      expect(script).toMatch(/cutover:|HOLO_CLI|holo\.ts/);
      // Must refuse forging pass / refuse stale id
      expect(script).toMatch(/never forge|refuse|honest/i);
      expect(script).not.toMatch(/PATH holo stub|holo cutover/);
      // R3-C01: harness must bind evidence to HEAD and classify landing eligibility
      expect(script).toMatch(/rev-parse HEAD/);
      expect(script).toMatch(/landing_eligible/);
      expect(script).toMatch(/local-process/);

      const plan = loadPlan();
      expect(plan.dispatcher).toContain('services/platform/src/cli/holo.ts');
      const steps = plan.steps ?? [];
      expect(steps.map((s) => s.n).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);

      const verbs: Record<number, RegExp> = {
        1: /cutover:go-no-go/,
        2: /cutover:freeze/,
        3: /cutover:quiet-check/,
        4: /cutover:run-etl/,
        5: /cutover:verify-soak/,
        6: /migration_read_only/,
      };

      for (const n of [1, 2, 3, 4, 5, 6]) {
        const step = steps.find((s) => s.n === n);
        expect(step, `step ${n}`).toBeTruthy();
        const cmd = String(step?.literal_cmd ?? '');
        expect(step?.method).toBe('real-cli');
        expect(cmd).toContain(HOLO_CLI_TOKEN);
        const verbRe = verbs[n];
        expect(verbRe, `verb regex for step ${n}`).toBeTruthy();
        expect(cmd).toMatch(verbRe as RegExp);
        expect(cmd).toMatch(/jq\s+-e/);
      }

      const step1 = String(steps.find((s) => s.n === 1)?.literal_cmd ?? '');
      expect(step1).toMatch(/failed_count\s*==\s*0/);
      expect(step1).toMatch(/overall\.ok\s*==\s*true/);
      expect(step1).not.toMatch(/jq -e "\.gates \| length == 8"/);

      const step5 = String(steps.find((s) => s.n === 5)?.literal_cmd ?? '');
      expect(step5).toMatch(/toolsPassed/);
      expect(step5).toMatch(/toolsTotal/);
      expect(step5).toMatch(/cutover:flip/);

      writeEvidence('ac2-harness-plan.json', {
        rerunScript: RERUN_SCRIPT,
        stepCount: steps.length,
        step1_has_failed_count: /failed_count\s*==\s*0/.test(step1),
        step5_has_tools: /toolsPassed/.test(step5) && /toolsTotal/.test(step5),
      });
    }
  );

  itLive(
    'AC-3 / R2-H01 + R3-C01: fresh gate-results bind new run_id, HEAD-equal SHA, identity, step logs',
    () => {
      const results = loadResults();
      const runId = String(results.run_id ?? '');
      const head = revParseHead();

      expect(runId.length, 'run_id required').toBeGreaterThan(0);
      expect(runId).not.toBe(STALE_RUN_ID);

      const sha = sourceSha(results);
      expect(sha, 'source_sha/git_sha required on fresh results').toBeTruthy();
      expect(String(sha)).toMatch(/^[0-9a-f]{40}$/);
      // R3-C01 PRIMARY: bind to HEAD (exact) or evidence-only delta off the bound code SHA —
      // never mere "looks like a SHA" and never silent ancestor drift across product code.
      const bind = assertGitShaBoundToHead(String(sha));
      expect(String(results.git_sha ?? '')).toBe(String(sha));
      expect(String(results.source_sha ?? results.git_sha ?? '')).toBe(String(sha));
      if (results.meta?.source_sha) {
        expect(String(results.meta.source_sha)).toBe(String(sha));
      }
      if (results.meta?.git_sha) {
        expect(String(results.meta.git_sha)).toBe(String(sha));
      }
      // Prefer exact HEAD when working tree has no post-bind commits
      if (bind.mode === 'exact-HEAD') {
        expect(String(sha)).toBe(head);
      }

      const identity = deployedIdentity(results);
      expect(identity, 'deployed_base_url or service_identity required').toBeTruthy();
      expect(String(identity).length).toBeGreaterThan(3);

      // Timestamps
      const ts = results.finished_at ?? results.written_at ?? results.started_at;
      expect(ts, 'timestamp required').toBeTruthy();

      // Evidence dir with six non-empty step logs
      const runEvidence = resolve(EVIDENCE_ROOT, runId);
      expect(existsSync(runEvidence), `evidence dir missing for ${runId}`).toBe(true);
      for (const n of [1, 2, 3, 4, 5, 6]) {
        const logPath = resolve(runEvidence, `step${n}.log`);
        expect(existsSync(logPath), `missing ${logPath}`).toBe(true);
        const st = statSync(logPath);
        expect(st.size, `empty step${n}.log`).toBeGreaterThan(20);
        const body = readFileSync(logPath, 'utf8');
        // Real command transcript markers
        expect(body).toMatch(
          /CMD:|cutover:|bun services\/platform\/src\/cli\/holo\.ts|migration_read_only/
        );
        expect(body).toMatch(/GATE-EXIT=|@@GATE-EXIT=/);
        // Logs must cite the HEAD-bound source_sha (R3-C01)
        expect(body).toMatch(new RegExp(head.slice(0, 12)));
      }

      // GATE-RESULTS.md cites the fresh run_id and HEAD
      expect(existsSync(GATE_RESULTS_MD)).toBe(true);
      const md = readFileSync(GATE_RESULTS_MD, 'utf8');
      expect(md).toContain(runId);
      expect(md).toContain(head);
      // Must not present only the stale id as current VERIFIED 6/6
      if (results.verdict === 'pass') {
        expect(md).toMatch(new RegExp(runId));
        expect(results.steps_passed).toBe(6);
        expect(results.steps_executed).toBe(6);
      }

      // Historical lineage still present (not deleted)
      expect(existsSync(STALE_EVIDENCE)).toBe(true);

      writeEvidence('ac3-fresh-meta.json', {
        run_id: runId,
        source_sha: sha,
        git_sha: results.git_sha,
        head: bind.head,
        head_equal: sha === bind.head,
        bind_mode: bind.mode,
        deployed_identity: identity,
        verdict: results.verdict,
        steps_passed: results.steps_passed,
        steps_executed: results.steps_executed,
        evidence_dir: runEvidence,
        historical_preserved: existsSync(STALE_EVIDENCE),
      });
    }
  );

  itLive(
    'R3-C01: local-process identity is non-landing; 6/6 pass requires deployed identity for landing',
    () => {
      const results = loadResults();
      const head = revParseHead();
      const identity = String(deployedIdentity(results) ?? '');
      const local = isLocalProcessIdentity(identity);
      const landingEligible = results.landing_eligible ?? results.meta?.landing_eligible ?? null;
      const identityClass =
        results.identity_class ??
        results.meta?.identity_class ??
        (local ? 'local-process' : 'deployed-http');

      // HEAD binding still required (exact or evidence-only delta)
      assertGitShaBoundToHead(String(results.git_sha ?? ''));
      expect(String(results.git_sha ?? '')).toMatch(/^[0-9a-f]{40}$/);
      void head;

      if (local) {
        // Self-minted localhost / local-process:// is honest but never landable
        expect(
          landingEligible === false || landingEligible === null,
          'local-process identity must not set landing_eligible=true'
        ).toBe(true);
        if (landingEligible !== null) {
          expect(landingEligible).toBe(false);
        }
        expect(String(identityClass)).toMatch(/local-process/i);
        // Even a forged 6/6 under local-process cannot certify landing
        if (results.verdict === 'pass' && results.steps_passed === 6) {
          expect(
            results.landing_eligible ?? results.meta?.landing_eligible,
            '6/6 under local-process:// is non-landing (R3-C01)'
          ).toBe(false);
        }
      } else {
        // Deployed HTTP identity may be landing-eligible only when 6/6 and HEAD-bound
        const canLand =
          results.verdict === 'pass' &&
          results.steps_passed === 6 &&
          results.steps_executed === 6 &&
          String(results.git_sha) === head;
        if (landingEligible !== null) {
          expect(landingEligible).toBe(canLand);
        }
      }

      // Harness must refuse claiming landing for local-process theatre
      const script = readFileSync(RERUN_SCRIPT, 'utf8');
      expect(script).toMatch(/landing_eligible|non-landing|local-process/i);
      expect(script).toMatch(/REDHAT-FIX-S29-R3-C01|R3-C01/);
      expect(script).toMatch(/rev-parse HEAD|git_sha/);

      writeEvidence('r3-c01-identity-landing.json', {
        head,
        git_sha: results.git_sha,
        identity,
        local_process: local,
        identity_class: identityClass,
        landing_eligible: landingEligible,
        verdict: results.verdict,
        steps_passed: results.steps_passed,
        note: local
          ? 'local-process://holo-cli recorded honestly; non-landing for cutover approval'
          : 'deployed identity present; landing requires 6/6 + HEAD bind',
      });
    }
  );

  itLive(
    'AC-4 / R2-H01: step1 go-no-go oracle requires overall.ok AND failed_count==0 (not length-only)',
    () => {
      const plan = loadPlan();
      const step1 = plan.steps?.find((s) => s.n === 1);
      const cmd = String(step1?.literal_cmd ?? '');
      expect(cmd).toMatch(/cutover:go-no-go/);
      expect(cmd).toMatch(/failed_count\s*==\s*0/);
      expect(cmd).toMatch(/overall\.ok\s*==\s*true/);

      // Fixture: length 8 + failed_count 5 must fail
      const bad = {
        overall: { ok: true },
        failed_count: 5,
        gates: Array.from({ length: 8 }, (_, i) => ({
          name: `g${i}`,
          pass: false,
          collectedTests: 1,
        })),
      };
      // even if overall.ok true in fixture, failed_count forces fail under conjunctive oracle
      const badEval = evalJq(
        '.overall.ok == true and .failed_count == 0 and (.gates | length) == 8',
        bad
      );
      expect(badEval.ok).toBe(false);

      const green = {
        overall: { ok: true },
        failed_count: 0,
        gates: Array.from({ length: 8 }, (_, i) => ({
          name: `g${i}`,
          pass: true,
          collectedTests: 3,
        })),
      };
      const greenEval = evalJq(STEP1_ORACLE, green);
      expect(greenEval.ok).toBe(true);

      writeEvidence('ac4-step1-oracle.json', {
        bad_failed_count_5: badEval.ok,
        green: greenEval.ok,
        plan_embeds_failed_count: /failed_count\s*==\s*0/.test(cmd),
      });
    }
  );

  itLive(
    'AC-5 / R2-H01: honest sibling dependency — no fake 6/6; docs name R2-C01..C04 / R2-H02..H04',
    () => {
      const results = loadResults();
      const sprint = readFileSync(SPRINT_MD, 'utf8');
      const md = existsSync(GATE_RESULTS_MD) ? readFileSync(GATE_RESULTS_MD, 'utf8') : '';

      // Docs must name sibling blockers for full 6/6 honesty
      const docsBlob = `${sprint}\n${md}\n${JSON.stringify(results.meta ?? {})}`;
      expect(docsBlob).toMatch(/R2-C01|REDHAT-FIX-S29-R2-C01/);
      expect(docsBlob).toMatch(/R2-H02|REDHAT-FIX-S29-R2-H02|honest/);

      // No fake-pass: if pass then all counters match and run is not historical
      if (results.verdict === 'pass') {
        expect(results.run_id).not.toBe(STALE_RUN_ID);
        expect(results.steps_passed).toBe(results.steps_total);
        expect(results.steps_executed).toBe(results.steps_total);
        expect(results.steps_passed).toBe(6);
        for (const s of results.steps ?? []) {
          expect(s.executed).toBe(true);
          expect(s.result).toBe('pass');
        }
      } else {
        // partial/fail is allowed while siblings open — but must still be a fresh run
        expect(results.run_id).not.toBe(STALE_RUN_ID);
        expect(['fail', 'partial', 'blocked'].includes(String(results.verdict))).toBe(true);
        // Every claimed step was executed (honest executed:true)
        for (const s of results.steps ?? []) {
          expect(s.executed, `step ${s.n} must be executed`).toBe(true);
        }
      }

      // jq-equivalent gate honesty
      const honesty = evalJq(
        'if .verdict=="pass" then (.run_id != "20260802T004525Z" and .steps_passed == .steps_total and .steps_executed == .steps_total) else (.run_id != "20260802T004525Z") end',
        results
      );
      expect(honesty.ok, honesty.combined).toBe(true);

      writeEvidence('ac5-honest-sibling.json', {
        run_id: results.run_id,
        verdict: results.verdict,
        steps_passed: results.steps_passed,
        steps_total: results.steps_total,
        sibling_blockers: results.meta?.sibling_blockers_for_full_6_of_6 ?? null,
        honesty_ok: honesty.ok,
      });
    }
  );

  itLive('R2-H01 negative_control: empty/missing fresh evidence is not green', () => {
    // Sanity: stale evidence dir is not accepted as the only current evidence
    const results = loadResults();
    expect(results.run_id).not.toBe(STALE_RUN_ID);

    // Enumerate evidence roots — at least historical + current
    const dirs = readdirSync(EVIDENCE_ROOT).filter((d) => {
      try {
        return statSync(resolve(EVIDENCE_ROOT, d)).isDirectory();
      } catch {
        return false;
      }
    });
    expect(dirs).toContain(STALE_RUN_ID);
    expect(dirs).toContain(results.run_id);

    writeEvidence('negative-control.json', {
      evidence_dirs: dirs,
      current: results.run_id,
      stale_still_present: dirs.includes(STALE_RUN_ID),
    });
  });
});
