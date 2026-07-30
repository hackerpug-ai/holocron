# D05-05 — Schedule the fire drill as a periodic mission + author the runbook
> Status: ✅ Completed
> Completed: 2026-07-29T01:13:23Z
> REDHAT-FIX-C4: aligned with live 0017 mission schema + on-demand DSL

## What this does

Authors the **on-demand** fire-drill mission template and operator runbook; registers the mission in `mission_templates` (`template_key`); stores the parity report pointer in `mission_runs.typed_output_json`; fails with `status='failed'` + `error_message` when parity fails. **Monthly cadence is external launchd** (`holocron-fire-drill-monthly.plist`), not a mission DSL schedule field.


**Provides:** On-demand mission template `fire-drill-monthly`; external monthly launchd unit; operator runbook; parity report pointer via `typed_output_json`


**Consumes:** D05-04 (end-to-end fire drill command); `services/platform/src/mission` system; `0017_mission_contracts.sql` columns only


## Why

CAP-BAK-01 requires the fire drill to run monthly and operators need a clear runbook. The mission **DSL is on-demand only** (`MissionTriggerSchema`); monthly cadence mirrors base-backup scheduling via launchd outside the DSL.


Grounded in: UC-PLAT-06, T-PLAT-025, CAP-BAK-01. Remediated by REDHAT-FIX-C4 (live columns only: `template_key`, `typed_output_json`, `error_message`, lowercase statuses).


## How to verify

```bash
test -f services/platform/deploy/launchd/holocron-fire-drill-monthly.plist

PLATFORM_IT=1 pnpm vitest run \
  services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts

pnpm tsgo --noEmit && pnpm biome check \
  services/platform/src/mission/templates/fire-drill-monthly.ts \
  services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts
```


## Scope


**Writes:** `services/platform/src/mission/templates/fire-drill-monthly.json`; `services/platform/src/mission/templates/fire-drill-monthly.ts`; `services/platform/deploy/launchd/holocron-fire-drill-monthly.plist`; `.spec/prds/mk6-migration/runbooks/fire-drill-monthly.md`; `services/platform/src/mission/index.ts` (registration helper)


**Prohibited:** Modifying `0017_mission_contracts.sql`; inventing columns outside live schema; uppercase terminal statuses; embedding monthly cron inside `MissionTemplateSchema` as the only cadence; scheduling more frequently than monthly; hardcoding credentials/timestamps in the template


<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: D05-05 — Schedule the fire drill as a periodic mission + author the runbook
================================================================================
TASK_TYPE:  INFRA
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (90 min)
AGENT:      devops-engineer
PROPOSED-BY: devops-engineer
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 28 — Point-in-Time Restore and Fresh-Hardware Fire Drill](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Register on-demand mission template `fire-drill-monthly` and author the operator runbook; schedule monthly invocation via version-controlled launchd (outside mission DSL).

**Success state:**
- `mission_templates` has `template_key='fire-drill-monthly'` with valid `definition_json` (`trigger.kind='on-demand'`, **no** `schedule` key)
- Mission run rows use `template_key`, lowercase `status` ∈ (`pending`,`running`,`completed`,`failed`,`blocked`,`budget_exceeded`), `typed_output_json` (parity report pointer e.g. `reportPath`), `error_message` on failure
- Parity fail → `status='failed'` and `error_message` contains `PARITY`
- launchd plist schedules monthly `holo mission run fire-drill-monthly` / fire-drill path
- Runbook covers pre-drill, execute (on-demand + launchd), verify, teardown, troubleshoot

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST author the mission template under services/platform/src/mission/templates/
- MUST register via template_key (mission_templates / mission_template_versions)
- MUST use trigger.kind='on-demand' only (MissionTriggerSchema)
- MUST implement monthly cadence via launchd/cron under services/platform/deploy/launchd/ (outside DSL)
- MUST mission execute holo restore:fire-drill (or equivalent stage executor)
- MUST store parity-report pointer in typed_output_json (e.g. reportPath or nested map keys) — live jsonb column only
- MUST on any PARITY_PASS=false set status='failed' and non-empty error_message containing PARITY
- MUST author the operator runbook as a step-by-step checklist
- NEVER invent columns beyond 0017_mission_contracts.sql
- NEVER use uppercase terminal statuses (only lowercase pending/running/completed/failed/blocked/budget_exceeded)
- NEVER put schedule/cron as the sole cadence inside MissionTemplateSchema / definition_json
- NEVER schedule more frequently than monthly
- NEVER hardcode timestamps or credentials in the mission template
- NEVER modify 0017_mission_contracts.sql
- STRICTLY statuses satisfy CHECK (status IN ('pending','running','completed','failed','blocked','budget_exceeded'))
- STRICTLY template validates with parseMissionTemplateDefinition / MissionTemplateSchema.strict()
- STRICTLY failure on parity is surfaceable via D04-05 alerting
- STRICTLY runbook documents both on-demand mission run and monthly launchd invocation

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): Mission template registered (on-demand, no schedule field); launchd provides monthly cadence
- [ ] AC-2: Mission execution stores parity report pointer in typed_output_json
- [ ] AC-3: Failed parity → status='failed' + error_message contains PARITY
- [ ] AC-4: Operator runbook authored (incl. launchd + on-demand)
- [ ] `pnpm tsgo --noEmit` clean + biome clean on scoped files

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — proven by real services)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Mission template registered as on-demand; monthly via launchd (flow_ref T-PLAT-025)
  GIVEN: D05-04 fire drill command is working; live 0017 schema
  WHEN:  operator registers the fire-drill-monthly mission template
  THEN:  mission_templates contains template_key='fire-drill-monthly', latest_version set; definition_json has trigger.kind='on-demand', valid stageGraph/steps, and NO schedule key; monthly cadence is documented/installed via holocron-fire-drill-monthly.plist
  TEST_TIER: integration · VERIFICATION_SERVICE: Postgres+mission-registry · TDD_STATE: none
  SCENARIO — start_ref: live_mission_schema · evidence: db_query
    NEGATIVE_CONTROL: would fail if template missing; definition embeds schedule as only cadence; fails MissionTemplateSchema.strict()
    MUST_OBSERVE: SELECT count(*) FROM mission_templates WHERE template_key='fire-drill-monthly' = 1; latest_version length > 0; definition_json->'trigger'->>'kind' = 'on-demand'; definition_json ? 'schedule' = false; test -f services/platform/deploy/launchd/holocron-fire-drill-monthly.plist
    MUST_NOT_OBSERVE: count=0; definition_json->>'schedule' = 'monthly' as sole cadence mechanism
  verify: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts -t 'register|template'

AC-2 Mission execution stores parity report in typed_output_json (flow_ref T-PLAT-025)
  GIVEN: Mission template registered
  WHEN:  the mission executes (launchd monthly or manual on-demand)
  THEN:  mission_runs row has template_key='fire-drill-monthly'; status in lowercase allowed set; typed_output_json contains a parity report pointer (reportPath or equivalent) to a non-empty parity-report.json
  TEST_TIER: integration · VERIFICATION_SERVICE: Postgres+mission-executor · TDD_STATE: none
  SCENARIO — start_ref: on_demand_mission_dsl · evidence: db_query
    NEGATIVE_CONTROL: would fail if uses uppercase terminal status; typed_output_json null when report written
    MUST_OBSERVE: template_key = 'fire-drill-monthly'; status IN ('completed','failed',...allowed); typed_output_json has reportPath (or parity pointer) non-empty; test -f <path> && size > 0
    MUST_NOT_OBSERVE: uppercase terminal status; typed_output_json null on terminal run with report
  verify: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts -t 'typed_output|parity'

AC-3 Failed parity check surfaces as mission failure (flow_ref T-PLAT-025)
  GIVEN: Mission execution running
  WHEN:  parity-report shows any PARITY_PASS=false
  THEN:  status='failed'; error_message non-empty containing 'PARITY' (or concrete check name); alerting may use D04-05 path
  TEST_TIER: integration · VERIFICATION_SERVICE: Postgres+mission-executor+alerting · TDD_STATE: none
  SCENARIO — start_ref: on_demand_mission_dsl · evidence: db_query
    NEGATIVE_CONTROL: would fail if status remains completed; error_message empty
    MUST_OBSERVE: status = 'failed'; error_message ILIKE '%PARITY%'; status lowercase + allowed by check constraint
    MUST_NOT_OBSERVE: status = 'completed'; error_message NULL
  verify: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts -t 'parity failure|failed'

AC-4 Operator runbook + external monthly scheduler (flow_ref T-PLAT-025)
  GIVEN: Template and fire drill command working
  WHEN:  operator reads the runbook
  THEN:  runbook is a checklist covering pre-drill, execute (on-demand mission + direct CLI + launchd monthly), verification (template_key/status/typed_output_json/error_message), teardown, troubleshooting; version-controlled under .spec/prds/mk6-migration/runbooks/
  TEST_TIER: unit · VERIFICATION_SERVICE: filesystem · TDD_STATE: none
  SCENARIO — start_ref: external_monthly_scheduler · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if runbook missing; no launchd mention; documents non-live columns as required
    MUST_OBSERVE: test -f .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md; sections >= 4; contains holo restore:fire-drill; documents launchd + template_key + typed_output_json + error_message
    MUST_NOT_OBSERVE: missing launchd; missing on-demand trigger documentation
  verify: rg -n 'on-demand|launchd|template_key|typed_output_json|error_message' .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md D05-05*.md

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/mission/templates/fire-drill-monthly.json
- services/platform/src/mission/templates/fire-drill-monthly.ts
- services/platform/deploy/launchd/holocron-fire-drill-monthly.plist
- .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md
- services/platform/src/mission/index.ts (registration helper)
- services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts
writeProhibited: 0017_mission_contracts.sql schema changes; inventing columns; schedule-only cadence inside DSL without external scheduler

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/db/migrations/0017_mission_contracts.sql — template_key, typed_output_json, error_message, status check
2. services/platform/src/mission/contract.ts — MissionTriggerSchema on-demand only; MissionTemplateSchema.strict()
3. services/platform/deploy/launchd/holocron-base-backup.plist — external schedule pattern
4. services/platform/src/backup/fire-drill.ts — fire-drill command the mission executes

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- launchd-monthly: `test -f services/platform/deploy/launchd/holocron-fire-drill-monthly.plist`
- mission-contract-test: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts`
- typecheck: `pnpm tsgo --noEmit`

--------------------------------------------------------------------------------
DESIGN / ANTI-PATTERN
--------------------------------------------------------------------------------
pattern: On-demand mission template for execution/observability + external launchd monthly cadence (same split as base-backup jobs).
anti_pattern: Non-live mission_runs columns; uppercase statuses; schedule inside strict on-demand DSL as only cadence; ignoring parity results

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D05-04 · Blocks: D05-06 · Coordinates: REDHAT-FIX-C4, REDHAT-FIX-H1

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D05-05",
  "proposed_by": "devops-engineer",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "live_mission_schema": {
      "description": "Live mission_templates / mission_runs columns from 0017_mission_contracts.sql",
      "seed_method": "public_api",
      "records": [
        "mission_templates.template_key PK",
        "mission_runs.template_key, status lowercase check, typed_output_json, error_message"
      ]
    },
    "on_demand_mission_dsl": {
      "description": "MissionTemplateSchema permits only trigger.kind='on-demand'",
      "seed_method": "public_api",
      "records": [
        "MissionTriggerSchema = z.object({ kind: z.literal('on-demand') }).strict()",
        "Monthly cadence is launchd outside definition_json"
      ]
    },
    "external_monthly_scheduler": {
      "description": "launchd plist installing monthly fire-drill invocation",
      "seed_method": "cli",
      "records": [
        "StartCalendarInterval Day=1 Hour=4",
        "ProgramArguments invoke mission run fire-drill-monthly"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-025",
      "description": "GIVEN live mission schema WHEN operator registers fire-drill-monthly THEN template_key row exists; trigger.kind=on-demand; no schedule key; launchd provides monthly cadence",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts -t 'register|template'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres+mission-registry",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "template not registered",
            "schedule is the only cadence mechanism",
            "MissionTemplateSchema.strict() fails",
            "stub/static implementation hardcodes pass without real product behavior",
            "mock empty start state still passes oracle"
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
                "register fire-drill-monthly template",
                "query mission_templates / mission_template_versions"
              ]
            },
            "end_state": {
              "must_observe": [
                "SELECT count(*) = 1 for template_key=fire-drill-monthly",
                "trigger.kind == `on-demand`",
                "definition_json has no `schedule` key (key count for schedule == 0)",
                "launchd plist path exists AND file size >= 1 byte"
              ],
              "must_not_observe": [
                "count = 0",
                "uppercase terminal status requirements"
              ]
            }
          }
        ],
        "primary": true
      },
      "test_tier": "integration"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "description": "GIVEN registered template WHEN mission runs THEN typed_output_json holds parity report pointer; template_key set; lowercase status",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts -t 'typed_output|parity'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres+mission-executor",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "uses uppercase terminal status",
            "typed_output_json empty when report written"
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
              "actor": "system",
              "steps": [
                "run mission fire-drill-monthly",
                "inspect mission_runs.typed_output_json"
              ]
            },
            "end_state": {
              "must_observe": [
                "template_key == `fire-drill-monthly`",
                "status is lowercase terminal token (`completed` or `failed` or `running`)",
                "typed_output_json has `reportPath` or `parity` pointer string length >= 1",
                "parity-report file size >= 1 byte (non-empty)"
              ],
              "must_not_observe": [
                "uppercase terminal status",
                "empty/start signature: (0) or blank success without real work"
              ]
            }
          }
        ],
        "primary": false
      },
      "test_tier": "integration"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "description": "GIVEN parity failure WHEN mission finishes THEN status=failed and error_message contains PARITY",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts -t 'parity failure|failed'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres+mission-executor+alerting",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "status remains completed",
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
                "induce parity failure",
                "run mission",
                "SELECT status, error_message FROM mission_runs WHERE template_key='fire-drill-monthly' ORDER BY created_at DESC LIMIT 1"
              ]
            },
            "end_state": {
              "must_observe": [
                "status == `failed`",
                "error_message ILIKE `%PARITY%` (substring match length >= 1)",
                "typed_output_json still has `parity` pointer string length >= 1"
              ],
              "must_not_observe": [
                "status = completed",
                "error_message NULL",
                "empty/start signature: (0) or blank success without real work"
              ]
            }
          }
        ],
        "primary": false
      },
      "test_tier": "integration"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "description": "GIVEN template working WHEN operator reads runbook THEN checklist covers pre-drill, execute, verify, troubleshoot + launchd monthly + real column names",
      "verify": "test -f .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md && rg -n 'launchd|template_key|typed_output_json|error_message' .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": "filesystem",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "runbook missing",
            "no launchd section",
            "stub/static implementation hardcodes pass without real product behavior",
            "mock empty start state still passes oracle"
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
                "read fire-drill-monthly.md",
                "verify sections and commands"
              ]
            },
            "end_state": {
              "must_observe": [
                "runbook file exists AND size >= 1 byte at fire-drill-monthly.md",
                "section heading `Pre-Drill Checklist` present (count >= 1)",
                "holo restore:fire-drill",
                "runbook documents `launchd` monthly cadence (count >= 1)",
                "runbook names columns `template_key`, `typed_output_json`, `error_message` (each count >= 1)"
              ],
              "must_not_observe": [
                "missing launchd documentation",
                "empty/start signature: (0) or blank success without real work"
              ]
            }
          }
        ],
        "primary": false
      },
      "test_tier": "unit",
      "unit_test_justified": "Runbook is documentation; verified by file existence + section structure"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "D05-05 contract uses only live 0017 column names",
      "maps_to_ac": "AC-1",
      "verify": "rg -n \"template_key|typed_output_json|error_message|on-demand\" D05-05-schedule-the-fire-drill-as-a-periodic-mission-author-the-runbook.md"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Template validates on-demand / template_key",
      "maps_to_ac": "AC-1",
      "verify": "rg -n \"on-demand|templateKey|template_key\" services/platform/src/mission/templates/fire-drill-monthly.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "External monthly launchd unit present",
      "maps_to_ac": "AC-4",
      "verify": "test -f services/platform/deploy/launchd/holocron-fire-drill-monthly.plist"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Mission contract integration test PLATFORM_IT",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts"
    }
  ]
}
-->

</details>
