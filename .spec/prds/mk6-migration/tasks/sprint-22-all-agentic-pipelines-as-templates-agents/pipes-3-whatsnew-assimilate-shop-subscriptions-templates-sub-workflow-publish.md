# pipes-3: whatsNew/assimilate/shop/subscriptions as templates/agents + standing sub-workflow publish
> Status: ✅ Completed
> Cycle: 2
> Commit: c1f5476066baa2a50cdfc05e80d7b380c2719b0c
> Reviewer: mastra-reviewer
> Completed: 2026-07-21T17:29:10Z

- **Sprint:** [Sprint 22: All Agentic Pipelines as Templates/Agents](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `M`
- **Estimate:** `300 minutes`
- **Agent:** `mastra-implementer` — Mastra template/agent implementation requires TypeScript + Mastra workflow composition against real Postgres + fleet
- **Reviewer:** `mastra-reviewer`
- **Proposed By:** `mastra-planner`
- **TDD Mode:** `red_first`
- **RED/GREEN Required:** `yes`

## Outcome
Re-express whatsNew, assimilate, shop, and subscriptions pipelines as mission templates or Mastra agents, eliminate per-domain copy-pasted modules, and implement a standing subscriptions mission that invokes the shared research template as a sub-workflow and publishes a document.

## Background
This task is part of Sprint 22's collapse of holocron's per-domain agentic pipelines onto the Sprint 15 mission engine as shared templates/agents (UC-SVC-02). Re-express whatsNew, assimilate, shop, and subscriptions pipelines as mission templates or Mastra agents, eliminate per-domain copy-pasted modules, and implement a standing subscriptions mission that invokes the shared research template as a sub-workflow and publishes a document. The mission-engine substrate lives in `services/platform/src/mission/` and the shared evidence-research core in `services/platform/src/research/`.

## Specification
- **Objective:** Re-express whatsNew, assimilate, shop, and subscriptions pipelines as mission templates or Mastra agents, eliminate per-domain copy-pasted modules, and implement a standing subscriptions mission that invokes the shared research template as a sub-workflow and publishes a document.
- **Success state:** holo mission run whatsNew produces the former daily briefing document shape; holo mission run assimilate --target <repo> produces former assimilation output; holo mission run shop --query <term> produces former shop results; a standing subscriptions mission invokes research as sub-workflow and publishes; holo verify:no-shells reports all per-domain modules deleted.

## Critical Constraints
### MUST
- MUST Each pipeline MUST re-express as a mission template or Mastra agent
- MUST subscriptions MUST invoke shared research template as a sub-workflow
- MUST All per-domain module directories MUST be deleted after template migration
- MUST Standing mission MUST publish document through idempotent publish path
### NEVER
- NEVER leave per-domain copy-pasted pipeline modules (whatsnew/, assimilate/, shop/, subscriptions/ directories)
- NEVER invoke subscriptions research as a separate pipeline instead of sub-workflow
- NEVER publish without idempotency key in document path
- NEVER skip sub-workflow checkpoint commits
### STRICTLY
- STRICTLY Each template MUST produce former pipeline output shape exactly
- STRICTLY Sub-workflow calls MUST use template reference, not direct executor calls
- STRICTLY Document publish MUST be atomic with document row creation

## Capability Chain
- **Touches:** CAP-INF-01, CAP-EMB-01
**Provides:**
- whatsnew-template
- assimilate-template
- shop-template
- subscriptions-template
- standing-sub-workflow
**Consumes:**
- CAP-INF-01
- CAP-EMB-01

## Acceptance Criteria
### AC-1: whatsNew template produces former daily briefing shape [PRIMARY]
- **GIVEN:** whatsNew template exists in mission registry
- **WHEN:** Operator runs holo mission run whatsNew --date 2026-07-20
- **THEN:** Mission completes with briefing document containing headlines, summaries, and links matching former whatsNew output
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `holo mission run whatsNew --date 2026-07-20 && psql $DATABASE_URL -c "SELECT output->>'documentType' as type, jsonb_array_length(output->'headlines') as count FROM mission_runs WHERE template_key='whatsnew' ORDER BY created_at DESC LIMIT 1" | grep -E 'daily-briefing|[1-9]'`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `db_query`
  - Negative control: fails if any of: stub, empty, static, disconnect
  - Case 1:
    - Start: `empty_mission_db`
    - Action (cli_user): run holo mission run whatsNew --date 2026-07-20
    - Must observe: output->>'documentType' = 'daily-briefing'; jsonb_array_length(output->'headlines') >= 3; jsonb_array_length(output->'summaries') >= 1
    - Must not observe: '(0)' headlines; '(0)' summaries

### AC-2: assimilate template produces former repo assimilation output
- **GIVEN:** assimilate template exists with repo parameter
- **WHEN:** Operator runs holo mission run assimilate --target 'facebook/react'
- **THEN:** Mission completes with assimilation report containing architecture, patterns, and evaluation matching former assimilate output
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `holo mission run assimilate --target 'facebook/react' && psql $DATABASE_URL -c "SELECT output->>'repoUrl' as repo, output->'architecture'->'components' as components FROM mission_runs WHERE template_key='assimilate' ORDER BY created_at DESC LIMIT 1" | grep -E 'facebook/react|[1-9]'`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `db_query`
  - Negative control: fails if any of: stub, empty, static, disconnect
  - Case 1:
    - Start: `empty_mission_db`
    - Action (cli_user): run holo mission run assimilate --target "facebook/react"
    - Must observe: output->>'repoUrl' = 'facebook/react'; output->'architecture' is NOT NULL; output->'patterns' is NOT NULL
    - Must not observe: output->>'repoUrl' is NULL; output->'architecture' is NULL/empty (0 components); output->'patterns' is NULL

### AC-3: shop template produces former product search results
- **GIVEN:** shop template exists with query parameter
- **WHEN:** Operator runs holo mission run shop --query 'ergonomic keyboard'
- **THEN:** Mission completes with product list containing prices, ratings, and links matching former shop output
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `holo mission run shop --query 'ergonomic keyboard' && psql $DATABASE_URL -c "SELECT jsonb_array_length(output->'products') as count FROM mission_runs WHERE template_key='shop' ORDER BY created_at DESC LIMIT 1" | grep -E '[1-9]'`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `db_query`
  - Negative control: fails if any of: stub, empty, static, disconnect
  - Case 1:
    - Start: `empty_mission_db`
    - Action (cli_user): run holo mission run shop --query "ergonomic keyboard"
    - Must observe: jsonb_array_length(output->'products') >= 1; output->'products'[0]->'price' is NOT NULL; output->'products'[0]->'rating' is NOT NULL
    - Must not observe: jsonb_array_length(output->'products') = 0; output->'products'[0]->'price' is NULL; output->'products'[0]->'rating' is NULL

### AC-4: subscriptions template invokes research as sub-workflow and publishes
- **GIVEN:** subscriptions template exists with sub-workflow reference to evidence-research template
- **WHEN:** Standing subscriptions mission executes on schedule
- **THEN:** Mission invokes research sub-workflow, receives evidence, and publishes document through idempotent publish path
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `psql $DATABASE_URL -c "SELECT subworkflow_calls, document_id FROM mission_runs WHERE template_key='subscriptions' ORDER BY created_at DESC LIMIT 1" | grep -E 'evidence-research|[a-z0-9-]{36}' && psql $DATABASE_URL -c "SELECT COUNT(*) FROM documents WHERE source_run_id IN (SELECT run_id FROM mission_runs WHERE template_key='subscriptions')" | grep -v 0`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `db_query`
  - Negative control: fails if any of: stub, empty, static, disconnect
  - Case 1:
    - Start: `standing_subscription_scheduled`
    - Action (background_job): subscriptions mission trigger fires on schedule; mission calls evidence-research as sub-workflow; mission publishes document
    - Must observe: subworkflow_calls LIKE '%evidence-research%'; document_id ~ '^[a-z0-9-]{36}$'; count(documents WHERE source_run_id = run_id) >= 1
    - Must not observe: subworkflow_calls is NULL OR empty; document_id is NULL; count(documents WHERE source_run_id = run_id) = 0

### AC-5: Per-domain copy-pasted modules are deleted
- **GIVEN:** All pipelines re-expressed as templates/agents
- **WHEN:** Operator runs holo verify:no-shells
- **THEN:** Command reports zero per-domain module directories and confirms all pipelines use shared templates
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `holo verify:no-shells && find services/platform/src -type d -name 'whatsnew' -o -name 'assimilate' -o -name 'shop' -o -name 'subscriptions' | grep -c '.' | grep 0`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `db_query`
  - Negative control: fails if any of: stub, empty, static, disconnect
  - Case 1:
    - Start: `templates_migrated`
    - Action (cli_user): run holo verify:no-shells
    - Must observe: exit_code = 0; stdout contains '0 per-domain modules found'; directory_count = 0
    - Must not observe: exit_code != 0; stdout contains 'found N per-domain modules' where N > 0; directory_count > 0

## Test Criteria
| ID | Maps to | Type | Statement | Verify |
|---|---|---|---|---|
| TC-1 | AC-1 | happy_path | whatsnew, assimilate, shop, subscriptions templates exist in registry | `psql $DATABASE_URL -c "SELECT template_key FROM mission_templates WHERE template_key IN ('whatsnew', 'assimilate', 'shop', 'subscriptions')" | grep -c -E 'whatsnew|assimilate|shop|subscriptions' | grep 4` |
| TC-2 | AC-1 | happy_path | Each template output matches former pipeline shape | `pnpm test -- src/__tests__/integration/pipeline-output-shapes.test.ts --grep 'output shape matches former'` |
| TC-3 | AC-4 | happy_path | Subscriptions template has sub-workflow reference to evidence-research | `psql $DATABASE_URL -c "SELECT stage_graph FROM mission_templates WHERE template_key='subscriptions'" | grep -o 'subworkflow:evidence-research'` |
| TC-4 | AC-4 | happy_path | Document publish is idempotent on retries | `pnpm test -- src/__tests__/integration/document-publish-idempotency.test.ts --grep 'idempotent publish'` |
| TC-5 | AC-5 | boundary | No per-domain module directories remain | `find services/platform/src -type d \( -name whatsnew -o -name assimilate -o -name shop -o -name subscriptions \) | wc -l | grep 0` |

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
| Scenario validation | `python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py < pipes-3-scenarios.json` | Exit 0; zero CRITICAL or HIGH. |
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
- **Depends on:** pipes-1, pipes-2
- **Blocks:** pipes-5

## Agent Instructions
Follow RED → GREEN → REFACTOR per AC. Write the failing test against the real Postgres+fleet entrypoint first (pipes-4 owns the consolidated RED suite; coordinate so the RED commit lands before implementation). The RED proof must fail against the empty/disconnected start state — capture the failure output, not just the green. Keep reasoning server-side on the fleet.

## Requirement Contract
<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "pipes-3",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "empty_mission_db": {
      "description": "Postgres with no pipeline mission runs",
      "seed_method": "public_api",
      "records": [
        "mission_runs table empty",
        "mission_templates contains whatsnew, assimilate, shop, subscriptions templates"
      ]
    },
    "standing_subscription_scheduled": {
      "description": "Standing subscriptions mission triggered by schedule",
      "seed_method": "public_api",
      "records": [
        "subscription schedule triggered",
        "evidence-research sub-workflow ready",
        "documents table ready for publish"
      ]
    },
    "templates_migrated": {
      "description": "All pipelines migrated to templates, per-domain modules deleted",
      "seed_method": "public_api",
      "records": [
        "whatsnew/, assimilate/, shop/, subscriptions/ directories deleted",
        "all templates in mission_templates table"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN whatsNew template exists in mission registry WHEN Operator runs holo mission run whatsNew --date 2026-07-20 THEN Mission completes with briefing document containing headlines, summaries, and links matching former whatsNew output",
      "verify": "holo mission run whatsNew --date 2026-07-20 && psql $DATABASE_URL -c \"SELECT output->>'documentType' as type, jsonb_array_length(output->'headlines') as count FROM mission_runs WHERE template_key='whatsnew' ORDER BY created_at DESC LIMIT 1\" | grep -E 'daily-briefing|[1-9]'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "static",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty_mission_db",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run holo mission run whatsNew --date 2026-07-20"
              ]
            },
            "end_state": {
              "must_observe": [
                "output->>'documentType' = 'daily-briefing'",
                "jsonb_array_length(output->'headlines') >= 3",
                "jsonb_array_length(output->'summaries') >= 1"
              ],
              "must_not_observe": [
                "'(0)' headlines",
                "'(0)' summaries"
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
      "description": "GIVEN assimilate template exists with repo parameter WHEN Operator runs holo mission run assimilate --target 'facebook/react' THEN Mission completes with assimilation report containing architecture, patterns, and evaluation matching former assimilate output",
      "verify": "holo mission run assimilate --target 'facebook/react' && psql $DATABASE_URL -c \"SELECT output->>'repoUrl' as repo, output->'architecture'->'components' as components FROM mission_runs WHERE template_key='assimilate' ORDER BY created_at DESC LIMIT 1\" | grep -E 'facebook/react|[1-9]'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "static",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty_mission_db",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run holo mission run assimilate --target \"facebook/react\""
              ]
            },
            "end_state": {
              "must_observe": [
                "output->>'repoUrl' = 'facebook/react'",
                "output->'architecture' is NOT NULL",
                "output->'patterns' is NOT NULL"
              ],
              "must_not_observe": [
                "output->>'repoUrl' is NULL",
                "output->'architecture' is NULL/empty (0 components)",
                "output->'patterns' is NULL"
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
      "description": "GIVEN shop template exists with query parameter WHEN Operator runs holo mission run shop --query 'ergonomic keyboard' THEN Mission completes with product list containing prices, ratings, and links matching former shop output",
      "verify": "holo mission run shop --query 'ergonomic keyboard' && psql $DATABASE_URL -c \"SELECT jsonb_array_length(output->'products') as count FROM mission_runs WHERE template_key='shop' ORDER BY created_at DESC LIMIT 1\" | grep -E '[1-9]'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "static",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty_mission_db",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run holo mission run shop --query \"ergonomic keyboard\""
              ]
            },
            "end_state": {
              "must_observe": [
                "jsonb_array_length(output->'products') >= 1",
                "output->'products'[0]->'price' is NOT NULL",
                "output->'products'[0]->'rating' is NOT NULL"
              ],
              "must_not_observe": [
                "jsonb_array_length(output->'products') = 0",
                "output->'products'[0]->'price' is NULL",
                "output->'products'[0]->'rating' is NULL"
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
      "description": "GIVEN subscriptions template exists with sub-workflow reference to evidence-research template WHEN Standing subscriptions mission executes on schedule THEN Mission invokes research sub-workflow, receives evidence, and publishes document through idempotent publish path",
      "verify": "psql $DATABASE_URL -c \"SELECT subworkflow_calls, document_id FROM mission_runs WHERE template_key='subscriptions' ORDER BY created_at DESC LIMIT 1\" | grep -E 'evidence-research|[a-z0-9-]{36}' && psql $DATABASE_URL -c \"SELECT COUNT(*) FROM documents WHERE source_run_id IN (SELECT run_id FROM mission_runs WHERE template_key='subscriptions')\" | grep -v 0",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "static",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "standing_subscription_scheduled",
            "action": {
              "actor": "background_job",
              "steps": [
                "subscriptions mission trigger fires on schedule",
                "mission calls evidence-research as sub-workflow",
                "mission publishes document"
              ]
            },
            "end_state": {
              "must_observe": [
                "subworkflow_calls LIKE '%evidence-research%'",
                "document_id ~ '^[a-z0-9-]{36}$'",
                "count(documents WHERE source_run_id = run_id) >= 1"
              ],
              "must_not_observe": [
                "subworkflow_calls is NULL OR empty",
                "document_id is NULL",
                "count(documents WHERE source_run_id = run_id) = 0"
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
      "description": "GIVEN All pipelines re-expressed as templates/agents WHEN Operator runs holo verify:no-shells THEN Command reports zero per-domain module directories and confirms all pipelines use shared templates",
      "verify": "holo verify:no-shells && find services/platform/src -type d -name 'whatsnew' -o -name 'assimilate' -o -name 'shop' -o -name 'subscriptions' | grep -c '.' | grep 0",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "static",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "templates_migrated",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run holo verify:no-shells"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit_code = 0",
                "stdout contains '0 per-domain modules found'",
                "directory_count = 0"
              ],
              "must_not_observe": [
                "exit_code != 0",
                "stdout contains 'found N per-domain modules' where N > 0",
                "directory_count > 0"
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
      "description": "whatsnew, assimilate, shop, subscriptions templates exist in registry",
      "verify": "psql $DATABASE_URL -c \"SELECT template_key FROM mission_templates WHERE template_key IN ('whatsnew', 'assimilate', 'shop', 'subscriptions')\" | grep -c -E 'whatsnew|assimilate|shop|subscriptions' | grep 4",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Each template output matches former pipeline shape",
      "verify": "pnpm test -- src/__tests__/integration/pipeline-output-shapes.test.ts --grep 'output shape matches former'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Subscriptions template has sub-workflow reference to evidence-research",
      "verify": "psql $DATABASE_URL -c \"SELECT stage_graph FROM mission_templates WHERE template_key='subscriptions'\" | grep -o 'subworkflow:evidence-research'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Document publish is idempotent on retries",
      "verify": "pnpm test -- src/__tests__/integration/document-publish-idempotency.test.ts --grep 'idempotent publish'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "No per-domain module directories remain",
      "verify": "find services/platform/src -type d \\( -name whatsnew -o -name assimilate -o -name shop -o -name subscriptions \\) | wc -l | grep 0",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->
