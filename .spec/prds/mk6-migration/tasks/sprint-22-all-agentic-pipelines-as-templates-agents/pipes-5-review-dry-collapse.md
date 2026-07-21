# pipes-5: Review DRY collapse

- **Sprint:** [Sprint 22: All Agentic Pipelines as Templates/Agents](./SPRINT.md)
- **Task Type:** `REVIEW`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `S`
- **Estimate:** `90 minutes`
- **Agent:** `mastra-reviewer` — Mastra code review requires validating agent/workflow composition, template DRY compliance, and TDD discipline with Mastra patterns
- **Reviewer:** `mastra-reviewer (capstone review task)`
- **Proposed By:** `mastra-planner`
- **TDD Mode:** `skipped`
- **RED/GREEN Required:** `no`

## Outcome
Adversarially validate that per-domain pipeline modules are eliminated, all pipelines use shared templates/agents, sub-workflow calls use template references, and TDD RED evidence exists — rejecting any regression to copy-pasted modules or missing evidence.

## Background
This task is part of Sprint 22's collapse of holocron's per-domain agentic pipelines onto the Sprint 15 mission engine as shared templates/agents (UC-SVC-02). Adversarially validate that per-domain pipeline modules are eliminated, all pipelines use shared templates/agents, sub-workflow calls use template references, and TDD RED evidence exists — rejecting any regression to copy-pasted modules or missing evidence. The mission-engine substrate lives in `services/platform/src/mission/` and the shared evidence-research core in `services/platform/src/research/`.

## Specification
- **Objective:** Adversarially validate that per-domain pipeline modules are eliminated, all pipelines use shared templates/agents, sub-workflow calls use template references, and TDD RED evidence exists — rejecting any regression to copy-pasted modules or missing evidence.
- **Success state:** Review confirms zero per-domain modules exist, all pipelines use shared templates, sub-workflow calls reference templates correctly, RED test output is captured, and no inline executable payloads exist in templates.

## Critical Constraints
### MUST
- MUST Review MUST confirm per-domain modules are deleted (whatsnew/, assimilate/, shop/, subscriptions/)
- MUST Review MUST verify all pipelines use shared templates/agents
- MUST Review MUST confirm sub-workflow calls use template references
- MUST Review MUST validate TDD RED evidence exists
### NEVER
- NEVER approve if per-domain copy-pasted modules remain
- NEVER approve without verifying RED test output
- NEVER approve if templates have inline executable payloads
- NEVER approve without checking sub-workflow checkpoint commits
### STRICTLY
- STRICTLY Review MUST grep for per-domain directory paths and confirm deletion
- STRICTLY Review MUST verify mission_templates table has correct template rows
- STRICTLY Review MUST confirm no client-side Claude API calls for reasoning

## Capability Chain
- **Touches:** N/A
**Provides:**
- review-verification

## Acceptance Criteria
### AC-1: Review confirms per-domain modules deleted [PRIMARY]
- **GIVEN:** Filesystem and codebase after pipes-3 implementation
- **WHEN:** Reviewer runs find commands for per-domain directories and grep for module imports
- **THEN:** Review confirms zero per-domain module directories exist and no imports reference deleted modules
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `find services/platform/src -type d \( -name whatsnew -o -name assimilate -o -name shop -o -name subscriptions \) | wc -l | grep 0 && grep -r 'from.*whatsnew' services/platform/src --include='*.ts' | wc -l | grep 0`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `stdout`
  - Negative control: fails if any of: stub, static, missing-impl
  - Case 1:
    - Start: `post_implementation`
    - Action (mastra-reviewer): run find for per-domain directories; run grep for module imports; verify zero results
    - Must observe: directory_count = 0; import_ref_count = 0; exit_code = 0
    - Must not observe: directory_count = 0; import_ref_count = 0; exit_code = 0

### AC-2: Review confirms shared templates used by all pipelines
- **GIVEN:** Mission registry and template definitions
- **WHEN:** Reviewer queries mission_templates table and template source files
- **THEN:** Review confirms evidence-research, business-report, whatsnew, assimilate, shop, subscriptions templates exist and pipelines reference them
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `psql $DATABASE_URL -c "SELECT template_key FROM mission_templates WHERE template_key IN ('evidence-research', 'business-report', 'whatsnew', 'assimilate', 'shop', 'subscriptions')" | grep -c -E 'evidence-research|business-report|whatsnew|assimilate|shop|subscriptions' | grep 6`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `db_query`
  - Negative control: fails if any of: stub, static, missing-impl
  - Case 1:
    - Start: `post_implementation`
    - Action (mastra-reviewer): query mission_templates table; verify 6 template rows exist; check template source files
    - Must observe: count(DISTINCT template_key) = 6; template_keys contain 'evidence-research'; file_count >= 6
    - Must not observe: count(DISTINCT template_key) < 6; missing template_key (at least one of the 6 has 0 registered rows); file_count < 6

### AC-3: Review confirms sub-workflow calls use template references
- **GIVEN:** Subscriptions template and evidence-research template
- **WHEN:** Reviewer inspects subscriptions template source for sub-workflow invocation
- **THEN:** Review confirms sub-workflow call uses 'subworkflow:evidence-research' reference, not direct executor
- **Test tier:** `unit`
- **Verification service:** `None`
- **Unit-test justified:** Pure code inspection, no external dependencies
- **Flow ref:** `UC-SVC-02`
- **Verify:** `grep -r 'subworkflow:evidence-research' services/platform/src/mission/templates/subscriptions.ts | wc -l | grep -v 0`
- **Scenario:**
  - Tier: `visible`; test tier: `unit`; verification service: `None`; topology: `single-node`; evidence: `stdout`
  - Negative control: fails if any of: stub, static, missing-impl
  - Case 1:
    - Start: `subscriptions_template_source`
    - Action (mastra-reviewer): grep subscriptions template for sub-workflow; verify template reference format
    - Must observe: match_count >= 1; match contains 'subworkflow:evidence-research'; executor_ref_count = 0
    - Must not observe: match_count = 0; contains 'executor_ref'; executor_ref_count > 0

### AC-4: Review confirms TDD RED evidence exists
- **GIVEN:** Git history and test output artifacts
- **WHEN:** Reviewer checks for RED commit and /tmp/red-output.txt artifacts
- **THEN:** Review confirms RED phase was completed before implementation with captured failure output
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `git log --oneline --all | grep 'pipes-4 RED' | head -1 && test -f .spec/reviews/sprint-22/pipes-4-red-evidence.md`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `file_artifact`
  - Negative control: fails if any of: stub, static, missing-impl
  - Case 1:
    - Start: `git_history_check`
    - Action (mastra-reviewer): check git log for RED commit; verify RED evidence file exists; review RED output content
    - Must observe: commit_count >= 1; file_exists = 1; grep_count >= 1
    - Must not observe: commit_count = 0; file_exists = 0; grep_count = 0

### AC-5: Review confirms no inline executable payloads in templates
- **GIVEN:** Template definition files in mission/templates/
- **WHEN:** Reviewer greps templates for executable patterns (inlineZod, rawSql, js, javascript, executable, function)
- **THEN:** Review confirms zero banned executable keys exist in template payloads
- **Test tier:** `unit`
- **Verification service:** `None`
- **Unit-test justified:** Static code inspection, no runtime dependencies
- **Flow ref:** `UC-SVC-02`
- **Verify:** `grep -rE 'inlineZod|rawSql|\bjs\b|javascript|executable|function' services/platform/src/mission/templates/*.ts | grep -E '(template|stageGraph|executor)' | wc -l | grep 0`
- **Scenario:**
  - Tier: `visible`; test tier: `unit`; verification service: `None`; topology: `single-node`; evidence: `stdout`
  - Negative control: fails if any of: stub, static, missing-impl
  - Case 1:
    - Start: `template_files`
    - Action (mastra-reviewer): grep templates for banned keys; verify zero matches; inspect any suspicious patterns
    - Must observe: grep_count = 0; exit_code = 0
    - Must not observe: grep_count > 0; exit_code != 0

## Test Criteria
| ID | Maps to | Type | Statement | Verify |
|---|---|---|---|---|
| TC-1 | AC-1 | happy_path | Zero per-domain module directories exist | `find services/platform/src -type d \( -name whatsnew -o -name assimilate -o -name shop -o -name subscriptions \) | wc -l | grep 0` |
| TC-2 | AC-2 | happy_path | All 6 required templates exist in registry | `psql $DATABASE_URL -c "SELECT COUNT(DISTINCT template_key) FROM mission_templates WHERE template_key IN ('evidence-research', 'business-report', 'whatsnew', 'assimilate', 'shop', 'subscriptions')" | grep 6` |
| TC-3 | AC-3 | happy_path | Sub-workflow call uses template reference format | `grep 'subworkflow:evidence-research' services/platform/src/mission/templates/subscriptions.ts | wc -l | grep -v 0` |
| TC-4 | AC-4 | happy_path | RED evidence file exists with failure output | `test -f .spec/reviews/sprint-22/pipes-4-red-evidence.md && grep 'FAIL' .spec/reviews/sprint-22/pipes-4-red-evidence.md | wc -l | grep -v 0` |
| TC-5 | AC-5 | boundary | No executable payloads in template files | `grep -rE 'inlineZod|rawSql|\bjs\b|javascript|executable|function' services/platform/src/mission/templates/*.ts | wc -l | grep 0` |

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
| Scenario validation | `python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py < pipes-5-scenarios.json` | Exit 0; zero CRITICAL or HIGH. |
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
- **Depends on:** pipes-3
- **Blocks:** none

## Agent Instructions
Review/INFRA task — use the stated integration and seeded-evidence gates. Adversarially verify the DRY collapse: per-domain modules gone, shared templates present, sub-workflow calls use template references, RED evidence captured. Do not approve on 'exit 0' alone.

## Requirement Contract
<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "pipes-5",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "post_implementation": {
      "description": "Codebase after all implementation tasks complete",
      "seed_method": "public_api",
      "records": [
        "templates implemented",
        "per-domain modules deleted",
        "tests passing"
      ]
    },
    "subscriptions_template_source": {
      "description": "subscriptions.ts template file",
      "seed_method": "public_api",
      "records": [
        "file exists at mission/templates/subscriptions.ts",
        "file contains sub-workflow reference"
      ]
    },
    "git_history_check": {
      "description": "Git commit history",
      "seed_method": "public_api",
      "records": [
        "pipes-4 RED commit exists",
        "pipes-1/2/3 implementation commits follow",
        "RED evidence file captured"
      ]
    },
    "template_files": {
      "description": "Mission template definition files",
      "seed_method": "public_api",
      "records": [
        "templates/*.ts files exist",
        "no executable payloads in templates",
        "closed DSL used throughout"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN Filesystem and codebase after pipes-3 implementation WHEN Reviewer runs find commands for per-domain directories and grep for module imports THEN Review confirms zero per-domain module directories exist and no imports reference deleted modules",
      "verify": "find services/platform/src -type d \\( -name whatsnew -o -name assimilate -o -name shop -o -name subscriptions \\) | wc -l | grep 0 && grep -r 'from.*whatsnew' services/platform/src --include='*.ts' | wc -l | grep 0",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "static",
            "missing-impl"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "post_implementation",
            "action": {
              "actor": "mastra-reviewer",
              "steps": [
                "run find for per-domain directories",
                "run grep for module imports",
                "verify zero results"
              ]
            },
            "end_state": {
              "must_observe": [
                "directory_count = 0",
                "import_ref_count = 0",
                "exit_code = 0"
              ],
              "must_not_observe": [
                "directory_count = 0",
                "import_ref_count = 0",
                "exit_code = 0"
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
      "description": "GIVEN Mission registry and template definitions WHEN Reviewer queries mission_templates table and template source files THEN Review confirms evidence-research, business-report, whatsnew, assimilate, shop, subscriptions templates exist and pipelines reference them",
      "verify": "psql $DATABASE_URL -c \"SELECT template_key FROM mission_templates WHERE template_key IN ('evidence-research', 'business-report', 'whatsnew', 'assimilate', 'shop', 'subscriptions')\" | grep -c -E 'evidence-research|business-report|whatsnew|assimilate|shop|subscriptions' | grep 6",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "static",
            "missing-impl"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "post_implementation",
            "action": {
              "actor": "mastra-reviewer",
              "steps": [
                "query mission_templates table",
                "verify 6 template rows exist",
                "check template source files"
              ]
            },
            "end_state": {
              "must_observe": [
                "count(DISTINCT template_key) = 6",
                "template_keys contain 'evidence-research'",
                "file_count >= 6"
              ],
              "must_not_observe": [
                "count(DISTINCT template_key) < 6",
                "missing template_key (at least one of the 6 has 0 registered rows)",
                "file_count < 6"
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
      "description": "GIVEN Subscriptions template and evidence-research template WHEN Reviewer inspects subscriptions template source for sub-workflow invocation THEN Review confirms sub-workflow call uses 'subworkflow:evidence-research' reference, not direct executor",
      "verify": "grep -r 'subworkflow:evidence-research' services/platform/src/mission/templates/subscriptions.ts | wc -l | grep -v 0",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": null,
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "static",
            "missing-impl"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "subscriptions_template_source",
            "action": {
              "actor": "mastra-reviewer",
              "steps": [
                "grep subscriptions template for sub-workflow",
                "verify template reference format"
              ]
            },
            "end_state": {
              "must_observe": [
                "match_count >= 1",
                "match contains 'subworkflow:evidence-research'",
                "executor_ref_count = 0"
              ],
              "must_not_observe": [
                "match_count = 0",
                "contains 'executor_ref'",
                "executor_ref_count > 0"
              ]
            }
          }
        ],
        "primary": false
      },
      "unit_test_justified": "Pure code inspection, no external dependencies"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN Git history and test output artifacts WHEN Reviewer checks for RED commit and /tmp/red-output.txt artifacts THEN Review confirms RED phase was completed before implementation with captured failure output",
      "verify": "git log --oneline --all | grep 'pipes-4 RED' | head -1 && test -f .spec/reviews/sprint-22/pipes-4-red-evidence.md",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "static",
            "missing-impl"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "git_history_check",
            "action": {
              "actor": "mastra-reviewer",
              "steps": [
                "check git log for RED commit",
                "verify RED evidence file exists",
                "review RED output content"
              ]
            },
            "end_state": {
              "must_observe": [
                "commit_count >= 1",
                "file_exists = 1",
                "grep_count >= 1"
              ],
              "must_not_observe": [
                "commit_count = 0",
                "file_exists = 0",
                "grep_count = 0"
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
      "description": "GIVEN Template definition files in mission/templates/ WHEN Reviewer greps templates for executable patterns (inlineZod, rawSql, js, javascript, executable, function) THEN Review confirms zero banned executable keys exist in template payloads",
      "verify": "grep -rE 'inlineZod|rawSql|\\bjs\\b|javascript|executable|function' services/platform/src/mission/templates/*.ts | grep -E '(template|stageGraph|executor)' | wc -l | grep 0",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": null,
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "static",
            "missing-impl"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "template_files",
            "action": {
              "actor": "mastra-reviewer",
              "steps": [
                "grep templates for banned keys",
                "verify zero matches",
                "inspect any suspicious patterns"
              ]
            },
            "end_state": {
              "must_observe": [
                "grep_count = 0",
                "exit_code = 0"
              ],
              "must_not_observe": [
                "grep_count > 0",
                "exit_code != 0"
              ]
            }
          }
        ],
        "primary": false
      },
      "unit_test_justified": "Static code inspection, no runtime dependencies"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Zero per-domain module directories exist",
      "verify": "find services/platform/src -type d \\( -name whatsnew -o -name assimilate -o -name shop -o -name subscriptions \\) | wc -l | grep 0",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "All 6 required templates exist in registry",
      "verify": "psql $DATABASE_URL -c \"SELECT COUNT(DISTINCT template_key) FROM mission_templates WHERE template_key IN ('evidence-research', 'business-report', 'whatsnew', 'assimilate', 'shop', 'subscriptions')\" | grep 6",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Sub-workflow call uses template reference format",
      "verify": "grep 'subworkflow:evidence-research' services/platform/src/mission/templates/subscriptions.ts | wc -l | grep -v 0",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "RED evidence file exists with failure output",
      "verify": "test -f .spec/reviews/sprint-22/pipes-4-red-evidence.md && grep 'FAIL' .spec/reviews/sprint-22/pipes-4-red-evidence.md | wc -l | grep -v 0",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "No executable payloads in template files",
      "verify": "grep -rE 'inlineZod|rawSql|\\bjs\\b|javascript|executable|function' services/platform/src/mission/templates/*.ts | wc -l | grep 0",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->
