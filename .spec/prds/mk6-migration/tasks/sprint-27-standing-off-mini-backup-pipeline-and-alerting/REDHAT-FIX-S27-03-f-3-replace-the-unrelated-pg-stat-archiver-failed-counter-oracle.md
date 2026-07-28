# REDHAT-FIX-S27-03 — [F-3] Replace the unrelated pg_stat_archiver failed counter oracle

## What this does

Replace every gate/status health oracle that greps bare failed=0 with pipeline-level overall: OK (and complementary FAILED negation), so pg_stat_archiver.failed cannot greenwash a broken backup pipeline.

## Why

- Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-S27-03).
- Grounded in UC-PLAT-06 / T-PLAT-024 / CAP-BAK-01.

## How to verify

- `! rg -n 'failed=0' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → Exit 0 (no matches).
- `rg -n 'overall' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → Matches requiring overall: OK / forbidding FAILED.
- `bun services/platform/src/cli/holo.ts backup:induce-failure --mode kill --job wal_archive && out=$(bun services/platform/src/cli/holo.ts backup:status 2>&1 || true); printf '%s\n' "$out" | grep -qE 'overall:[[:space:]]+FAILED' && ! printf '%s\n' "$out" | grep -qE 'overall:[[:space:]]+OK'` → Exit 0 proving FAILED present and OK absent.
- `pnpm tsgo --noEmit && pnpm biome check .` → Exit 0.

## Scope

Writes: .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json (MODIFY — step 1 oracle), .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-verification.json (MODIFY if assertion fields change), services/platform/tests/integration/sprint27-backup-alerting-red.test.ts (MODIFY only if adding overall: OK status oracle coverage), .tmp/redhat-fix-s27-03/** (NEW evidence)

Prohibited: services/platform/src/backup/wal-archive.ts — do not change archiver reporting to hide failed=0, services/platform/src/backup/alerting.ts — formatBackupStatusText already correct; do not invent parallel health fiction, Induce-path product redesign (owned by REDHAT-FIX-S27-01), verify-gate-evidence.sh deep recompute redesign (owned by REDHAT-FIX-S27-09) except documenting overall: OK requirement

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-03 — [F-3] Replace the unrelated pg_stat_archiver failed counter oracle
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (75 min)
AGENT:      implementer=test-quality-reviewer | reviewer=code-reviewer
PROPOSED-BY: test-quality-reviewer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 27 — Standing Off-Mini Backup Pipeline and Alerting](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
gate-plan.json step(s) asserting backup health match overall:\s+OK (required AND, not OR with archiver tokens); expect_not_log_regex includes overall:\s+FAILED; no literal failed=0 in gate-plan; a seed where archiver failed=0 but heartbeats are overdue fails the step.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST assert pipeline health via overall: OK from holo backup:status (formatBackupStatusText / CLI status printer), not bare failed=0
- MUST require overall: OK as a non-optional match (AND with other required tokens; never sole OR-branch that can be skipped)
- MUST add expect_not_log_regex (or equivalent) for overall:\s+FAILED so a 5-job failure cannot pass
- MUST remove every bare failed=0 grep from gate-plan.json literal_cmd and assertion regexes
- MUST write RED evidence first: seed archiver failed=0 + pipeline FAILED and show current oracle passes / fixed oracle fails
- NEVER use bare failed=0 as a health oracle token
- NEVER treat pg_stat_archiver.failed_count as backup pipeline health
- NEVER use OR-alternation that lets archive_mode or r2_wal_objects alone satisfy a health step while overall is FAILED
- NEVER claim step 1 pass from read-only status while heartbeats are overdue/failed
- STRICTLY pipeline overall line is the health signal (alerting.ts:575 overall: OK | FAILED (N overdue/failed))
- STRICTLY depends on REDHAT-FIX-S27-02 so the status command is exercised after a real write-burst / healthy seed, not fiction
- STRICTLY flow_ref T-PLAT-024 / CAP-BAK-01 for PRIMARY AC

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: PRIMARY — overall: OK oracle replaces failed=0
- [ ] AC-2: Gamed token cannot pass — archiver zero + pipeline FAILED
- [ ] AC-3: Healthy pipeline still passes on overall: OK
- [ ] AC-4: Regression guard — reintroduce failed=0 is detectable
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — PRIMARY — overall: OK oracle replaces failed=0 (flow_ref T-PLAT-024)
  GIVEN gate-plan.json step asserting backup pipeline health and a live holo backup:status printer that emits overall: OK|FAILED and archiver failed=N
  WHEN  the step assertion and literal_cmd are rewritten
  THEN  health is proven only when overall:\s+OK matches; bare failed=0 is absent from gate-plan; expect_not_log_regex rejects overall:\s+FAILED
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-status+gate-plan
  VERIFY: `rg -n 'failed=0' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json → 0 matches; rg -n 'overall:\\s\+OK|overall:[[:space:]]+OK' that gate-plan.json → ≥1; jq -r '.steps[] | select(.n==1) | .assertion.expect_not_log_regex // empty' gate-plan.json | grep -Eq 'FAILED'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if gate still greps bare failed=0; expect_log_regex is OR-alternation that can pass on archive_mode alone while overall is FAILED; oracle only checks that backup:status exits 0; static string overall: OK is hardcoded into the log without running status
  START_REF: gate_plan_s27_step1
  MUST_OBSERVE: gate-plan has zero occurrences of failed=0; step health assertion requires overall: OK (non-optional); step health assertion forbids overall: FAILED via expect_not_log_regex or equivalent AND-negation
  MUST_NOT_OBSERVE: grep -q "failed=0" in any step literal_cmd; health pass on archiver failed=0 alone; OR-only expect_log_regex that omits overall: OK
  EVIDENCE: gate_plan_and_status_stdout (required_capture=True)

### AC-2 — Gamed token cannot pass — archiver zero + pipeline FAILED (flow_ref T-PLAT-024)
  GIVEN fixture pipeline_failed_archiver_zero (archiver failed=0, overall: FAILED)
  WHEN  the fixed step 1 command/oracle is executed against that seed
  THEN  the step fails (nonzero exit or assertion fail); a naive grep failed=0 would still match the log
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-status
  VERIFY: `seed overdue heartbeat; out=$(bun services/platform/src/cli/holo.ts backup:status 2>&1 || true); printf '%s\n' "$out" | grep -q 'failed=0' && printf '%s\n' "$out" | grep -qE 'overall:[[:space:]]+FAILED' && ! printf '%s\n' "$out" | grep -qE 'overall:[[:space:]]+OK'; then run fixed step assertion and expect fail`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if fixed oracle still passes when overall is FAILED; test only asserts that failed=0 appears without checking overall FAILED fail-closed; implementation deletes archiver line so failed=0 disappears without proving overall binding
  START_REF: pipeline_failed_archiver_zero
  MUST_OBSERVE: status stdout contains archiver failed=0; status stdout contains overall: FAILED; fixed gate assertion exit != 0
  MUST_NOT_OBSERVE: fixed assertion exit 0 on FAILED pipeline; overall: OK while any job is overdue/failed
  EVIDENCE: stdout (required_capture=True)

### AC-3 — Healthy pipeline still passes on overall: OK (flow_ref T-PLAT-024)
  GIVEN fixture pipeline_healthy_overall_ok after REDHAT-FIX-S27-02 write-burst / healthy seed
  WHEN  the fixed step 1 command/oracle runs
  THEN  step exits 0 and log contains overall: OK with no overall: FAILED
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-status+gate
  VERIFY: `runHealthy/write-burst seed then fixed step 1 → exit 0; grep -E 'overall:[[:space:]]+OK'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if oracle requires tokens the healthy path never prints; healthy seed still has overdue heartbeats; step only greps archive_mode without overall: OK
  START_REF: pipeline_healthy_overall_ok
  MUST_OBSERVE: step exit 0; overall: OK in step log; no overall: FAILED in step log
  MUST_NOT_OBSERVE: step exit 0 with overall: FAILED present; reliance on failed=0 for pass
  EVIDENCE: gate_step_log (required_capture=True)

### AC-4 — Regression guard — reintroduce failed=0 is detectable (flow_ref T-PLAT-024)
  GIVEN fixed gate-plan with zero failed=0 tokens
  WHEN  a CI/script check scans gate-plan.json for bare failed=0 health greps
  THEN  the scan is documented in verification_gates and fails if failed=0 returns
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: repo-grep
  VERIFY: `! rg -n 'failed=0' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if no automated ban remains and failed=0 can be re-added silently; ban only comments without rg gate; ban matches only comments but leaves literal_cmd intact
  START_REF: gate_plan_s27_step1
  MUST_OBSERVE: ban grep exit 0 on fixed plan; ban grep exit != 0 when failed=0 is reinserted into a temp plan
  MUST_NOT_OBSERVE: failed=0 present in committed gate-plan.json; ban implemented as documentation-only
  EVIDENCE: stdout (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | gate-plan.json contains zero bare failed=0 tokens and requires overall: OK for health | AC-1 | `! rg -n 'failed=0' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json && rg -n 'overall' that file | head` |
| TC-2 | When archiver failed=0 but pipeline FAILED, fixed assertion fails | AC-2 | `induce overdue/failed job; run fixed step assertion; expect nonzero` |
| TC-3 | Healthy overall: OK seed passes fixed assertion | AC-3 | `healthy seed; fixed step 1 exit 0` |
| TC-4 | Ban grep fails closed if failed=0 is reintroduced | AC-4 | `temp inject failed=0 into copy of gate-plan; ban command exit != 0` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json (MODIFY — step 1 oracle)
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-verification.json (MODIFY if assertion fields change)
- services/platform/tests/integration/sprint27-backup-alerting-red.test.ts (MODIFY only if adding overall: OK status oracle coverage)
- .tmp/redhat-fix-s27-03/** (NEW evidence)
writeProhibited:
- services/platform/src/backup/wal-archive.ts — do not change archiver reporting to hide failed=0
- services/platform/src/backup/alerting.ts — formatBackupStatusText already correct; do not invent parallel health fiction
- Induce-path product redesign (owned by REDHAT-FIX-S27-01)
- verify-gate-evidence.sh deep recompute redesign (owned by REDHAT-FIX-S27-09) except documenting overall: OK requirement

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T054039Z.md:42-47 — F-3 CRITICAL — failed=0 matches pg_stat_archiver; fix overall: OK
2. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json:10-20 — step 1 literal_cmd greps failed=0; weak OR expect_log_regex
3. services/platform/src/cli/holo.ts:2174-2180 — archiver: last=… failed=${snap.archiver.failed_count} — the colliding token source
4. services/platform/src/backup/alerting.ts:563-576 — formatBackupStatusText overall: OK | FAILED (N overdue/failed) — correct pipeline oracle
5. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/D04-05-backup-failure-overdue-alerting-no-dashboard-polling.md:107-115 — AC-3 backup:status prints OVERDUE/OK per job — health is heartbeat-derived
6. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:53-59 — T-PLAT-024 backup failure/overdue alert window

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- `PLATFORM_IT=1 pnpm vitest run <path>` exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-sprint27-20260728T054039Z.md, services/platform/src/backup/alerting.ts
Interaction notes:
- Depends on REDHAT-FIX-S27-02 so step 1 is a real write-burst + health check, not read-only status theatre.
- S27-09 will fail-close OR-alternation gaming; this task must still ship a strong non-gamed token (overall: OK) so recompute has something real to bind.
Pattern: Gate health = parse pipeline overall line from backup:status (and optionally JSON --json heartbeats[].flag). Negate FAILED. Ban bare failed=0.
Pattern source: alerting.ts:563-576 formatBackupStatusText
Anti-pattern: grep failed=0 against archiver: last=… failed=0 count=N — collides with Postgres internal counter and passed while overall: FAILED (5 overdue/failed).

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- No gamed token in gate-plan: `! rg -n 'failed=0' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → Exit 0 (no matches).
- overall OK required: `rg -n 'overall' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → Matches requiring overall: OK / forbidding FAILED.
- Negative seed fails: `bun services/platform/src/cli/holo.ts backup:induce-failure --mode kill --job wal_archive && out=$(bun services/platform/src/cli/holo.ts backup:status 2>&1 || true); printf '%s\n' "$out" | grep -qE 'overall:[[:space:]]+FAILED' && ! printf '%s\n' "$out" | grep -qE 'overall:[[:space:]]+OK'` → Exit 0 proving FAILED present and OK absent.
- Typecheck/lint if tests touched: `pnpm tsgo --noEmit && pnpm biome check .` → Exit 0.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: test-quality-reviewer
- Reviewer: code-reviewer
- Rationale: Owns test-reality / oracle strength for CAP-BAK-01. F-3 is a provably-gamed gate token (failed=0 matches Postgres pg_stat_archiver, not pipeline health); fixing it requires rewriting the gate oracle so a FAILED pipeline cannot pass green.
- Proposed by: test-quality-reviewer

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: [CAP-BAK-01]
- provides: ['pipeline-overall-ok-oracle', 'anti-pg-stat-archiver-token-ban', 'gate-plan-step1-health-assertion-fix']
- consumes: ['holo backup:status overall line (alerting.ts formatBackupStatusText)', 'REDHAT-FIX-S27-02 real write-burst / healthy pipeline seed', 'gate-plan.json + .gate-evidence recompute path']
- boundary_contracts: ['backup:status stdout overall: OK|FAILED → gate oracle (pipeline health, not pg_stat_archiver)', 'gate-plan expect_log_regex → verify-gate-evidence recompute (must not pass on archiver failed=0 alone)']

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- /Users/inference1/Projects/brain/docs/TESTING-HIERARCHY.md
- /Users/inference1/Projects/brain/docs/ANTI-STUB-REVIEW.md
- /Users/inference1/Projects/brain/docs/TDD-METHODOLOGY.md
- /Users/inference1/Projects/brain/docs/kanban/SCENARIO-CONTRACT-V1.md

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['REDHAT-FIX-S27-02']
- blocks: ['REDHAT-FIX-S27-09']

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T054039Z.md (REDHAT-FIX-S27-03)
- CAP-BAK-01 remediation — gate honesty + production-truth.

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-03",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "pipeline_failed_archiver_zero": {
      "description": "Postgres pg_stat_archiver.failed_count=0 while backup_heartbeat has \u22651 overdue/failed job so backup:status prints archiver failed=0 AND overall: FAILED (N overdue/failed).",
      "seed_method": "cli",
      "records": [
        "bun services/platform/src/cli/holo.ts backup:induce-failure --mode kill --job wal_archive (or leftover poisoned heartbeats from prior gate)",
        "holo backup:status shows archiver: \u2026 failed=0 \u2026",
        "holo backup:status shows overall: FAILED (N overdue/failed) with N>=1"
      ]
    },
    "pipeline_healthy_overall_ok": {
      "description": "All backup_heartbeat rows fresh+success after REDHAT-FIX-S27-02 write-burst / healthy seed so backup:status prints overall: OK.",
      "seed_method": "cli",
      "records": [
        "all jobs flag=OK",
        "overall: OK present",
        "overall: FAILED absent"
      ]
    },
    "gate_plan_s27_step1": {
      "description": "Current sprint-27 gate-plan.json step 1 with gamed failed=0 oracle (pre-fix).",
      "seed_method": "public_api",
      "records": [
        "gate-plan.json:15 literal_cmd includes grep -q \"failed=0\"",
        "expect_log_regex uses OR-alternation archive_mode|pgbackrest archive-push|r2_wal_objects"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN gate-plan health step WHEN rewritten THEN overall: OK is required, overall: FAILED is forbidden, and bare failed=0 is removed",
      "verify": "rg ban + jq assertion fields on gate-plan.json",
      "primary": true,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-status+gate-plan",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "gate still greps bare failed=0",
            "OR-alternation can pass without overall: OK",
            "static overall: OK without running status"
          ]
        },
        "evidence": {
          "artifact_type": "gate_plan_and_status_stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "gate_plan_s27_step1",
            "action": {
              "actor": "operator",
              "steps": [
                "rewrite step oracle",
                "ban failed=0"
              ]
            },
            "end_state": {
              "must_observe": [
                "zero failed=0 in gate-plan",
                "overall: OK required",
                "FAILED forbidden"
              ],
              "must_not_observe": [
                "bare failed=0 health grep",
                "OR-only health regex without overall: OK"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN archiver failed=0 AND overall FAILED WHEN fixed oracle runs THEN step fails",
      "verify": "seed + fixed assertion exit != 0",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-status",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "fixed oracle still passes on FAILED pipeline"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "pipeline_failed_archiver_zero",
            "action": {
              "actor": "test",
              "steps": [
                "status",
                "assert fixed fails"
              ]
            },
            "end_state": {
              "must_observe": [
                "failed=0 present",
                "overall FAILED present",
                "assertion fail"
              ],
              "must_not_observe": [
                "assertion pass"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN healthy overall OK WHEN fixed oracle runs THEN step passes",
      "verify": "healthy seed + fixed step exit 0",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-status+gate",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "oracle cannot pass on true healthy pipeline"
          ]
        },
        "evidence": {
          "artifact_type": "gate_step_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "pipeline_healthy_overall_ok",
            "action": {
              "actor": "operator",
              "steps": [
                "run fixed step"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit 0",
                "overall: OK"
              ],
              "must_not_observe": [
                "overall: FAILED"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN fixed plan WHEN failed=0 is reinserted THEN ban fails closed",
      "verify": "temp inject + ban grep",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "repo-grep",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "no ban automation"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "gate_plan_s27_step1",
            "action": {
              "actor": "ci",
              "steps": [
                "ban on fixed",
                "ban on injected"
              ]
            },
            "end_state": {
              "must_observe": [
                "ban pass on fixed",
                "ban fail on inject"
              ],
              "must_not_observe": [
                "failed=0 in committed plan"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "gate-plan has no failed=0 and requires overall OK",
      "verify": "rg ban + overall OK presence",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "gamed archiver-zero seed fails fixed oracle",
      "verify": "seed + assertion fail",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "healthy seed passes fixed oracle",
      "verify": "healthy + assertion pass",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "ban detects reintroduced failed=0",
      "verify": "inject + ban fail",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
