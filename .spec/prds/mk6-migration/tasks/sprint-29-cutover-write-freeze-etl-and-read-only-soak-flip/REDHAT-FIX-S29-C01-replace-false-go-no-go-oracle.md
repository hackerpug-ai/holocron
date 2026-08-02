# REDHAT-FIX-S29-C01 — Replace the false go/no-go oracle with real CLI execution and require failed_count=0 (C-01)

> Status: Backlog
> Task ID: REDHAT-FIX-S29-C01
> Assignee: devops-engineer
> Priority: P0
> Type: FEATURE
> Depends: none

## What this does

Close red-hat **C-01**: human-gate step 1 and D06-02 tests must run the real
`bun services/platform/src/cli/holo.ts cutover:go-no-go --json` path (or an equivalent
integration that actually executes the eight production gates), require
`overall.ok == true`, `failed_count == 0`, and nonzero collected tests for every Vitest
lane, and preserve that full report as evidence. Remove echo-substituted fake gates and
`jq length==8` alone as a pass.

## Why

Review: `.spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md` @ `2b966c7b60559ec9986cf737ed5322a6146c7960`.
Committed step1.log shows `failed_count: 5` with exit 0; gate-plan only checks
`.gates | length == 8`; sprint29-go-no-go.test.ts substitutes shell echo gates.

## How to verify

- `rg -n 'echo.*gate|length == 8' services/platform/tests/integration/sprint29-go-no-go.test.ts .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json` → no echo-gate substitution; no length-only pass
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-go-no-go.test.ts` → real CLI path; fails closed when any gate fails
- `jq -e '.overall.ok == true and .failed_count == 0' <go-no-go-report.json>` after a real run when stack is green; otherwise test RED is honest fail
- `pnpm tsgo --noEmit` → exit 0

## Scope

Writes: `services/platform/tests/integration/sprint29-go-no-go.test.ts`,
`services/platform/src/cutover/go-no-go.ts` (only if needed for honest reporting),
`.spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json` (step 1 oracle),
`.tmp/REDHAT-FIX-S29-C01/**`

Prohibited: mocking Vitest lanes, echo-success gates, accepting failed_count>0 as pass.

<details>
<summary>▸ Full agent specification</summary>

================================================================================
TASK: REDHAT-FIX-S29-C01
================================================================================
TASK_TYPE: FEATURE
STATUS: Backlog
PRIORITY: P0
AGENT: implementer=devops-engineer | reviewer=mastra-reviewer
TDD_MODE: red_first
RED_GREEN_REQUIRED: yes
CAPABILITY: CAP-CUT-01
SPRINT: Sprint 29

RUNTIME_COMMANDS:
  test: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-go-no-go.test.ts
  typecheck: pnpm tsgo --noEmit
  lint: pnpm biome check services/platform/tests/integration/sprint29-go-no-go.test.ts services/platform/src/cutover/go-no-go.ts

OUTCOME
-------
Go/no-go human gate and integration suite cannot pass when any of the eight production
gates fail; they execute real CLI/gates; evidence records failed_count and overall.ok.

CRITICAL CONSTRAINTS
--------------------
- MUST execute real cutover:go-no-go (or real gate runners) — never echo/stub gates
- MUST require overall.ok==true AND failed_count==0 for pass
- MUST fail closed when collectedTests==0 for a Vitest lane
- NEVER treat gates.length==8 alone as success
- NEVER mock Postgres/Convex/Mastra for go-no-go green path

DONE WHEN
---------
- [ ] AC-1: GIVEN a deliberately failing gate WHEN cutover:go-no-go --json runs THEN overall.ok==false AND failed_count>=1 AND process exit non-zero (or test asserts that)
- [ ] AC-2: GIVEN green stack WHEN suite runs THEN real gates execute (no echo substitution) AND overall.ok==true AND failed_count==0
- [ ] AC-3: GIVEN gate-plan step 1 WHEN human tests run THEN literal_cmd asserts overall.ok and failed_count==0 (not length alone)
- [ ] AC-4: typecheck + lint clean on write paths

ACCEPTANCE CRITERIA
-------------------

### AC-1 [PRIMARY] — fail closed on failed gate
GIVEN a gate forced to fail WHEN go-no-go runs THEN overall.ok is false and failed_count >= 1
TEST_TIER: integration · TDD_STATE: red→green
VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-go-no-go.test.ts -t 'fail|failed_count'`
SCENARIO:
  NEGATIVE_CONTROL: would pass if echo gates always succeed; length==8 alone green
  START_REF: go_no_go_with_forced_fail
  MUST_OBSERVE: overall.ok == false; failed_count >= 1
  MUST_NOT_OBSERVE: exit 0 with failed_count > 0 treated as pass; echo gate substitution

### AC-2 — real CLI green path
GIVEN healthy new-stack WHEN suite runs THEN real CLI executes eight gates and overall.ok true only if all pass
VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-go-no-go.test.ts`
SCENARIO:
  NEGATIVE_CONTROL: would pass with shell echo success without running gates
  START_REF: go_no_go_real_cli
  MUST_OBSERVE: no echo.*success gate stubs; report has failed_count field
  MUST_NOT_OBSERVE: gates composed only of echo commands

### AC-3 — gate-plan step 1 oracle
GIVEN gate-plan.json step 1 WHEN inspecting literal_cmd THEN it requires overall.ok and failed_count==0
VERIFY: `jq -e '.steps[0].literal_cmd | test("failed_count|overall")' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json`
SCENARIO:
  NEGATIVE_CONTROL: length == 8 only
  START_REF: gate_plan_step1
  MUST_OBSERVE: failed_count or overall.ok in step1 command
  MUST_NOT_OBSERVE: only length == 8

### AC-4 — typecheck/lint
VERIFY: `pnpm tsgo --noEmit`

<!-- REQUIREMENT-CONTRACT v1 -->
```json
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-C01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fx-go-no-go-cli": {
      "description": "Real cutover:go-no-go CLI",
      "seed_method": "public_api",
      "records": [
        "cutover:go-no-go --json"
      ]
    },
    "fx-gate-plan": {
      "description": "gate-plan step1",
      "seed_method": "public_api",
      "records": [
        "gate-plan.json"
      ]
    },
    "fx-forced-fail": {
      "description": "forced failing gate",
      "seed_method": "public_api",
      "records": [
        "forced_fail"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "fail closed when gate fails",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-go-no-go.test.ts -t 'fail|failed_count'",
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
            "start_ref": "fx-forced-fail",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-go-no-go.test.ts -t 'fail|failed_count'"
              ]
            },
            "end_state": {
              "must_observe": [
                "failed_count >= 1",
                "overall.ok == false",
                "exit_code != 0 OR assertion fails closed"
              ],
              "must_not_observe": [
                "failed_count == 0 on forced fail",
                "empty gates green",
                "echo stub success"
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
      "description": "real CLI path",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-go-no-go.test.ts",
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
            "start_ref": "fx-go-no-go-cli",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-go-no-go.test.ts"
              ]
            },
            "end_state": {
              "must_observe": [
                "gates executed count == 8",
                "failed_count >= 0",
                "echo_gate_count == 0"
              ],
              "must_not_observe": [
                "gates executed count == 0",
                "empty report",
                "echo_gate_count >= 1"
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
      "description": "gate-plan step1",
      "verify": "jq -e '.steps[0].literal_cmd | test(\"failed_count|overall\")' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json",
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
            "start_ref": "fx-gate-plan",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run jq -e '.steps[0].literal_cmd | test(\"failed_count|overall\")' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "failed_count_token_count >= 1 OR overall_token_count >= 1",
                "step_index_0_present == true"
              ],
              "must_not_observe": [
                "length_only_oracle == true",
                "literal_cmd length == 0",
                "steps length == 0"
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
      "description": "typecheck",
      "verify": "pnpm tsgo --noEmit",
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
            "start_ref": "fx-go-no-go-cli",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run pnpm tsgo --noEmit"
              ]
            },
            "end_state": {
              "must_observe": [
                "typecheck exit_code == 0"
              ],
              "must_not_observe": [
                "typecheck exit_code != 0",
                "empty typecheck skipped"
              ]
            }
          }
        ]
      }
    }
  ]
}
```
