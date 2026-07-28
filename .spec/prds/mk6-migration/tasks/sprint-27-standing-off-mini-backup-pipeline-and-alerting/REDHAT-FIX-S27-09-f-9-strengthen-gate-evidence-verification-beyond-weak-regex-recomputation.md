# REDHAT-FIX-S27-09 — [F-9] Strengthen gate-evidence verification beyond weak regex recomputation

## What this does

Upgrade gate recompute so weak OR-alternation and gamed tokens (failed=0) cannot yield verified:true; prefer behavioral/structured assertions for CAP-BAK-01 steps.

## Why

- Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-S27-09).
- Grounded in UC-PLAT-06 / T-PLAT-024 / CAP-BAK-01.

## How to verify

- `bash /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/test-verify-gate-evidence.sh` → Exit 0; includes gamed token + OR gaming cases.
- `bash -lc 'set -e; D=$(mktemp -d); # build mini gamed fixture with overall FAILED + failed=0 and weak plan; run verify-gate-evidence; test fail'` → Recompute fails closed.
- `! rg -n 'failed=0' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → Exit 0.
- `bash -n /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/verify-gate-evidence.sh && bash -n /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/test-verify-gate-evidence.sh` → Exit 0.

## Scope

Writes: /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/verify-gate-evidence.sh (MODIFY — strong recompute), /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/test-verify-gate-evidence.sh (MODIFY — gamed/OR cases), .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json (MODIFY — structured asserts aligning with recompute), .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-verification.json (regenerate after strong run), .tmp/redhat-fix-s27-09/** (NEW fixtures/evidence)

Prohibited: Weakening other sprints' gates without compatibility path, Deleting recompute entirely, Claiming verified true without running the harness

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-09 — [F-9] Strengthen gate-evidence verification beyond weak regex recomputation
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P1
EFFORT:     M  (120 min)
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
Re-running recompute against the historical gamed step1 evidence fails; unit tests of verify-gate-evidence cover OR gaming and banned tokens; S27 gate-plan assertions are recompute-strong after S27-02/03.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST extend verify-gate-evidence.sh (or a sprint wrapper invoked as method) so recompute fails on banned tokens including bare failed=0 used as health oracle
- MUST reject pure OR-alternation health oracles that can pass on a single unrelated token when critical pipeline tokens are absent — require AND of required tokens or structured fields
- MUST add regression tests in test-verify-gate-evidence.sh proving gamed fixtures fail recompute
- MUST re-verify sprint-27 gate-plan after S27-02/03 so strong oracles + strong recompute both hold
- MUST document that mechanical recompute of weak regex is not proof of production behavior
- NEVER leave recompute as re.search(expect_re) only for CAP-BAK-01 health/alert steps
- NEVER allow verified:true when overall: FAILED present but failed=0 matched
- NEVER soft-warn on gamed tokens — fail closed
- NEVER invent probe results without running test-verify-gate-evidence.sh
- STRICTLY depends on S27-03 (and S27-02) so gate oracles themselves are strong; recompute strength without oracle rewrite is incomplete
- STRICTLY prefer behavioral assertions (JSON fields, exit codes, file artifacts) over regex where possible
- STRICTLY keep shared script backward compatible for other sprints or version the method string

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: PRIMARY — recompute fails closed on gamed failed=0 health oracle
- [ ] AC-2: OR-alternation cannot pass on single unrelated token
- [ ] AC-3: Strong evidence still passes recompute
- [ ] AC-4: Behavioral / structured assertion path preferred for backup steps
- [ ] AC-5: test-verify-gate-evidence.sh covers new rules
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — PRIMARY — recompute fails closed on gamed failed=0 health oracle (flow_ref T-PLAT-024)
  GIVEN gamed_step1_evidence + weak gate-plan using failed=0 or OR health regex
  WHEN  strengthened verify-gate-evidence.sh recomputes the run
  THEN  recomputed_verdict is fail (or discrepancies non-empty); verified cannot be true
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: verify-gate-evidence
  VERIFY: `bash verify-gate-evidence.sh against gamed fixture; jq -e '.recomputed_verdict=="fail" or (.discrepancies|length)>0' gate-verification out`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if recompute still passes gamed step1; only comments added without behavioral check; ban list empty
  START_REF: gamed_step1_evidence
  MUST_OBSERVE: recompute fail or discrepancy citing weak/banned token or missing overall OK; verified false OR recomputed_verdict fail
  MUST_NOT_OBSERVE: discrepancies:[] with verified true on gamed evidence; silent accept of failed=0 health
  EVIDENCE: gate_verification_json (required_capture=True)

### AC-2 — OR-alternation cannot pass on single unrelated token (flow_ref T-PLAT-024)
  GIVEN or_alternation_plan where log matches only one harmless alternation branch
  WHEN  recompute runs under strengthened rules
  THEN  either OR is rejected for health/alert assertion kinds, or each required branch is AND-expanded / source-bound so incomplete match fails
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: verify-gate-evidence
  VERIFY: `test-verify-gate-evidence.sh includes OR-gaming case exit proving fail`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if single-branch OR still passes for multi-claim step text; no test covers OR gaming; source-binding is documented but not executed
  START_REF: or_alternation_plan
  MUST_OBSERVE: recompute fail for incomplete OR health claim
  MUST_NOT_OBSERVE: pass on single unrelated alternation only
  EVIDENCE: test_transcript (required_capture=True)

### AC-3 — Strong evidence still passes recompute (flow_ref T-PLAT-024)
  GIVEN strong_step1_evidence after S27-02/03 oracle rewrites
  WHEN  recompute runs
  THEN  pass with verified true and empty discrepancies for strong steps
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: verify-gate-evidence
  VERIFY: `verify-gate-evidence on strong fixture → recomputed pass`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if strengthening is so crude all sprints fail forever; strong overall: OK evidence incorrectly fails ban list; no positive control fixture
  START_REF: strong_step1_evidence
  MUST_OBSERVE: recomputed pass; discrepancies empty
  MUST_NOT_OBSERVE: false fail on overall: OK evidence
  EVIDENCE: gate_verification_json (required_capture=True)

### AC-4 — Behavioral / structured assertion path preferred for backup steps (flow_ref T-PLAT-024)
  GIVEN sprint-27 alert and health steps
  WHEN  gate-plan is aligned with recompute capabilities
  THEN  health/alert steps use structured asserts where available (JSON fields, expect_not_log_regex, required_all_regex list) rather than sole OR log regex
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: gate-plan+verify-gate-evidence
  VERIFY: `jq sprint-27 gate-plan steps: no bare failed=0; health steps include expect_not_log_regex FAILED or required token list; alert mode steps bind post[job]`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if gate-plan still only uses weak OR for health; recompute upgraded but plan left gamed; structured fields ignored by recompute
  START_REF: strong_step1_evidence
  MUST_OBSERVE: no failed=0 in plan; health steps AND overall OK + not FAILED; alert steps mode-specific post[job] (post-S27-04); recompute method string reflects strengthened script
  MUST_NOT_OBSERVE: weak OR-only health oracle remaining; verified true on historical gamed evidence without regeneration
  EVIDENCE: gate_plan (required_capture=True)

### AC-5 — test-verify-gate-evidence.sh covers new rules (flow_ref T-PLAT-024)
  GIVEN brain skill test harness for verify-gate-evidence
  WHEN  bash test-verify-gate-evidence.sh runs
  THEN  new cases for banned token + OR gaming pass (i.e. correctly fail the gamed plans) and existing cases still pass
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: verify-gate-evidence-harness
  VERIFY: `bash /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/test-verify-gate-evidence.sh`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if no new tests added; tests only assert script still exits 0 without gamed fixtures; gamed fixtures missing
  START_REF: gamed_step1_evidence
  MUST_OBSERVE: harness exit 0; gamed token case present; OR gaming case present
  MUST_NOT_OBSERVE: harness skips new cases; false green without fixtures
  EVIDENCE: test_transcript (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Gamed failed=0 evidence fails recompute | AC-1 | `verify-gate-evidence on gamed fixture → fail` |
| TC-2 | OR-alternation gaming fails recompute | AC-2 | `OR fixture in test-verify-gate-evidence.sh` |
| TC-3 | Strong overall: OK evidence still passes | AC-3 | `strong fixture recompute pass` |
| TC-4 | S27 gate-plan uses strong assertion fields | AC-4 | `jq/rg gate-plan post-S27-02/03/09` |
| TC-5 | test-verify-gate-evidence.sh green with new cases | AC-5 | `bash test-verify-gate-evidence.sh` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/verify-gate-evidence.sh (MODIFY — strong recompute)
- /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/test-verify-gate-evidence.sh (MODIFY — gamed/OR cases)
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json (MODIFY — structured asserts aligning with recompute)
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-verification.json (regenerate after strong run)
- .tmp/redhat-fix-s27-09/** (NEW fixtures/evidence)
writeProhibited:
- Weakening other sprints' gates without compatibility path
- Deleting recompute entirely
- Claiming verified true without running the harness

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T054039Z.md:84-89 — F-9 recompute theatre; OR-alternation and failed=0 survive
2. /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/verify-gate-evidence.sh:47-50,290-312 — D3 exit+regex recompute — grep -Eq expect_log_regex only
3. /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/test-verify-gate-evidence.sh:1-160 — existing harness cases to extend with gamed/OR fixtures
4. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-verification.json:1-10 — verified:true discrepancies:[] via weak recompute method
5. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json:10-20 — step1 weak OR + failed=0 — target of recompute fail-closed
6. services/platform/src/cli/holo.ts:2174-2180 — archiver failed= token source for ban list rationale

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- `PLATFORM_IT=1 pnpm vitest run <path>` exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: verify-gate-evidence.sh D3, F-3/F-9 red-hat findings
Interaction notes:
- Land after S27-02/S27-03 so plan tokens are already overall: OK; recompute then enforces permanence.
- Implementation options (pick one, document in method string): (a) banned_token list + require_all_regex[]; (b) reject unscoped | in expect_log_regex for health kinds; (c) JSON assertion kind reading backup:status --json.
- Keep method string updated so gate-verification.json cannot claim old recompute@ef36f222.
Pattern: recompute = exit match AND required_all tokens AND forbidden tokens absent AND optional source-bind of each alternation; fail closed on banned health tokens
Pattern source: kb-run-human-tests verify-gate-evidence.sh + red-hat gate-provability rule
Anti-pattern: re.search(expect_re) only — mechanically verifies theatre oracles

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- Harness with new cases: `bash /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/test-verify-gate-evidence.sh` → Exit 0; includes gamed token + OR gaming cases.
- Gamed historical pattern fails: `bash -lc 'set -e; D=$(mktemp -d); # build mini gamed fixture with overall FAILED + failed=0 and weak plan; run verify-gate-evidence; test fail'` → Recompute fails closed.
- S27 plan has no failed=0: `! rg -n 'failed=0' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → Exit 0.
- Typecheck/lint N/A for bash; shellcheck optional: `bash -n /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/verify-gate-evidence.sh && bash -n /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/test-verify-gate-evidence.sh` → Exit 0.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: test-quality-reviewer
- Reviewer: code-reviewer
- Rationale: F-9 HIGH: verify-gate-evidence.sh only re-searches expect_re in logs — OR-alternation gaming and unrelated tokens like failed=0 survive recompute with discrepancies:[]. Test-reality owns making recompute fail-closed on weak oracles.
- Proposed by: test-quality-reviewer

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: [CAP-BAK-01]
- provides: ['strong-gate-recompute', 'banned-oracle-token-list', 'or-alternation-source-binding-or-and-semantics', 'behavioral-assertion-path-for-backup-gate']
- consumes: ['brain/skills/kb-run-human-tests/references/verify-gate-evidence.sh', 'gate-plan.json assertions after S27-02/03 oracle rewrites', 'test-verify-gate-evidence.sh harness']
- boundary_contracts: ['gate-plan assertion → verify-gate-evidence recompute → gate-verification.json', 'expect_log_regex tokens → command real stdout source binding']

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- /Users/inference1/Projects/brain/docs/TESTING-HIERARCHY.md
- /Users/inference1/Projects/brain/docs/ANTI-STUB-REVIEW.md
- /Users/inference1/Projects/brain/docs/TDD-METHODOLOGY.md
- /Users/inference1/Projects/brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- /Users/inference1/Projects/brain/skills/kb-run-human-tests/SKILL.md

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['REDHAT-FIX-S27-02', 'REDHAT-FIX-S27-03']
- blocks: []

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T054039Z.md (REDHAT-FIX-S27-09)
- CAP-BAK-01 remediation — gate honesty + production-truth.

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-09",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "gamed_step1_evidence": {
      "description": "Historical/synthetic evidence dir where step1.log contains archiver failed=0 AND overall: FAILED, exit 0, and gate-plan used failed=0 / OR regex \u2014 must recompute fail after fix.",
      "seed_method": "cli",
      "records": [
        "step1.log with archiver failed=0 and overall: FAILED",
        "step1.exit 0",
        "gate-plan weak assertion"
      ]
    },
    "strong_step1_evidence": {
      "description": "Evidence after S27-02/03: overall: OK present, FAILED absent, write-burst tokens real.",
      "seed_method": "cli",
      "records": [
        "overall: OK",
        "no bare failed=0 health claim",
        "exit 0"
      ]
    },
    "or_alternation_plan": {
      "description": "Mini gate-plan fixture with expect_log_regex 'foo|bar|baz' where log only has foo unrelated to command purpose.",
      "seed_method": "public_api",
      "records": [
        "expect_log_regex with | alternation",
        "log contains only first alternation token"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN gamed step1 evidence WHEN strengthened recompute runs THEN fail closed (no verified true)",
      "verify": "verify-gate-evidence gamed fixture",
      "primary": true,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "verify-gate-evidence",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "gamed evidence still verifies"
          ]
        },
        "evidence": {
          "artifact_type": "gate_verification_json",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "gamed_step1_evidence",
            "action": {
              "actor": "ci",
              "steps": [
                "recompute"
              ]
            },
            "end_state": {
              "must_observe": [
                "fail/discrepancy"
              ],
              "must_not_observe": [
                "verified true empty discrepancies"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN OR-alternation weak plan WHEN recompute THEN fail unless all required claims held",
      "verify": "OR fixture",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "verify-gate-evidence",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "single branch still passes multi-claim"
          ]
        },
        "evidence": {
          "artifact_type": "test_transcript",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "or_alternation_plan",
            "action": {
              "actor": "ci",
              "steps": [
                "recompute OR fixture"
              ]
            },
            "end_state": {
              "must_observe": [
                "fail incomplete OR"
              ],
              "must_not_observe": [
                "pass on unrelated token only"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN strong evidence WHEN recompute THEN pass",
      "verify": "strong fixture",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "verify-gate-evidence",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "strong evidence false-fails"
          ]
        },
        "evidence": {
          "artifact_type": "gate_verification_json",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "strong_step1_evidence",
            "action": {
              "actor": "ci",
              "steps": [
                "recompute"
              ]
            },
            "end_state": {
              "must_observe": [
                "pass"
              ],
              "must_not_observe": [
                "false fail"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN S27 gate-plan WHEN aligned THEN structured/strong asserts not weak OR-only",
      "verify": "jq/rg plan",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-plan+verify-gate-evidence",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "plan still gamed"
          ]
        },
        "evidence": {
          "artifact_type": "gate_plan",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "strong_step1_evidence",
            "action": {
              "actor": "operator",
              "steps": [
                "inspect plan"
              ]
            },
            "end_state": {
              "must_observe": [
                "strong asserts",
                "no failed=0"
              ],
              "must_not_observe": [
                "weak OR-only health"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN harness WHEN run THEN new gamed/OR cases covered and green",
      "verify": "bash test-verify-gate-evidence.sh",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "verify-gate-evidence-harness",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "no new cases"
          ]
        },
        "evidence": {
          "artifact_type": "test_transcript",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "gamed_step1_evidence",
            "action": {
              "actor": "ci",
              "steps": [
                "run harness"
              ]
            },
            "end_state": {
              "must_observe": [
                "harness exit 0",
                "gamed+OR cases"
              ],
              "must_not_observe": [
                "skipped coverage"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "gamed evidence fails recompute",
      "verify": "verify-gate-evidence gamed",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "OR gaming fails",
      "verify": "OR fixture",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "strong evidence passes",
      "verify": "strong fixture",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "S27 plan strong asserts",
      "verify": "jq plan",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "harness green",
      "verify": "test-verify-gate-evidence.sh",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->
