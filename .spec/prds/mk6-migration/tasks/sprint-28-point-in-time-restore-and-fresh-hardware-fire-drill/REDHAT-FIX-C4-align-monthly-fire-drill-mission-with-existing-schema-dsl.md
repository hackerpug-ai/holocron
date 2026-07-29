# REDHAT-FIX-C4 — Align the monthly fire-drill mission with the existing mission schema and DSL without inventing fields (review C-4)

## What this does

Rewrite D05-05's monthly fire-drill mission contract to use ONLY live mission schema columns and the existing on-demand mission DSL: template_key (not mission_key), typed_output_json for parity report pointer, error_message for failure reason, lowercase statuses matching mission_runs_status_check; monthly cadence via launchd/cron OUTSIDE the mission DSL (mirroring holocron-base-backup scheduling).

## Why

Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-C4). Grounded in UC-PLAT-06 / T-PLAT-022 / T-PLAT-025 / CAP-BAK-01. Review evidence: `.spec/reviews/red-hat-20260728T235155Z-sprint-28.md` (reviewed SHA `a9b5b6e7ff2b707fddf15084e2895221c62c68cb`).

## How to verify

- `! rg -n 'mission_key|output_artifacts|failure_reason' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-05-schedule-the-fire-drill-as-a-periodic-mission-author-the-runbook.md` → exit 0
- `test -f services/platform/deploy/launchd/holocron-fire-drill-monthly.plist` → exit 0
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts` → validates real schema fields
- `pnpm tsgo --noEmit` → exit 0
- `pnpm tsgo --noEmit && pnpm biome check .` → Exit 0

## Scope

Writes: /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-05-schedule-the-fire-drill-as-a-periodic-mission-author-the-runbook.md, services/platform/src/mission/templates/fire-drill-monthly.ts (NEW — draft/template shell ok if validates), services/platform/deploy/launchd/holocron-fire-drill-monthly.plist (NEW — schedule outside DSL), services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts (NEW), .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md (NEW or partial), .tmp/REDHAT-FIX-C4/**

Prohibited: services/platform/src/db/migrations/0017_mission_contracts.sql (no schema changes), services/platform/src/mission/contract.ts changes that invent schedule triggers without a separate approved epic, Invented columns in SQL or Drizzle schema

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-C4 — Align the monthly fire-drill mission with the existing mission schema and DSL without inventing fields (review C-4)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (90 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 28 — Point-in-Time Restore and Fresh-Hardware Fire Drill](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
D05-05 contract and any draft template validate against MissionTemplateSchema (trigger.kind='on-demand', no schedule field); mission_runs assertions use template_key + typed_output_json + error_message + status IN ('completed','failed',...); a version-controlled launchd plist or cron unit schedules monthly `holo restore:fire-drill` / mission run; zero invented columns.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Use template_key, typed_output_json, error_message, lowercase statuses only
- MUST Mission DSL trigger remains kind: on-demand (MissionTriggerSchema)
- MUST Monthly cadence implemented via launchd/cron outside mission DSL (or documented existing external scheduler pattern)
- MUST Parity report path/pointer stored in typed_output_json
- MUST Failed parity sets status='failed' and non-empty error_message containing PARITY
- MUST Rewrite D05-05 task contract before H1 implements the mission template
- NEVER invent mission_key, output_artifacts, failure_reason columns
- NEVER use uppercase SUCCESS/FAILED statuses
- NEVER put schedule/cron fields inside MissionTemplateSchema definition
- NEVER modify 0017_mission_contracts.sql schema
- NEVER claim DSL supports monthly triggers without code changes (DSL is on-demand-only)
- STRICTLY statuses must satisfy CHECK (status IN ('pending','running','completed','failed','blocked','budget_exceeded'))
- STRICTLY template file validates with parseMissionTemplateDefinition / MissionTemplateSchema.strict()
- STRICTLY external scheduler is version-controlled under services/platform/deploy/launchd/ (or equivalent)
- STRICTLY runbook documents both on-demand mission run and monthly launchd invocation

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN live mission schema and MissionTemplateSchema WHEN the fire-drill-monthly template is authored/registered THEN it 
- [ ] AC-2: GIVEN a registered fire-drill-monthly template and a successful fire-drill run WHEN mission completes THEN mission_runs 
- [ ] AC-3: GIVEN a fire-drill run where parity-report shows any PARITY_PASS=false WHEN mission finishes THEN status='failed' and er
- [ ] AC-4: GIVEN on-demand-only DSL WHEN monthly cadence is required THEN a version-controlled launchd plist (or cron) under servic
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — GIVEN live mission schema and MissionTemplateSchema WHEN the fire-drill-monthly  (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN live mission schema and MissionTemplateSchema WHEN the fire-drill-monthly template is authored/registered THEN it uses template_key='fire-drill-monthly', trigger.kind='on-demand', valid stageGraph, and NO schedule field; SELECT count(*) FROM mission_templates WHERE template_key='fire-drill-monthly' = 1 after registration.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: Postgres+mission-registry+MissionTemplateSchema
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts -t 'register|template'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if template includes schedule field rejected by DSL; uses mission_key instead of template_key; schema migration invents columns; template fails MissionTemplateSchema.strict()
  START_REF: live_mission_schema
  MUST_OBSERVE: parseMissionTemplateDefinition exit success / no throw; template.definition trigger.kind === 'on-demand'; SELECT count(*) FROM mission_templates WHERE template_key='fire-drill-monthly' = 1; definition_json has no 'schedule' key
  MUST_NOT_OBSERVE: MissionTemplateSchema parse error; schedule field present in definition_json; empty/start signature: count=0 and invented mission_key used in contract
  EVIDENCE: db_query (required_capture=True)

### AC-2 — GIVEN a registered fire-drill-monthly template and a successful fire-drill run W (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN a registered fire-drill-monthly template and a successful fire-drill run WHEN mission completes THEN mission_runs row has template_key='fire-drill-monthly', status='completed', and typed_output_json contains a parity report pointer (e.g. parity_report_path or equivalent key) to a non-empty parity-report.json — NOT output_artifacts column.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: Postgres+mission-executor
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts -t 'typed_output|parity'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if asserts output_artifacts column; uses status='SUCCESS'; typed_output_json empty on success
  START_REF: on_demand_mission_dsl
  MUST_OBSERVE: status = 'completed'; template_key = 'fire-drill-monthly'; typed_output_json has parity report pointer key with non-empty path; test -f <parity-report-path> && size > 0
  MUST_NOT_OBSERVE: status = 'SUCCESS' (invalid uppercase); query uses mission_key or output_artifacts; empty/start signature: typed_output_json null on success
  EVIDENCE: db_query (required_capture=True)

### AC-3 — GIVEN a fire-drill run where parity-report shows any PARITY_PASS=false WHEN miss (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN a fire-drill run where parity-report shows any PARITY_PASS=false WHEN mission finishes THEN status='failed' and error_message is non-empty containing 'PARITY' (or concrete check name) — NOT failure_reason column; alerting may be invoked via existing D04-05 path.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: Postgres+mission-executor+alerting
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts -t 'parity failure|failed'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if status remains completed on parity failure; uses failure_reason column; error_message empty
  START_REF: on_demand_mission_dsl
  MUST_OBSERVE: status = 'failed'; error_message ILIKE '%PARITY%' OR contains concrete check name; status is lowercase and allowed by check constraint
  MUST_NOT_OBSERVE: status = 'completed' or 'SUCCESS'; failure_reason column referenced; empty/start signature: error_message NULL
  EVIDENCE: db_query (required_capture=True)

### AC-4 — GIVEN on-demand-only DSL WHEN monthly cadence is required THEN a version-control (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN on-demand-only DSL WHEN monthly cadence is required THEN a version-controlled launchd plist (or cron) under services/platform/deploy/launchd/ schedules monthly invocation of the fire-drill command/mission without embedding schedule in mission definition_json; D05-05 contract and runbook document this external scheduler; runbook still covers pre-drill, execute, verify, teardown, troubleshoot.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: filesystem+contract-docs
  VERIFY: `test -f services/platform/deploy/launchd/holocron-fire-drill-monthly.plist && rg -n 'on-demand|launchd|template_key|typed_output_json|error_message' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-05*.md`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if monthly schedule only inside definition_json; no external scheduler artifact; contract still documents invented columns
  START_REF: external_monthly_scheduler
  MUST_OBSERVE: plist exists and contains monthly calendar interval or StartInterval >= 28 days; ProgramArguments reference holo fire-drill or mission run; D05-05 contract has zero mission_key/output_artifacts/failure_reason/SUCCESS|FAILED uppercase requirements
  MUST_NOT_OBSERVE: definition_json.schedule = monthly as the only cadence mechanism; invented columns still in D05-05 ACs; empty/start signature: no plist and no contract rewrite
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | D05-05 contract has zero invented column names | AC-1 | `! rg -n "mission_key|output_artifacts|failure_reason|status='SUCCESS'|status='FA` |
| TC-2 | Template validates against MissionTemplateSchema / mentions on-demand | AC-1 | `rg -n "on-demand|templateKey|template_key" services/platform/src/mission/templat` |
| TC-3 | External monthly launchd unit present | AC-4 | `test -f services/platform/deploy/launchd/holocron-fire-drill-monthly.plist` |
| TC-4 | Mission contract integration test PLATFORM_IT | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-` |
| TC-5 | Typecheck + lint | AC-1 | `pnpm tsgo --noEmit && pnpm biome check services/platform/src/mission/templates/f` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-05-schedule-the-fire-drill-as-a-periodic-mission-author-the-runbook.md
- services/platform/src/mission/templates/fire-drill-monthly.ts (NEW — draft/template shell ok if validates)
- services/platform/deploy/launchd/holocron-fire-drill-monthly.plist (NEW — schedule outside DSL)
- services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts (NEW)
- .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md (NEW or partial)
- .tmp/REDHAT-FIX-C4/**
writeProhibited:
- services/platform/src/db/migrations/0017_mission_contracts.sql (no schema changes)
- services/platform/src/mission/contract.ts changes that invent schedule triggers without a separate approved epic
- Invented columns in SQL or Drizzle schema

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/inference1/Projects/holocron/.spec/reviews/red-hat-20260728T235155Z-sprint-28.md:80-85 [C-4 finding: invented mission fields vs live schema/DSL]
2. services/platform/src/db/migrations/0017_mission_contracts.sql:3-11,66-115 [real columns + status check]
3. services/platform/src/mission/contract.ts:47-51,85-101 [on-demand only, strict schema]
4. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-05-schedule-the-fire-drill-as-a-periodic-mission-author-the-runbook.md:97-128 [broken ACs]
5. services/platform/src/backup/base-backup.ts:447-585 [launchd external schedule pattern]
6. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/11-e2e-testing-criteria.md:60 [T-PLAT-025]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- no-invented-columns-in-contract: `! rg -n 'mission_key|output_artifacts|failure_reason' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-05-schedule-the-fire-drill-as-a-periodic-mission-author-the-runbook.md` → exit 0
- launchd-monthly: `test -f services/platform/deploy/launchd/holocron-fire-drill-monthly.plist` → exit 0
- mission-contract-test: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts` → validates real schema fields
- typecheck: `pnpm tsgo --noEmit` → exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260728T235155Z-sprint-28.md, ./SPRINT.md
Interaction notes:
- —
pattern: On-demand mission template for execution/observability + external launchd monthly cadence (same split as base-backup jobs).
pattern_source: 0017_mission_contracts.sql; mission/contract.ts MissionTemplateSchema; backup base-backup launchd installer
anti_pattern: Inventing mission_runs columns; uppercase statuses; schedule inside strict on-demand DSL; schema migrations for a sprint task that forbids them.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — C-4 makes D05-05 unimplementable: invented mission_key/output_artifacts/failure_reason/uppercase statuses/schedule-in-DSL conflict with live 0017 schema and on-demand-only MissionTriggerSchema. DevOps must rewrite the mission contract to real columns and external monthly scheduling (launchd/cron pattern already used by backup).
Reviewer: code-reviewer (+ security-reviewer when task is security-scoped)

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D05-05
Blocks: REDHAT-FIX-H1
Coordinates with: D05-04

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Review evidence (immutable): `.spec/reviews/red-hat-20260728T235155Z-sprint-28.md` @ SHA `a9b5b6e7ff2b707fddf15084e2895221c62c68cb`.
- Do not claim gate pass; do not implement outside write_allowed.
- Preserve Sprint 28 CAP-BAK-01 restore-half scope.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-C4",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "live_mission_schema": {
      "description": "Live mission_templates / mission_runs columns from 0017_mission_contracts.sql",
      "seed_method": "public_api",
      "records": [
        "mission_templates.template_key PK",
        "mission_runs.template_key, status lowercase check, typed_output_json, error_message",
        "No mission_key, output_artifacts, failure_reason columns"
      ]
    },
    "on_demand_mission_dsl": {
      "description": "MissionTemplateSchema permits only trigger.kind='on-demand'",
      "seed_method": "public_api",
      "records": [
        "MissionTriggerSchema = z.object({ kind: z.literal('on-demand') }).strict()",
        "Undeclared schedule fields rejected by .strict()"
      ]
    },
    "external_monthly_scheduler": {
      "description": "launchd plist or cron installing monthly fire-drill invocation",
      "seed_method": "cli",
      "records": [
        "StartCalendarInterval Month/Day/Hour or equivalent monthly cadence",
        "ProgramArguments invoke holo restore:fire-drill or mission run fire-drill-monthly"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN live mission schema and MissionTemplateSchema WHEN the fire-drill-monthly template is authored/registered THEN it uses template_key='fire-drill-monthly', trigger.kind='on-demand', valid stageGraph, and NO schedule field; SELECT count(*) FROM mission_templates WHERE template_key='fire-drill-monthly' = 1 after registration.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts -t 'register|template'",
      "maps_to_ac": null,
      "primary": true,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres+mission-registry+MissionTemplateSchema",
        "topology": "single-node",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "template includes schedule field rejected by DSL",
            "uses mission_key instead of template_key",
            "schema migration invents columns",
            "template fails MissionTemplateSchema.strict()"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "live_mission_schema",
            "action": {
              "actor": "operator",
              "steps": [
                "Author fire-drill-monthly template matching MissionTemplateSchema",
                "parseMissionTemplateDefinition succeeds",
                "Register into mission_templates / mission_template_versions"
              ]
            },
            "end_state": {
              "must_observe": [
                "parseMissionTemplateDefinition exit success / no throw",
                "template.definition trigger.kind === 'on-demand'",
                "SELECT count(*) FROM mission_templates WHERE template_key='fire-drill-monthly' = 1",
                "definition_json has no 'schedule' key"
              ],
              "must_not_observe": [
                "MissionTemplateSchema parse error",
                "schedule field present in definition_json",
                "empty/start signature: count=0 and invented mission_key used in contract"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN a registered fire-drill-monthly template and a successful fire-drill run WHEN mission completes THEN mission_runs row has template_key='fire-drill-monthly', status='completed', and typed_output_json contains a parity report pointer (e.g. parity_report_path or equivalent key) to a non-empty parity-report.json \u2014 NOT output_artifacts column.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts -t 'typed_output|parity'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres+mission-executor",
        "topology": "single-node",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "asserts output_artifacts column",
            "uses status='SUCCESS'",
            "typed_output_json empty on success"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "on_demand_mission_dsl",
            "action": {
              "actor": "operator",
              "steps": [
                "Trigger on-demand mission run for fire-drill-monthly",
                "On success inspect mission_runs"
              ]
            },
            "end_state": {
              "must_observe": [
                "status = 'completed'",
                "template_key = 'fire-drill-monthly'",
                "typed_output_json has parity report pointer key with non-empty path",
                "test -f <parity-report-path> && size > 0"
              ],
              "must_not_observe": [
                "status = 'SUCCESS' (invalid uppercase)",
                "query uses mission_key or output_artifacts",
                "empty/start signature: typed_output_json null on success"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN a fire-drill run where parity-report shows any PARITY_PASS=false WHEN mission finishes THEN status='failed' and error_message is non-empty containing 'PARITY' (or concrete check name) \u2014 NOT failure_reason column; alerting may be invoked via existing D04-05 path.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts -t 'parity failure|failed'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres+mission-executor+alerting",
        "topology": "single-node",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "status remains completed on parity failure",
            "uses failure_reason column",
            "error_message empty"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "on_demand_mission_dsl",
            "action": {
              "actor": "operator",
              "steps": [
                "Induce parity failure (corrupt baseline or mismatched counts)",
                "Run mission",
                "SELECT status, error_message FROM mission_runs WHERE template_key='fire-drill-monthly' ORDER BY created_at DESC LIMIT 1"
              ]
            },
            "end_state": {
              "must_observe": [
                "status = 'failed'",
                "error_message ILIKE '%PARITY%' OR contains concrete check name",
                "status is lowercase and allowed by check constraint"
              ],
              "must_not_observe": [
                "status = 'completed' or 'SUCCESS'",
                "failure_reason column referenced",
                "empty/start signature: error_message NULL"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN on-demand-only DSL WHEN monthly cadence is required THEN a version-controlled launchd plist (or cron) under services/platform/deploy/launchd/ schedules monthly invocation of the fire-drill command/mission without embedding schedule in mission definition_json; D05-05 contract and runbook document this external scheduler; runbook still covers pre-drill, execute, verify, teardown, troubleshoot.",
      "verify": "test -f services/platform/deploy/launchd/holocron-fire-drill-monthly.plist && rg -n 'on-demand|launchd|template_key|typed_output_json|error_message' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-05*.md",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem+contract-docs",
        "topology": "single-node",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "monthly schedule only inside definition_json",
            "no external scheduler artifact",
            "contract still documents invented columns"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "external_monthly_scheduler",
            "action": {
              "actor": "operator",
              "steps": [
                "Author holocron-fire-drill-monthly.plist with monthly StartCalendarInterval",
                "Rewrite D05-05 ACs to real schema fields",
                "Document external schedule in runbook"
              ]
            },
            "end_state": {
              "must_observe": [
                "plist exists and contains monthly calendar interval or StartInterval >= 28 days",
                "ProgramArguments reference holo fire-drill or mission run",
                "D05-05 contract has zero mission_key/output_artifacts/failure_reason/SUCCESS|FAILED uppercase requirements"
              ],
              "must_not_observe": [
                "definition_json.schedule = monthly as the only cadence mechanism",
                "invented columns still in D05-05 ACs",
                "empty/start signature: no plist and no contract rewrite"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "D05-05 contract has zero invented column names",
      "verify": "! rg -n \"mission_key|output_artifacts|failure_reason|status='SUCCESS'|status='FAILED'\" /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-05-schedule-the-fire-drill-as-a-periodic-mission-author-the-runbook.md",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Template validates against MissionTemplateSchema / mentions on-demand",
      "verify": "rg -n \"on-demand|templateKey|template_key\" services/platform/src/mission/templates/fire-drill-monthly.ts /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-05*.md",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "External monthly launchd unit present",
      "verify": "test -f services/platform/deploy/launchd/holocron-fire-drill-monthly.plist",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Mission contract integration test PLATFORM_IT",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Typecheck + lint",
      "verify": "pnpm tsgo --noEmit && pnpm biome check services/platform/src/mission/templates/fire-drill-monthly.ts services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->

</details>
