# pipes-4: RED tests: each pipeline former-output, one-report-4-kinds, no-shells, sub-workflow-publish

- **Sprint:** [Sprint 22: All Agentic Pipelines as Templates/Agents](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `M`
- **Estimate:** `210 minutes`
- **Agent:** `red-test-generator` — RED test generation requires writing failing tests first that verify former pipeline outputs against real Postgres+fleet, no stubs allowed
- **Reviewer:** `mastra-reviewer`
- **Proposed By:** `mastra-planner`
- **TDD Mode:** `red_first`
- **RED/GREEN Required:** `yes`

## Outcome
Write failing RED tests for each pipeline (research/whatsNew/assimilate/shop/subscriptions), one report template covering 4 kinds, no-shells verification, and sub-workflow publish — all tests fail against empty start state and verify concrete seeded output values against real Postgres+fleet.

## Background
This task is part of Sprint 22's collapse of holocron's per-domain agentic pipelines onto the Sprint 15 mission engine as shared templates/agents (UC-SVC-02). Write failing RED tests for each pipeline (research/whatsNew/assimilate/shop/subscriptions), one report template covering 4 kinds, no-shells verification, and sub-workflow publish — all tests fail against empty start state and verify concrete seeded output values against real Postgres+fleet. The mission-engine substrate lives in `services/platform/src/mission/` and the shared evidence-research core in `services/platform/src/research/`.

## Specification
- **Objective:** Write failing RED tests for each pipeline (research/whatsNew/assimilate/shop/subscriptions), one report template covering 4 kinds, no-shells verification, and sub-workflow publish — all tests fail against empty start state and verify concrete seeded output values against real Postgres+fleet.
- **Success state:** All RED tests fail with clear error messages showing what's missing; tests reference real seeded data; no test passes on empty/stubbed implementation; RED output captured for each test before implementation begins.

## Critical Constraints
### MUST
- MUST Every test MUST fail against empty/disconnected start state (RED-against-start)
- MUST Tests MUST run against real Postgres+fleet, no mocks
- MUST Tests MUST verify concrete seeded values in output, not just exit 0
- MUST Each pipeline MUST have at least one test verifying former output shape
### NEVER
- NEVER write tests that pass on empty/stubbed implementations
- NEVER mock Postgres or fleet responses
- NEVER assert only 'exit 0' or 'tests pass' without seeded values
- NEVER skip negative control assertions
### STRICTLY
- STRICTLY Each test MUST capture RED output showing failure before implementation
- STRICTLY Test MUST name per-domain modules that should be deleted (for no-shells verification)
- STRICTLY Sub-workflow publish test MUST verify document row creation with source_run_id

## Capability Chain
- **Touches:** N/A
**Provides:**
- red-test-suite

## Acceptance Criteria
### AC-1: RED test for evidence-research template fails with missing executor [PRIMARY]
- **GIVEN:** Empty mission registry with no evidence-research template
- **WHEN:** Test runs holo mission run research --topic 'test' --components 1
- **THEN:** Test fails with error 'template not found: evidence-research' and exit code non-zero
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `pnpm test -- src/__tests__/integration/red-evidence-research.test.ts --grep 'RED missing template' 2>&1 | tee /tmp/red-output.txt | grep 'template not found'`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `stdout`
  - Negative control: fails if any of: implementation-present, stub, empty, static, disconnect
  - Case 1:
    - Start: `empty_mission_registry`
    - Action (test_runner): run RED test for missing evidence-research template; capture test failure output
    - Must observe: exit_code != 0; stderr contains 'template not found: evidence-research'; stderr contains 'expected templates to exist'
    - Must not observe: exit_code = 0; stderr does not contain 'template not found'; test passes without implementation

### AC-2: RED test for whatsNew fails with missing briefing output fields
- **GIVEN:** whatsNew template exists but returns empty output
- **WHEN:** Test runs holo mission run whatsNew --date 2026-07-20
- **THEN:** Test fails asserting output->>'documentType'='daily-briefing' and headlines array non-empty
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `pnpm test -- src/__tests__/integration/red-whatsnew.test.ts --grep 'RED missing output fields' 2>&1 | grep 'expected documentType to be daily-briefing'`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `stdout`
  - Negative control: fails if any of: implementation-present, stub, empty, static, disconnect
  - Case 1:
    - Start: `whatsnew_template_stub`
    - Action (test_runner): run RED test for whatsNew output shape; capture assertion failure
    - Must observe: exit_code != 0; stderr contains 'expected daily-briefing, got'; stderr contains 'expected headlines count > 0, got 0'
    - Must not observe: exit_code = 0; no assertion error in stderr; test accepts empty output

### AC-3: RED test for business-report one-template-4-kinds fails with missing parameterization
- **GIVEN:** Separate template rows exist for each report kind instead of one parameterized template
- **WHEN:** Test queries template count for business-report kinds
- **THEN:** Test fails asserting exactly 1 template row covers all 4 kinds
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `pnpm test -- src/__tests__/integration/red-business-report.test.ts --grep 'RED one template' 2>&1 | grep 'expected 1 template, found 4'`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `stdout`
  - Negative control: fails if any of: implementation-present, stub, empty, static, disconnect
  - Case 1:
    - Start: `four_separate_templates`
    - Action (test_runner): run RED test for one parameterized template; capture count assertion failure
    - Must observe: exit_code != 0; stderr contains 'expected 1 template, found 4'; stderr contains 'revenue-validation'
    - Must not observe: exit_code = 0; no count assertion in stderr; test passes with 4 templates

### AC-4: RED test for no-shells fails with per-domain modules present
- **GIVEN:** Per-domain module directories still exist (whatsnew/, assimilate/, shop/, subscriptions/)
- **WHEN:** Test runs holo verify:no-shells
- **THEN:** Test fails asserting zero per-domain module directories found
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `pnpm test -- src/__tests__/integration/red-no-shells.test.ts --grep 'RED modules present' 2>&1 | grep 'expected 0 modules, found N'`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `stdout`
  - Negative control: fails if any of: implementation-present, stub, empty, static, disconnect
  - Case 1:
    - Start: `per_domain_modules_exist`
    - Action (test_runner): run RED test for no-shells verification; capture module count failure
    - Must observe: exit_code != 0; stderr contains 'expected 0, found N' where N > 0; stderr contains 'whatsnew/' or 'assimilate/'
    - Must not observe: exit_code = 0; stderr does not list found modules; module count = 0

### AC-5: RED test for sub-workflow publish fails with missing document row
- **GIVEN:** subscriptions mission completes but no document row created
- **WHEN:** Test queries documents table for source_run_id
- **THEN:** Test fails asserting document row exists with published_at timestamp
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `pnpm test -- src/__tests__/integration/red-sub-workflow-publish.test.ts --grep 'RED missing document' 2>&1 | grep 'expected document to exist'`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `stdout`
  - Negative control: fails if any of: implementation-present, stub, empty, static, disconnect
  - Case 1:
    - Start: `subscription_run_without_publish`
    - Action (test_runner): run RED test for sub-workflow publish; capture document existence failure
    - Must observe: exit_code != 0; stderr contains 'expected document to exist'; stderr contains 'documents table empty'
    - Must not observe: test passes without document; no document existence assertion; test accepts missing document

## Test Criteria
| ID | Maps to | Type | Statement | Verify |
|---|---|---|---|---|
| TC-1 | AC-1 | happy_path | RED test output captured in /tmp/red-output.txt shows failure | `test -f /tmp/red-output.txt && grep 'FAIL' /tmp/red-output.txt | wc -l | grep -v 0` |
| TC-2 | AC-1 | happy_path | All RED tests exit non-zero | `pnpm test -- src/__tests__/integration/red-*.test.ts; echo $? | grep -v 0` |
| TC-3 | AC-2 | happy_path | RED tests reference real seeded data, not mocks | `grep -r 'psql \$DATABASE_URL' src/__tests__/integration/red-*.test.ts | wc -l | grep -v 0` |
| TC-4 | AC-3 | happy_path | RED tests assert concrete values, not just exit codes | `grep -r "assert.*>='daily-briefing'" src/__tests__/integration/red-*.test.ts | wc -l | grep -v 0` |
| TC-5 | AC-1 | happy_path | RED tests run before any implementation (git history shows RED commit) | `git log --oneline --all | grep 'pipes-4 RED' | head -1` |

## Reading List
| Path | Lines | Focus |
|---|---|---|

## Guardrails
**WRITE-ALLOWED**
**WRITE-PROHIBITED**

## Design / Pipeline Semantics

## Verification Gates
| Gate | Command | Expected |
|---|---|---|
| Scenario validation | `python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py < pipes-4-scenarios.json` | Exit 0; zero CRITICAL or HIGH. |
| Type check + lint | `pnpm typecheck && pnpm lint` | Both exit 0. |

## Coding Standards
- /Users/inference1/Projects/brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- /Users/inference1/Projects/brain/docs/REQUIREMENT-TRACKING.md

## Review Criteria
- All AC/TC IDs remain stable; every behavioral AC carries an un-fakeable scenario.
- No fake/static/empty success path; negative controls fail against disconnected, stubbed, empty, or missing-implementation states.
- All writes stay within WRITE-ALLOWED; verification gates produce captured evidence (not merely 'exit 0').
- Per-domain copy-pasted pipeline modules are provably gone (`holo verify:no-shells`), replaced by shared templates + the tool/schema registry.
- Reasoning runs server-side on the fleet (CAP-INF-01) — no client-side Claude skill on the path.

## Dependencies
- **Depends on:** none
- **Blocks:** pipes-1, pipes-2

## Agent Instructions
Follow RED → GREEN → REFACTOR per AC. Write the failing test against the real Postgres+fleet entrypoint first (pipes-4 owns the consolidated RED suite; coordinate so the RED commit lands before implementation). The RED proof must fail against the empty/disconnected start state — capture the failure output, not just the green. Keep reasoning server-side on the fleet.

## Requirement Contract
<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "pipes-4",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "empty_mission_registry": {
      "description": "Postgres with no mission templates registered",
      "seed_method": "public_api",
      "records": [
        "mission_templates table empty",
        "mission_runs table empty"
      ]
    },
    "whatsnew_template_stub": {
      "description": "whatsNew template row exists but returns empty output",
      "seed_method": "public_api",
      "records": [
        "mission_templates contains whatsnew row",
        "template executor returns empty object"
      ]
    },
    "four_separate_templates": {
      "description": "4 separate template rows for each report kind",
      "seed_method": "public_api",
      "records": [
        "mission_templates contains revenue-validation row",
        "mission_templates contains competitive row",
        "mission_templates contains ai-roi row",
        "mission_templates contains flights row"
      ]
    },
    "per_domain_modules_exist": {
      "description": "Per-domain module directories present in filesystem",
      "seed_method": "public_api",
      "records": [
        "services/platform/src/whatsnew/ directory exists",
        "services/platform/src/assimilate/ directory exists",
        "services/platform/src/shop/ directory exists",
        "services/platform/src/subscriptions/ directory exists"
      ]
    },
    "subscription_run_without_publish": {
      "description": "Subscriptions mission run completed but no document published",
      "seed_method": "public_api",
      "records": [
        "mission_runs row with template_key=\"subscriptions\", status=\"completed\"",
        "documents table has no row with source_run_id"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN Empty mission registry with no evidence-research template WHEN Test runs holo mission run research --topic 'test' --components 1 THEN Test fails with error 'template not found: evidence-research' and exit code non-zero",
      "verify": "pnpm test -- src/__tests__/integration/red-evidence-research.test.ts --grep 'RED missing template' 2>&1 | tee /tmp/red-output.txt | grep 'template not found'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "implementation-present",
            "stub",
            "empty",
            "static",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty_mission_registry",
            "action": {
              "actor": "test_runner",
              "steps": [
                "run RED test for missing evidence-research template",
                "capture test failure output"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit_code != 0",
                "stderr contains 'template not found: evidence-research'",
                "stderr contains 'expected templates to exist'"
              ],
              "must_not_observe": [
                "exit_code = 0",
                "stderr does not contain 'template not found'",
                "test passes without implementation"
              ]
            }
          }
        ],
        "primary": true
      },
      "unit_test_justified": null
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN whatsNew template exists but returns empty output WHEN Test runs holo mission run whatsNew --date 2026-07-20 THEN Test fails asserting output->>'documentType'='daily-briefing' and headlines array non-empty",
      "verify": "pnpm test -- src/__tests__/integration/red-whatsnew.test.ts --grep 'RED missing output fields' 2>&1 | grep 'expected documentType to be daily-briefing'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "implementation-present",
            "stub",
            "empty",
            "static",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "whatsnew_template_stub",
            "action": {
              "actor": "test_runner",
              "steps": [
                "run RED test for whatsNew output shape",
                "capture assertion failure"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit_code != 0",
                "stderr contains 'expected daily-briefing, got'",
                "stderr contains 'expected headlines count > 0, got 0'"
              ],
              "must_not_observe": [
                "exit_code = 0",
                "no assertion error in stderr",
                "test accepts empty output"
              ]
            }
          }
        ],
        "primary": false
      },
      "unit_test_justified": null
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN Separate template rows exist for each report kind instead of one parameterized template WHEN Test queries template count for business-report kinds THEN Test fails asserting exactly 1 template row covers all 4 kinds",
      "verify": "pnpm test -- src/__tests__/integration/red-business-report.test.ts --grep 'RED one template' 2>&1 | grep 'expected 1 template, found 4'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "implementation-present",
            "stub",
            "empty",
            "static",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "four_separate_templates",
            "action": {
              "actor": "test_runner",
              "steps": [
                "run RED test for one parameterized template",
                "capture count assertion failure"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit_code != 0",
                "stderr contains 'expected 1 template, found 4'",
                "stderr contains 'revenue-validation'"
              ],
              "must_not_observe": [
                "exit_code = 0",
                "no count assertion in stderr",
                "test passes with 4 templates"
              ]
            }
          }
        ],
        "primary": false
      },
      "unit_test_justified": null
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN Per-domain module directories still exist (whatsnew/, assimilate/, shop/, subscriptions/) WHEN Test runs holo verify:no-shells THEN Test fails asserting zero per-domain module directories found",
      "verify": "pnpm test -- src/__tests__/integration/red-no-shells.test.ts --grep 'RED modules present' 2>&1 | grep 'expected 0 modules, found N'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "implementation-present",
            "stub",
            "empty",
            "static",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "per_domain_modules_exist",
            "action": {
              "actor": "test_runner",
              "steps": [
                "run RED test for no-shells verification",
                "capture module count failure"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit_code != 0",
                "stderr contains 'expected 0, found N' where N > 0",
                "stderr contains 'whatsnew/' or 'assimilate/'"
              ],
              "must_not_observe": [
                "exit_code = 0",
                "stderr does not list found modules",
                "module count = 0"
              ]
            }
          }
        ],
        "primary": false
      },
      "unit_test_justified": null
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN subscriptions mission completes but no document row created WHEN Test queries documents table for source_run_id THEN Test fails asserting document row exists with published_at timestamp",
      "verify": "pnpm test -- src/__tests__/integration/red-sub-workflow-publish.test.ts --grep 'RED missing document' 2>&1 | grep 'expected document to exist'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "implementation-present",
            "stub",
            "empty",
            "static",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "subscription_run_without_publish",
            "action": {
              "actor": "test_runner",
              "steps": [
                "run RED test for sub-workflow publish",
                "capture document existence failure"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit_code != 0",
                "stderr contains 'expected document to exist'",
                "stderr contains 'documents table empty'"
              ],
              "must_not_observe": [
                "test passes without document",
                "no document existence assertion",
                "test accepts missing document"
              ],
              "must_not_ob_observe": [
                "exit_code = 0",
                "no document existence assertion",
                "test passes without document"
              ]
            }
          }
        ],
        "primary": false
      },
      "unit_test_justified": null
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "RED test output captured in /tmp/red-output.txt shows failure",
      "verify": "test -f /tmp/red-output.txt && grep 'FAIL' /tmp/red-output.txt | wc -l | grep -v 0",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "All RED tests exit non-zero",
      "verify": "pnpm test -- src/__tests__/integration/red-*.test.ts; echo $? | grep -v 0",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "RED tests reference real seeded data, not mocks",
      "verify": "grep -r 'psql \\$DATABASE_URL' src/__tests__/integration/red-*.test.ts | wc -l | grep -v 0",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "RED tests assert concrete values, not just exit codes",
      "verify": "grep -r \"assert.*>='daily-briefing'\" src/__tests__/integration/red-*.test.ts | wc -l | grep -v 0",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "RED tests run before any implementation (git history shows RED commit)",
      "verify": "git log --oneline --all | grep 'pipes-4 RED' | head -1",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->
