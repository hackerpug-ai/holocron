# pipes-2: One parameterized business-report template (4 kinds), reasoning on the fleet
> Status: ✅ Completed
> Cycle: 2
> Commit: a37a76216ce21ff1d0034c1287e15e802d100438
> Reviewer: mastra-reviewer
> Completed: 2026-07-21T16:41:57Z

- **Sprint:** [Sprint 22: All Agentic Pipelines as Templates/Agents](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `M`
- **Estimate:** `240 minutes`
- **Agent:** `mastra-implementer` — Mastra template implementation requires TypeScript + Mastra workflow composition against real Postgres + fleet
- **Reviewer:** `mastra-reviewer`
- **Proposed By:** `mastra-planner`
- **TDD Mode:** `red_first`
- **RED/GREEN Required:** `yes`

## Outcome
Create a single parameterized business-report mission template that generates revenue-validation, competitive-analysis, ai-roi, and flights reports from one template row with reasoning executed server-side on the local inference fleet.

## Background
This task is part of Sprint 22's collapse of holocron's per-domain agentic pipelines onto the Sprint 15 mission engine as shared templates/agents (UC-SVC-02). Create a single parameterized business-report mission template that generates revenue-validation, competitive-analysis, ai-roi, and flights reports from one template row with reasoning executed server-side on the local inference fleet. The mission-engine substrate lives in `services/platform/src/mission/` and the shared evidence-research core in `services/platform/src/research/`.

## Specification
- **Objective:** Create a single parameterized business-report mission template that generates revenue-validation, competitive-analysis, ai-roi, and flights reports from one template row with reasoning executed server-side on the local inference fleet.
- **Success state:** holo mission run report --kind revenue-validation --target 'example.com' produces the former revenue-validation report shape with DVF scoring, market sizing, and competitor analysis from real fleet reasoning; the same template with --kind competitive produces competitive-analysis output.

## Critical Constraints
### MUST
- MUST Template MUST parameterize report kind (revenue-validation/competitive/ai-roi/flights) through template parameter, not separate template rows
- MUST All reasoning MUST execute server-side on the fleet (CAP-INF-01), never client-side Claude skills
- MUST Template MUST output former business-report shape (sections, verdicts, evidence, recommendations)
- MUST Role bindings MUST use ASSAY≠CHALLENGE where claim validation occurs
### NEVER
- NEVER invoke Claude API from client-side for business reasoning
- NEVER create separate template rows for each report kind
- NEVER skip fleet health checks before reasoning steps
- NEVER allow report generation without required components (e.g. market size for revenue-validation)
### STRICTLY
- STRICTLY Report kind parameter MUST be validated against allowed kinds enum
- STRICTLY Each report kind MUST have required components validated before reasoning
- STRICTLY Template MUST checkpoint before and after reasoning step

## Capability Chain
- **Touches:** CAP-INF-01
**Provides:**
- business-report-template
**Consumes:**
- CAP-INF-01

## Acceptance Criteria
### AC-1: Parameterized business-report template generates revenue-validation report [PRIMARY]
- **GIVEN:** Business-report template exists with kind parameter and fleet role binding
- **WHEN:** Operator runs holo mission run report --kind revenue-validation --target 'acme-corp.com'
- **THEN:** Mission completes with report output containing DVF score, market sizing (TAM/SAM/SOM), competitive positioning, and unit economics
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `holo mission run report --kind revenue-validation --target 'acme-corp.com' && psql $DATABASE_URL -c "SELECT output->>'reportKind' as kind, output->>'dvfScore' as dvf FROM mission_runs WHERE template_key='business-report' ORDER BY created_at DESC LIMIT 1" | grep -E 'revenue-validation|[0-9]'`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `db_query`
  - Negative control: fails if any of: stub, empty, static, disconnect
  - Case 1:
    - Start: `empty_report_db`
    - Action (cli_user): run holo mission run report --kind revenue-validation --target "acme-corp.com"
    - Must observe: output->>'reportKind' = 'revenue-validation'; output->>'dvfScore' >= 0; output->'marketSizing'->>'tam' > 0; jsonb_array_length(output->'competitivePositioning') >= 1
    - Must not observe: '(0)' competitive positioning entries; output->>'dvfScore' is NULL; output->'marketSizing' is NULL

### AC-2: Same template generates competitive-analysis report with different parameters
- **GIVEN:** Business-report template exists with kind parameter
- **WHEN:** Operator runs holo mission run report --kind competitive --target 'startup.io'
- **THEN:** Mission completes using same template_key with reportKind='competitive' and competitor matrix output
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `holo mission run report --kind competitive --target 'startup.io' && psql $DATABASE_URL -c "SELECT DISTINCT template_key, output->>'reportKind' as kind FROM mission_runs WHERE run_id IN (SELECT run_id FROM mission_run_tags WHERE tag='competitive') ORDER BY created_at DESC LIMIT 1" | grep -E 'business-report|competitive'`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `db_query`
  - Negative control: fails if any of: stub, empty, static, disconnect
  - Case 1:
    - Start: `empty_report_db`
    - Action (cli_user): run holo mission run report --kind competitive --target "startup.io"
    - Must observe: template_key = 'business-report'; output->>'reportKind' = 'competitive'; output->'competitorMatrix' is NOT NULL
    - Must not observe: template_key = 'competitive-analysis'; output->>'reportKind' != 'competitive'; output->'competitorMatrix' is NULL/empty (0 competitors)

### AC-3: Report reasoning executes on fleet, not client-side Claude API
- **GIVEN:** Business-report mission with reasoning stage referencing fleet role
- **WHEN:** Mission executes reasoning step for ai-roi report
- **THEN:** Fleet role endpoint is called and trace shows server-side model invocation with no client-side Claude API calls
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `holo infer:trace $RUN_ID | jq '.modelCalls[] | select(.provider=="fleet") | .modelId' | grep -v 'anthropic' && holo infer:trace $RUN_ID | jq '.modelCalls[] | select(.provider=="anthropic")' | grep -c 'null'`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `db_query`
  - Negative control: fails if any of: stub, empty, static, disconnect
  - Case 1:
    - Start: `fleet_running`
    - Action (cli_user): run holo mission run report --kind ai-roi --target "tool.com"; capture trace ID from output; run holo infer:trace 
    - Must observe: count(fleet modelCalls) >= 1; modelCalls[0].provider = 'fleet'; count(anthropic modelCalls) = 0
    - Must not observe: count(fleet modelCalls) = 0; count(anthropic modelCalls) > 0; modelCalls[0].provider = 'anthropic'

### AC-4: Template validates required components per report kind
- **GIVEN:** Business-report template with required components per kind (market sizing for revenue-validation)
- **WHEN:** Operator runs report with missing required data
- **THEN:** Mission fails at component validation stage before reasoning with explicit missing component error
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `holo mission run report --kind revenue-validation --target 'incomplete.com' && psql $DATABASE_URL -c "SELECT error->>'missingComponents' as missing FROM mission_runs WHERE run_id='$RUN_ID'" | grep -o 'market_sizing'`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `db_query`
  - Negative control: fails if any of: stub, empty, static, disconnect
  - Case 1:
    - Start: `incomplete_target_data`
    - Action (cli_user): run holo mission run report --kind revenue-validation --target "incomplete.com"
    - Must observe: status = 'failed'; error->>'stage' = 'component_validation'; error->>'missingComponents' LIKE '%market_sizing%'
    - Must not observe: status = 'completed'; error is NULL; error->>'missingComponents' is NULL OR empty

## Test Criteria
| ID | Maps to | Type | Statement | Verify |
|---|---|---|---|---|
| TC-1 | AC-1 | happy_path | Business-report template row has parameterizable kind enum | `psql $DATABASE_URL -c "SELECT parameter_schema FROM mission_templates WHERE template_key='business-report'" | grep -o 'revenue-validation|competitive|ai-roi|flights' | wc -l | grep 4` |
| TC-2 | AC-2 | happy_path | All 4 report kinds use same template_key | `psql $DATABASE_URL -c "SELECT COUNT(DISTINCT template_key) FROM mission_runs WHERE template_key LIKE '%business%' AND output->>'reportKind' IN ('revenue-validation', 'competitive', 'ai-roi', 'flights')" | grep 1` |
| TC-3 | AC-3 | happy_path | Trace shows fleet provider, no anthropic calls | `holo infer:trace $TRACE_ID | jq '[.modelCalls[] | select(.provider=="fleet")] | length' | grep -v 0` |
| TC-4 | AC-4 | boundary | Missing components fail before reasoning | `psql $DATABASE_URL -c "SELECT stage, error FROM mission_runs WHERE template_key='business-report' AND status='failed' AND error->>'missingComponents' IS NOT NULL" | grep component_validation` |

## Reading List
| Path | Lines | Focus |
|---|---|---|
| `services/platform/src/mission/contract.ts` | 75-89 | Mission template parameter schema |
| `.spec/prds/mk6-migration/06-uc-svc.md` | 31-41 | UC-SVC-02 business pipeline collapse requirement |
| `.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md` | 1-50 | CAP-INF-01 fleet reasoning capability |
| `services/platform/src/fleet/manifest.schema.ts` | 1-50 | Fleet role manifest and health probe |
| `services/platform/src/inference/resolve-model.ts` | 1-50 | Fleet model resolution and tracing |

## Guardrails
**WRITE-ALLOWED**
- services/platform/src/mission/templates/business-report.ts (NEW)
- services/platform/src/mission/registry.ts (MODIFY)
- services/platform/src/tools/schemas/business.ts (NEW)
- services/platform/src/db/schema/mission.ts (MODIFY if needed)
- services/platform/src/__tests__/integration/business-report-template.test.ts (NEW)
**WRITE-PROHIBITED**
- services/business/legacy/ — any old business report modules must be deleted, not modified
- client-side Claude skills for business reasoning — this must be server-side only

## Design / Pipeline Semantics
**References:**
- services/platform/src/mission/contract.ts (MissionTemplateSchema)
- .spec/prds/mk6-migration/06-uc-svc.md (UC-SVC-02)
- .spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md (CAP-INF-01)
**Interaction notes:**
- Template uses parameter binding for report kind
- Fleet role binding through modelRoleBindings in template
- Component validation stage before reasoning
- **Pattern:** Parameterized template with kind enum and fleet reasoning
- **Pattern source:** `services/platform/src/mission/contract.ts:75-89`
- **Anti-pattern:** Client-side Claude skills, separate template per kind

## Verification Gates
| Gate | Command | Expected |
|---|---|---|
| RED phase evidence | `git log --oneline --all | grep 'pipes-4 RED' | head -1` | Commit message shows RED tests were written first |
| Integration tests pass | `pnpm test:integration business-report-template.test.ts` | Exit 0 |
| Type check | `pnpm typecheck` | Exit 0 |
| Lint | `pnpm lint` | Exit 0 |
| All 4 report kinds generate | `holo mission run report --kind revenue-validation --target 'test.com' && holo mission run report --kind competitive --target 'test.com' && holo mission run report --kind ai-roi --target 'test.com' && holo mission run report --kind flights --destination 'SFO-JFK'` | Exit 0 for all 4 kinds |
| Scenario validation | `python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py < pipes-2-scenarios.json` | Exit 0; zero CRITICAL or HIGH. |
| Type check + lint | `pnpm typecheck && pnpm lint` | Both exit 0. |

## Coding Standards
- brain/docs/coding-standards/
- brain/docs/mastra/README.md
- brain/docs/TDD-METHODOLOGY.md
- /Users/inference1/Projects/brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- /Users/inference1/Projects/brain/docs/REQUIREMENT-TRACKING.md

## Review Criteria
- All AC/TC IDs remain stable; every behavioral AC carries an un-fakeable scenario.
- No fake/static/empty success path; negative controls fail against disconnected, stubbed, empty, or missing-implementation states.
- All writes stay within WRITE-ALLOWED; verification gates produce captured evidence (not merely 'exit 0').
- Per-domain copy-pasted pipeline modules are provably gone (`holo verify:no-shells`), replaced by shared templates + the tool/schema registry.
- Reasoning runs server-side on the fleet (CAP-INF-01) — no client-side Claude skill on the path.

## Dependencies
- **Depends on:** pipes-4
- **Blocks:** pipes-3

## Agent Instructions
Follow RED → GREEN → REFACTOR per AC. Write the failing test against the real Postgres+fleet entrypoint first (pipes-4 owns the consolidated RED suite; coordinate so the RED commit lands before implementation). The RED proof must fail against the empty/disconnected start state — capture the failure output, not just the green. Keep reasoning server-side on the fleet.

## Requirement Contract
<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "pipes-2",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "empty_report_db": {
      "description": "Postgres with no business-report runs",
      "seed_method": "public_api",
      "records": [
        "mission_runs table is empty",
        "mission_templates contains business-report template"
      ]
    },
    "fleet_running": {
      "description": "Fleet role endpoint is reachable and healthy",
      "seed_method": "public_api",
      "records": [
        "fleet role health probe returns 200",
        "model manifest contains required reasoning models"
      ]
    },
    "incomplete_target_data": {
      "description": "Target website with incomplete data for required components",
      "seed_method": "public_api",
      "records": [
        "website accessible but missing pricing page",
        "no market sizing data available",
        "competitor data incomplete"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN Business-report template exists with kind parameter and fleet role binding WHEN Operator runs holo mission run report --kind revenue-validation --target 'acme-corp.com' THEN Mission completes with report output containing DVF score, market sizing (TAM/SAM/SOM), competitive positioning, and unit economics",
      "verify": "holo mission run report --kind revenue-validation --target 'acme-corp.com' && psql $DATABASE_URL -c \"SELECT output->>'reportKind' as kind, output->>'dvfScore' as dvf FROM mission_runs WHERE template_key='business-report' ORDER BY created_at DESC LIMIT 1\" | grep -E 'revenue-validation|[0-9]'",
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
            "start_ref": "empty_report_db",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run holo mission run report --kind revenue-validation --target \"acme-corp.com\""
              ]
            },
            "end_state": {
              "must_observe": [
                "output->>'reportKind' = 'revenue-validation'",
                "output->>'dvfScore' >= 0",
                "output->'marketSizing'->>'tam' > 0",
                "jsonb_array_length(output->'competitivePositioning') >= 1"
              ],
              "must_not_observe": [
                "'(0)' competitive positioning entries",
                "output->>'dvfScore' is NULL",
                "output->'marketSizing' is NULL"
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
      "description": "GIVEN Business-report template exists with kind parameter WHEN Operator runs holo mission run report --kind competitive --target 'startup.io' THEN Mission completes using same template_key with reportKind='competitive' and competitor matrix output",
      "verify": "holo mission run report --kind competitive --target 'startup.io' && psql $DATABASE_URL -c \"SELECT DISTINCT template_key, output->>'reportKind' as kind FROM mission_runs WHERE run_id IN (SELECT run_id FROM mission_run_tags WHERE tag='competitive') ORDER BY created_at DESC LIMIT 1\" | grep -E 'business-report|competitive'",
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
            "start_ref": "empty_report_db",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run holo mission run report --kind competitive --target \"startup.io\""
              ]
            },
            "end_state": {
              "must_observe": [
                "template_key = 'business-report'",
                "output->>'reportKind' = 'competitive'",
                "output->'competitorMatrix' is NOT NULL"
              ],
              "must_not_observe": [
                "template_key = 'competitive-analysis'",
                "output->>'reportKind' != 'competitive'",
                "output->'competitorMatrix' is NULL/empty (0 competitors)"
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
      "description": "GIVEN Business-report mission with reasoning stage referencing fleet role WHEN Mission executes reasoning step for ai-roi report THEN Fleet role endpoint is called and trace shows server-side model invocation with no client-side Claude API calls",
      "verify": "holo infer:trace $RUN_ID | jq '.modelCalls[] | select(.provider==\"fleet\") | .modelId' | grep -v 'anthropic' && holo infer:trace $RUN_ID | jq '.modelCalls[] | select(.provider==\"anthropic\")' | grep -c 'null'",
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
            "start_ref": "fleet_running",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run holo mission run report --kind ai-roi --target \"tool.com\"",
                "capture trace ID from output",
                "run holo infer:trace "
              ]
            },
            "end_state": {
              "must_observe": [
                "count(fleet modelCalls) >= 1",
                "modelCalls[0].provider = 'fleet'",
                "count(anthropic modelCalls) = 0"
              ],
              "must_not_observe": [
                "count(fleet modelCalls) = 0",
                "count(anthropic modelCalls) > 0",
                "modelCalls[0].provider = 'anthropic'"
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
      "description": "GIVEN Business-report template with required components per kind (market sizing for revenue-validation) WHEN Operator runs report with missing required data THEN Mission fails at component validation stage before reasoning with explicit missing component error",
      "verify": "holo mission run report --kind revenue-validation --target 'incomplete.com' && psql $DATABASE_URL -c \"SELECT error->>'missingComponents' as missing FROM mission_runs WHERE run_id='$RUN_ID'\" | grep -o 'market_sizing'",
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
            "start_ref": "incomplete_target_data",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run holo mission run report --kind revenue-validation --target \"incomplete.com\""
              ]
            },
            "end_state": {
              "must_observe": [
                "status = 'failed'",
                "error->>'stage' = 'component_validation'",
                "error->>'missingComponents' LIKE '%market_sizing%'"
              ],
              "must_not_observe": [
                "status = 'completed'",
                "error is NULL",
                "error->>'missingComponents' is NULL OR empty"
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
      "description": "Business-report template row has parameterizable kind enum",
      "verify": "psql $DATABASE_URL -c \"SELECT parameter_schema FROM mission_templates WHERE template_key='business-report'\" | grep -o 'revenue-validation|competitive|ai-roi|flights' | wc -l | grep 4",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "All 4 report kinds use same template_key",
      "verify": "psql $DATABASE_URL -c \"SELECT COUNT(DISTINCT template_key) FROM mission_runs WHERE template_key LIKE '%business%' AND output->>'reportKind' IN ('revenue-validation', 'competitive', 'ai-roi', 'flights')\" | grep 1",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Trace shows fleet provider, no anthropic calls",
      "verify": "holo infer:trace $TRACE_ID | jq '[.modelCalls[] | select(.provider==\"fleet\")] | length' | grep -v 0",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Missing components fail before reasoning",
      "verify": "psql $DATABASE_URL -c \"SELECT stage, error FROM mission_runs WHERE template_key='business-report' AND status='failed' AND error->>'missingComponents' IS NOT NULL\" | grep component_validation",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
