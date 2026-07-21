# pipes-1: Shared evidence-research core template (research/deepResearch/subscriptions-research/fulcrum share it)

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
Create a shared evidence-research mission template that research, deepResearch, subscriptions-research, and fulcrum all instantiate with their own parameters, eliminating per-domain copy-pasted pipeline modules while preserving deterministic evidence admission.

## Background
This task is part of Sprint 22's collapse of holocron's per-domain agentic pipelines onto the Sprint 15 mission engine as shared templates/agents (UC-SVC-02). Create a shared evidence-research mission template that research, deepResearch, subscriptions-research, and fulcrum all instantiate with their own parameters, eliminating per-domain copy-pasted pipeline modules while preserving deterministic evidence admission. The mission-engine substrate lives in `services/platform/src/mission/` and the shared evidence-research core in `services/platform/src/research/`.

## Specification
- **Objective:** Create a shared evidence-research mission template that research, deepResearch, subscriptions-research, and fulcrum all instantiate with their own parameters, eliminating per-domain copy-pasted pipeline modules while preserving deterministic evidence admission.
- **Success state:** holo mission run research --topic 'test topic' produces a research session with admitted evidence against real Postgres; the same template instantiated as deepResearch/subscriptions-research/fulcrum each produce their former output shapes from one shared template row.

## Critical Constraints
### MUST
- MUST Template MUST use the closed Mission Template DSL from services/platform/src/mission/contract.ts
- MUST All executor/schema references MUST resolve through the registry (no inline executable payloads)
- MUST Evidence gate MUST use the pure-TS implementation from services/platform/src/research/evidence-gate.ts
- MUST Template MUST be resumable from any committed step via MissionRuntime resume logic
### NEVER
- NEVER embed executable JavaScript, functions, or raw Zod in template payloads
- NEVER call the fleet directly from template definition — use role bindings only
- NEVER skip checkpoint commits between multi-stage operations
- NEVER allow model choice in evidence admission — gate is deterministic grade/entailment/independence
### STRICTLY
- STRICTLY Every stage MUST declare explicit checkpointKey for crash recovery
- STRICTLY Role bindings MUST use ASSAY≠CHALLENGE pattern where applicable
- STRICTLY Template output schema MUST be registered in tools/schemas/

## Capability Chain
- **Touches:** CAP-INF-01
**Provides:**
- evidence-research-template
**Consumes:**
- CAP-INF-01
- CAP-EMB-01

## Acceptance Criteria
### AC-1: Shared evidence-research template produces research output [PRIMARY]
- **GIVEN:** Mission registry contains the shared evidence-research template row with stageGraph referencing evidence-gate executor
- **WHEN:** Operator runs holo mission run research --topic 'MCP architecture' --components 2
- **THEN:** Mission completes with status='completed' and output contains a research session with at least 2 components covered by admitted evidence items
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `holo mission run research --topic 'MCP architecture' --components 2 && psql $DATABASE_URL -c "SELECT status, components_covered FROM mission_runs WHERE template_key='evidence-research' ORDER BY created_at DESC LIMIT 1" | grep 'completed'`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `db_query`
  - Negative control: fails if any of: stub, empty, static, disconnect
  - Case 1:
    - Start: `empty_research_db`
    - Action (cli_user): run holo mission run research --topic "MCP architecture" --components 2
    - Must observe: status = 'completed'; components_covered >= 2; independent_source_count >= 2; jsonb_array_length(admitted_evidence_ids) >= 1
    - Must not observe: status = 'failed' OR status = 'blocked'; components_covered = 0; independent_source_count = 0; jsonb_array_length(admitted_evidence_ids) = 0

### AC-2: Template instantiates as deepResearch with same executor
- **GIVEN:** Shared evidence-research template exists with parameterizable component count
- **WHEN:** Operator runs holo mission run deepResearch --topic 'TypeScript type system' --components 4
- **THEN:** Mission completes with 4 components covered using the same evidence-gate executor instance
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `holo mission run deepResearch --topic 'TypeScript type system' --components 4 && psql $DATABASE_URL -c "SELECT components_covered FROM mission_runs WHERE template_key='evidence-research' AND run_id IN (SELECT run_id FROM mission_run_tags WHERE tag='deepResearch') ORDER BY created_at DESC LIMIT 1" | grep 4`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `db_query`
  - Negative control: fails if any of: stub, empty, static, disconnect
  - Case 1:
    - Start: `empty_research_db`
    - Action (cli_user): run holo mission run deepResearch --topic "TypeScript type system" --components 4
    - Must observe: components_covered = 4; template_key = 'evidence-research'; executor_ref = 'evidence-gate'
    - Must not observe: components_covered = 0; template_key = 'deepResearch'; executor_ref != 'evidence-gate'

### AC-3: Template admits refuting evidence through same gate
- **GIVEN:** Evidence gate configured with gradeFloor=3, entailmentFloor=0.8, independentSourceFloor=2
- **WHEN:** Mission processes evidence with refuting claims meeting grade/entailment/independence floors
- **THEN:** Gate admits refuting evidence items and sets direction='refuting' in result
- **Test tier:** `unit`
- **Verification service:** `None`
- **Unit-test justified:** Pure-TS deterministic logic in evidence-gate.ts has no external dependencies
- **Flow ref:** `UC-SVC-02`
- **Verify:** `cat > /tmp/refuting_evidence.json << 'EOF'
{"claims":[{"id":"c1","text":"TypeScript types are optional","component":"type_system"}],"evidence":[{"id":"e1","claimId":"c1","component":"type_system","sourceId":"s1","independenceGroup":"g1","quote":"TypeScript types are optional","sourceText":"TypeScript types are optional in JSDoc comments","grade":4,"entailment":0.9,"disconfirmationResolved":true,"direction":"refuting"}],"requiredComponents":["type_system"],"gradeFloor":3,"entailmentFloor":0.8,"independentSourceFloor":2}
EOF
pnpm src/research/test-evidence-gate.ts < /tmp/refuting_evidence.json | jq '.direction' | grep refuting`
- **Scenario:**
  - Tier: `visible`; test tier: `unit`; verification service: `None`; topology: `single-node`; evidence: `stdout`
  - Negative control: fails if any of: stub, empty, static, disconnect
  - Case 1:
    - Start: `empty_evidence_state`
    - Action (api_client): POST /research/test-evidence-gate with refuting evidence payload
    - Must observe: direction = 'refuting'; jsonb_array_length(admittedEvidenceIds) >= 1
    - Must not observe: direction = 'supporting'; admission.admitted = false; jsonb_array_length(admittedEvidenceIds) = 0

### AC-4: Template resumes from suspended checkpoint after SIGKILL
- **GIVEN:** Evidence-research mission suspended at checkpoint after 1 of 3 components
- **WHEN:** Process receives SIGKILL and operator resumes with holo mission resume <runId>
- **THEN:** Mission resumes from the suspended checkpoint and completes remaining components without repeating completed work
- **Test tier:** `integration`
- **Verification service:** `postgres+fleet`
- **Flow ref:** `UC-SVC-02`
- **Verify:** `start mission run, let it suspend, kill -9 $PID, holo mission resume $RUN_ID, psql $DATABASE_URL -c "SELECT checkpoint_index FROM mission_run_checkpoints WHERE run_id='$RUN_ID' ORDER BY checkpoint_index" | grep -c '2'`
- **Scenario:**
  - Tier: `visible`; test tier: `integration`; verification service: `postgres+fleet`; topology: `single-node`; evidence: `db_query`
  - Negative control: fails if any of: stub, empty, static, disconnect
  - Case 1:
    - Start: `suspended_mission_run`
    - Action (cli_user): kill -9 the mission process; run holo mission resume 
    - Must observe: status = 'completed'; checkpoint_count >= 2; status = 'completed' AND checkpoint_count >= 2
    - Must not observe: status = 'failed'; checkpoint_count = 0; duplicate component_count > 0

## Test Criteria
| ID | Maps to | Type | Statement | Verify |
|---|---|---|---|---|
| TC-1 | AC-1 | happy_path | Mission template row has executorRef='evidence-gate' and budget limits | `psql $DATABASE_URL -c "SELECT executor_ref, budgets FROM mission_templates WHERE template_key='evidence-research'" | grep evidence-gate | grep -o 'wallMs=[0-9]*'` |
| TC-2 | AC-1 | boundary | Evidence gate enforces independence floor >= 2 sources | `pnpm test -- src/research/evidence-gate.test.ts --grep 'independence floor'` |
| TC-3 | AC-2 | happy_path | deepResearch run uses same template_key as research | `psql $DATABASE_URL -c "SELECT DISTINCT template_key FROM mission_runs WHERE run_id IN (SELECT run_id FROM mission_run_tags WHERE tag IN ('research', 'deepResearch'))" | grep -c 'evidence-research'` |
| TC-4 | AC-3 | boundary | Refuting evidence payload returns admitted=true with direction=refuting | `pnpm test -- src/research/evidence-gate.test.ts --grep 'refuting direction'` |
| TC-5 | AC-4 | happy_path | Resume after SIGKILL preserves run_id and executor version | `psql $DATABASE_URL -c "SELECT run_id, executor_version FROM mission_runs WHERE run_id='$RUN_ID'" | grep $RUN_ID` |

## Reading List
| Path | Lines | Focus |
|---|---|---|
| `services/platform/src/mission/contract.ts` | 1-100 | Mission template DSL schema and validation |
| `services/platform/src/mission/runtime.ts` | 1-100 | Mission runtime execution and resume logic |
| `services/platform/src/research/evidence-gate.ts` | 1-100 | Evidence gate deterministic admission logic |
| `.spec/prds/mk6-migration/06-uc-svc.md` | 31-41 | UC-SVC-02 acceptance criteria for pipelines as templates |
| `.spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md` | 17-26 | Mission template DSL and executor registry contract |

## Guardrails
**WRITE-ALLOWED**
- services/platform/src/mission/templates/evidence-research.ts (NEW)
- services/platform/src/mission/registry.ts (MODIFY)
- services/platform/src/research/evidence-gate.ts (MODIFY if needed)
- services/platform/src/tools/schemas/research.ts (MODIFY)
- services/platform/src/db/schema/mission.ts (MODIFY if needed)
- services/platform/src/__tests__/integration/evidence-research-template.test.ts (NEW)
**WRITE-PROHIBITED**
- services/platform/src/mission/contract.ts — no DSL changes without contract change
- services/platform/src/whatsnew/ — this domain module must be deleted, not modified
- services/platform/src/assimilate/ — this domain module must be deleted, not modified

## Design / Pipeline Semantics
**References:**
- services/platform/src/mission/contract.ts (MissionTemplateSchema)
- services/platform/src/research/evidence-gate.ts (evaluateEvidenceGate)
- .spec/prds/mk6-migration/06-uc-svc.md (UC-SVC-02)
**Interaction notes:**
- Template instantiates with parameters via MissionGoalArgsSchema
- Evidence gate is pure-TS, no model calls, deterministic
- Checkpoint commits after each component for crash recovery
- **Pattern:** Shared template with parameterized stage graph
- **Pattern source:** `services/platform/src/mission/contract.ts:75-89`
- **Anti-pattern:** Per-domain copy-pasted research modules (whatsnew/, assimilate/, separate deepResearch/)

## Verification Gates
| Gate | Command | Expected |
|---|---|---|
| RED phase evidence | `git log --oneline --all | grep 'pipes-4 RED' | head -1` | Commit message shows RED tests were written first |
| Integration tests pass | `pnpm test:integration evidence-research-template.test.ts` | Exit 0 |
| Type check | `pnpm typecheck` | Exit 0 |
| Lint | `pnpm lint` | Exit 0 |
| Mission runs successfully | `holo mission run research --topic 'test' --components 1` | Exit 0 with completed status |
| Scenario validation | `python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py < pipes-1-scenarios.json` | Exit 0; zero CRITICAL or HIGH. |
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
<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "pipes-1",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "empty_research_db": {
      "description": "Postgres with no mission runs or research sessions",
      "seed_method": "public_api",
      "records": [
        "mission_runs table is empty",
        "mission_templates contains only system templates"
      ]
    },
    "empty_evidence_state": {
      "description": "Evidence gate with no prior claims or evidence",
      "seed_method": "public_api",
      "records": [
        "claims array is empty",
        "evidence array is empty"
      ]
    },
    "suspended_mission_run": {
      "description": "Mission run suspended at checkpoint after 1 component",
      "seed_method": "public_api",
      "records": [
        "mission_run status='suspended'",
        "checkpoint at index 1 committed",
        "2 remaining components not yet processed"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN Mission registry contains the shared evidence-research template row with stageGraph referencing evidence-gate executor WHEN Operator runs holo mission run research --topic 'MCP architecture' --components 2 THEN Mission completes with status='completed' and output contains a research session with at least 2 components covered by admitted evidence items",
      "verify": "holo mission run research --topic 'MCP architecture' --components 2 && psql $DATABASE_URL -c \"SELECT status, components_covered FROM mission_runs WHERE template_key='evidence-research' ORDER BY created_at DESC LIMIT 1\" | grep 'completed'",
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
            "start_ref": "empty_research_db",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run holo mission run research --topic \"MCP architecture\" --components 2"
              ]
            },
            "end_state": {
              "must_observe": [
                "status = 'completed'",
                "components_covered >= 2",
                "independent_source_count >= 2",
                "jsonb_array_length(admitted_evidence_ids) >= 1"
              ],
              "must_not_observe": [
                "status = 'failed' OR status = 'blocked'",
                "components_covered = 0",
                "independent_source_count = 0",
                "jsonb_array_length(admitted_evidence_ids) = 0"
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
      "description": "GIVEN Shared evidence-research template exists with parameterizable component count WHEN Operator runs holo mission run deepResearch --topic 'TypeScript type system' --components 4 THEN Mission completes with 4 components covered using the same evidence-gate executor instance",
      "verify": "holo mission run deepResearch --topic 'TypeScript type system' --components 4 && psql $DATABASE_URL -c \"SELECT components_covered FROM mission_runs WHERE template_key='evidence-research' AND run_id IN (SELECT run_id FROM mission_run_tags WHERE tag='deepResearch') ORDER BY created_at DESC LIMIT 1\" | grep 4",
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
            "start_ref": "empty_research_db",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run holo mission run deepResearch --topic \"TypeScript type system\" --components 4"
              ]
            },
            "end_state": {
              "must_observe": [
                "components_covered = 4",
                "template_key = 'evidence-research'",
                "executor_ref = 'evidence-gate'"
              ],
              "must_not_observe": [
                "components_covered = 0",
                "template_key = 'deepResearch'",
                "executor_ref != 'evidence-gate'"
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
      "description": "GIVEN Evidence gate configured with gradeFloor=3, entailmentFloor=0.8, independentSourceFloor=2 WHEN Mission processes evidence with refuting claims meeting grade/entailment/independence floors THEN Gate admits refuting evidence items and sets direction='refuting' in result",
      "verify": "cat > /tmp/refuting_evidence.json << 'EOF'\n{\"claims\":[{\"id\":\"c1\",\"text\":\"TypeScript types are optional\",\"component\":\"type_system\"}],\"evidence\":[{\"id\":\"e1\",\"claimId\":\"c1\",\"component\":\"type_system\",\"sourceId\":\"s1\",\"independenceGroup\":\"g1\",\"quote\":\"TypeScript types are optional\",\"sourceText\":\"TypeScript types are optional in JSDoc comments\",\"grade\":4,\"entailment\":0.9,\"disconfirmationResolved\":true,\"direction\":\"refuting\"}],\"requiredComponents\":[\"type_system\"],\"gradeFloor\":3,\"entailmentFloor\":0.8,\"independentSourceFloor\":2}\nEOF\npnpm src/research/test-evidence-gate.ts < /tmp/refuting_evidence.json | jq '.direction' | grep refuting",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": null,
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
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty_evidence_state",
            "action": {
              "actor": "api_client",
              "steps": [
                "POST /research/test-evidence-gate with refuting evidence payload"
              ]
            },
            "end_state": {
              "must_observe": [
                "direction = 'refuting'",
                "jsonb_array_length(admittedEvidenceIds) >= 1"
              ],
              "must_not_observe": [
                "direction = 'supporting'",
                "admission.admitted = false",
                "jsonb_array_length(admittedEvidenceIds) = 0"
              ]
            }
          }
        ],
        "primary": false
      },
      "unit_test_justified": "Pure-TS deterministic logic in evidence-gate.ts has no external dependencies"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN Evidence-research mission suspended at checkpoint after 1 of 3 components WHEN Process receives SIGKILL and operator resumes with holo mission resume <runId> THEN Mission resumes from the suspended checkpoint and completes remaining components without repeating completed work",
      "verify": "start mission run, let it suspend, kill -9 $PID, holo mission resume $RUN_ID, psql $DATABASE_URL -c \"SELECT checkpoint_index FROM mission_run_checkpoints WHERE run_id='$RUN_ID' ORDER BY checkpoint_index\" | grep -c '2'",
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
            "start_ref": "suspended_mission_run",
            "action": {
              "actor": "cli_user",
              "steps": [
                "kill -9 the mission process",
                "run holo mission resume "
              ]
            },
            "end_state": {
              "must_observe": [
                "status = 'completed'",
                "checkpoint_count >= 2",
                "status = 'completed' AND checkpoint_count >= 2"
              ],
              "must_not_observe": [
                "status = 'failed'",
                "checkpoint_count = 0",
                "duplicate component_count > 0"
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
      "description": "Mission template row has executorRef='evidence-gate' and budget limits",
      "verify": "psql $DATABASE_URL -c \"SELECT executor_ref, budgets FROM mission_templates WHERE template_key='evidence-research'\" | grep evidence-gate | grep -o 'wallMs=[0-9]*'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Evidence gate enforces independence floor >= 2 sources",
      "verify": "pnpm test -- src/research/evidence-gate.test.ts --grep 'independence floor'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "deepResearch run uses same template_key as research",
      "verify": "psql $DATABASE_URL -c \"SELECT DISTINCT template_key FROM mission_runs WHERE run_id IN (SELECT run_id FROM mission_run_tags WHERE tag IN ('research', 'deepResearch'))\" | grep -c 'evidence-research'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Refuting evidence payload returns admitted=true with direction=refuting",
      "verify": "pnpm test -- src/research/evidence-gate.test.ts --grep 'refuting direction'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Resume after SIGKILL preserves run_id and executor version",
      "verify": "psql $DATABASE_URL -c \"SELECT run_id, executor_version FROM mission_runs WHERE run_id='$RUN_ID'\" | grep $RUN_ID",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
