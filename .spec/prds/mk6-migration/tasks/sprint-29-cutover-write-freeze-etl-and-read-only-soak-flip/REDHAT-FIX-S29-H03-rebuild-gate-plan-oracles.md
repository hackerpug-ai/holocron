# REDHAT-FIX-S29-H03 — Rebuild gate-plan predicates around concrete CLI actions and complete per-surface oracles (H-03)

> Status: Backlog
> Task ID: REDHAT-FIX-S29-H03
> Assignee: devops-engineer
> Priority: P0
> Type: FEATURE

## What this does

Close red-hat **H-03**: rebuild `.spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json` so every step invokes the
documented cutover CLI and asserts the complete concrete oracle (not isolated soft
predicates). Step 5 must require toolsPassed/toolsTotal numbers; steps 2–4 must assert
full freeze/quiet/ETL outcomes.

## Why

Review: `.spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md`. Steps 2–5 inspect weak JSON fields; step5 evidence has toolsPassed:null.

## How to verify

- `jq '.steps[] | {n, literal_cmd, assertion}' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json`
- After re-run of human tests: all step logs show full oracles; toolsPassed not null on step 5

## Scope

Writes: `.spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json`, optionally gate-results helpers, `.tmp/REDHAT-FIX-S29-H03/**`
Coordinate with C01 for step 1.

<details>
<summary>▸ Full agent specification</summary>

================================================================================
TASK: REDHAT-FIX-S29-H03
================================================================================
TASK_TYPE: FEATURE
PRIORITY: P0
AGENT: implementer=devops-engineer | reviewer=mastra-reviewer
TDD_MODE: red_first
RED_GREEN_REQUIRED: yes

RUNTIME_COMMANDS:
  test: jq -e '.steps | length == 6' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json
  typecheck: true

DONE WHEN
---------
- [ ] AC-1: each step.literal_cmd is a real cutover/holo CLI (or documented pipeline) not weak jq alone
- [ ] AC-2: step 3 requires acceptedWriteCount==0 AND duration/window evidence
- [ ] AC-3: step 4 requires unexplainedVariance==0 and report ok
- [ ] AC-4: step 5 requires toolsPassed==toolsTotal and toolsTotal>=44 (or full tool count)
- [ ] AC-5: step 6 requires migration_read_only on write probe

ACCEPTANCE CRITERIA
-------------------

### AC-1 [PRIMARY] — real CLI steps
VERIFY: `jq -e '[.steps[].literal_cmd] | map(test("cutover:|holo|bun services/platform")) | all' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json`
SCENARIO:
  start_ref: gate_plan_cli
  MUST_OBSERVE: cutover: or holo CLI in each step
  MUST_NOT_OBSERVE: only soft jq length checks for critical steps

### AC-2 — quiet oracle
VERIFY: `jq -e '.steps[] | select(.n==3) | .literal_cmd | test("acceptedWriteCount|quiet")' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json`
SCENARIO:
  start_ref: gate_plan_quiet
  MUST_OBSERVE: acceptedWriteCount or equivalent
  MUST_NOT_OBSERVE: ok-only soft check

### AC-3 — ETL oracle
VERIFY: `jq -e '.steps[] | select(.n==4) | .literal_cmd | test("unexplainedVariance|reconcile")' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json`
SCENARIO:
  start_ref: gate_plan_etl
  MUST_OBSERVE: unexplainedVariance==0 requirement
  MUST_NOT_OBSERVE: overall.ok only

### AC-4 — soak tools oracle
VERIFY: `jq -e '.steps[] | select(.n==5) | .literal_cmd | test("toolsPassed|toolsTotal")' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json`
SCENARIO:
  start_ref: gate_plan_soak
  MUST_OBSERVE: toolsPassed/toolsTotal asserted
  MUST_NOT_OBSERVE: overall.ok only with null tools

### AC-5 — write fence oracle
VERIFY: `jq -e '.steps[] | select(.n==6) | .literal_cmd | test("migration_read_only|MIGRATION_READ_ONLY")' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json`
SCENARIO:
  start_ref: gate_plan_write
  MUST_OBSERVE: migration_read_only
  MUST_NOT_OBSERVE: env inject alone without assertion

<!-- REQUIREMENT-CONTRACT v1 -->
```json
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-H03",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fx-gate-plan-file": {
      "description": "gate-plan.json",
      "seed_method": "public_api",
      "records": [
        "gate-plan.json"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "CLI steps",
      "verify": "jq -e '[.steps[].literal_cmd] | map(test(\"cutover:|holo|bun services/platform\")) | all' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub or mock replaces the real CLI/service boundary",
            "disconnect from real Postgres/Convex so no request is issued",
            "empty start with zero gates/tools/tables still reports green",
            "static hardcoded pass without executing the real path"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-gate-plan-file",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run jq -e '[.steps[].literal_cmd] | map(test(\"cutover:|holo|bun services/platform\")) | all' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "steps length == 6",
                "cli_step_match_count == 6"
              ],
              "must_not_observe": [
                "steps length == 0",
                "cli_step_match_count == 0",
                "empty literal_cmd"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "step3 quiet",
      "verify": "jq -e '.steps[] | select(.n==3) | .literal_cmd | test(\"acceptedWriteCount|quiet\")' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub or mock replaces the real CLI/service boundary",
            "disconnect from real Postgres/Convex so no request is issued",
            "empty start with zero gates/tools/tables still reports green",
            "static hardcoded pass without executing the real path"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-gate-plan-file",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run jq -e '.steps[] | select(.n==3) | .literal_cmd | test(\"acceptedWriteCount|quiet\")' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "step3 has acceptedWriteCount OR quiet token",
                "step n == 3 present"
              ],
              "must_not_observe": [
                "step3 empty",
                "step3 only ok without acceptedWriteCount"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "step4 etl",
      "verify": "jq -e '.steps[] | select(.n==4) | .literal_cmd | test(\"unexplainedVariance|reconcile\")' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub or mock replaces the real CLI/service boundary",
            "disconnect from real Postgres/Convex so no request is issued",
            "empty start with zero gates/tools/tables still reports green",
            "static hardcoded pass without executing the real path"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-gate-plan-file",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run jq -e '.steps[] | select(.n==4) | .literal_cmd | test(\"unexplainedVariance|reconcile\")' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "step4 has unexplainedVariance OR reconcile token",
                "step n == 4 present"
              ],
              "must_not_observe": [
                "step4 empty",
                "step4 overall.ok only without variance"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "step5 tools",
      "verify": "jq -e '.steps[] | select(.n==5) | .literal_cmd | test(\"toolsPassed|toolsTotal\")' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub or mock replaces the real CLI/service boundary",
            "disconnect from real Postgres/Convex so no request is issued",
            "empty start with zero gates/tools/tables still reports green",
            "static hardcoded pass without executing the real path"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-gate-plan-file",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run jq -e '.steps[] | select(.n==5) | .literal_cmd | test(\"toolsPassed|toolsTotal\")' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "step5 has toolsPassed OR toolsTotal token",
                "step n == 5 present"
              ],
              "must_not_observe": [
                "step5 empty",
                "toolsPassed null allowed without assert"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "step6 write",
      "verify": "jq -e '.steps[] | select(.n==6) | .literal_cmd | test(\"migration_read_only|MIGRATION_READ_ONLY\")' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub or mock replaces the real CLI/service boundary",
            "disconnect from real Postgres/Convex so no request is issued",
            "empty start with zero gates/tools/tables still reports green",
            "static hardcoded pass without executing the real path"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-gate-plan-file",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run jq -e '.steps[] | select(.n==6) | .literal_cmd | test(\"migration_read_only|MIGRATION_READ_ONLY\")' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "step6 has migration_read_only token",
                "step n == 6 present"
              ],
              "must_not_observe": [
                "step6 empty",
                "no migration_read_only assert"
              ]
            }
          }
        ]
      }
    }
  ]
}
```
