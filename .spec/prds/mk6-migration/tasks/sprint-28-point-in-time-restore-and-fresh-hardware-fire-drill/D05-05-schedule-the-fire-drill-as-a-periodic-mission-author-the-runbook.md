# D05-05 — Schedule the fire drill as a periodic mission + author the runbook
> Status: ✅ Completed
> Completed: 2026-07-29T01:13:23Z

## What this does

Authors the monthly fire-drill mission template and operator runbook; registers the mission in the mission_templates table; ensures a scheduled run produces a parity report and fails if parity checks fail


**Provides:** Monthly scheduled mission template for fire drill; Operator runbook (step-by-step checklist) in mission templates directory; Mission execution produces parity report artifact


**Consumes:** D05-04 (end-to-end fire drill command); services/platform/src/mission/templates system


## Why

CAP-BAK-01 requires the fire drill to run monthly (scheduled mission) and operators need a clear runbook for manual execution or troubleshooting


Grounded in: UC-PLAT-06, T-PLAT-025, CAP-BAK-01.


## How to verify

Register the mission template; trigger a test run via mission executor; verify the mission completes and emits parity-report.json; inject a parity failure and verify mission status is FAILED


## Scope


**Writes:** services/platform/src/mission/templates/fire-drill-monthly.json (NEW); .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md (NEW); services/platform/src/mission/index.ts (MODIFY — if registration helper needed)


**Prohibited:** Modifying mission_templates schema (0017_mission_contracts.sql owns it); Scheduling the mission more frequently than monthly; Omitting the parity report from mission outputs; Authoring a runbook that skips verification steps; Hardcoding credentials or timestamps in the mission template


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
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Schedule the CAP-BAK-01 fire drill as a monthly mission and author an operator runbook so the drill runs automatically and operators can execute or troubleshoot it manually

**Success state:** Mission template 'fire-drill-monthly' is registered; a scheduled run executes holo restore:fire-drill and produces parity-report.json; the mission status is SUCCESS when all parity checks pass, FAILED when any fail; the operator runbook documents the full flow with troubleshooting steps

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST author the mission template in services/platform/src/mission/templates/
- MUST register the mission in mission_templates table
- MUST specify monthly schedule (cron expression or interval)
- MUST mission executes holo restore:fire-drill or the equivalent flow
- MUST mission outputs parity-report.json as an artifact
- MUST mission status reflects parity check results (FAILED if any check fails)
- MUST author the operator runbook as a step-by-step checklist
- NEVER schedule the mission to run more frequently than monthly (too disruptive)
- NEVER omit the parity report from mission outputs
- NEVER set mission status to SUCCESS when parity checks fail
- NEVER author a runbook that skips isolation checks or verification steps
- NEVER hardcode timestamps or credentials in the mission template
- STRICTLY mission template follows the mission schema (template_key, version, definition_json, compiled_plan_json)
- STRICTLY runbook is version-controlled and references the current fire-drill command
- STRICTLY mission failure on parity check is surfaced to alerting (D04-05)
- STRICTLY runbook includes troubleshooting steps for common failures

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): Mission template registered and scheduled
- [ ] AC-2: Mission execution produces parity report
- [ ] AC-3: Failed parity check surfaces as mission failure
- [ ] AC-4: Operator runbook authored and committed
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — proven by real services)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Mission template registered and scheduled (flow_ref T-PLAT-025)
  GIVEN: D05-04 fire drill command is working
  WHEN:  operator registers the fire-drill-monthly mission template
  THEN:  mission_templates table contains the template with template_key='fire-drill-monthly', latest_version, schedule='monthly', and a valid definition_json; the mission is scheduled to run monthly
  TEST_TIER: integration · VERIFICATION_SERVICE: Postgres+mission-registry · TDD_STATE: none
  SCENARIO — start_ref: d05_04_fire_drill_working · evidence: db_query
    NEGATIVE_CONTROL: would fail if template is a stub; definition_json is empty; schedule is missing
    MUST_OBSERVE: SELECT count(*) FROM mission_templates WHERE template_key='fire-drill-monthly' = 1 (one row); SELECT latest_version FROM mission_templates WHERE template_key='fire-drill-monthly' = '1.0.0' (length > 0); SELECT definition_json->>'schedule' FROM mission_templates WHERE template_key='fire-drill-monthly' = 'monthly'; jsonb_array_length(definition_json->'steps') >= 1 (at least one step)
    MUST_NOT_OBSERVE: SELECT count(*) = 0 (not registered — fake-success start state); latest_version = NULL or empty; definition_json->>'schedule' != 'monthly'; jsonb_array_length(definition_json->'steps') = 0
  verify: SELECT template_key, latest_version, description FROM mission_templates WHERE template_key='fire-drill-monthly' returns one row; definition_json contains schedule and steps for fire drill

AC-2 Mission execution produces parity report (flow_ref T-PLAT-025)
  GIVEN: Mission template registered and scheduled
  WHEN:  the mission executes (scheduled or manual trigger)
  THEN:  the mission runs holo restore:fire-drill and captures parity-report.json as an output artifact; the mission record contains a pointer to the parity report
  TEST_TIER: integration · VERIFICATION_SERVICE: Postgres+mission-executor · TDD_STATE: none
  SCENARIO — start_ref: mission_template_registered · evidence: db_query
    NEGATIVE_CONTROL: would fail if template is a stub; definition_json is empty; schedule is missing
    MUST_OBSERVE: SELECT count(*) FROM mission_runs WHERE mission_key='fire-drill-monthly' = 1 (record created); SELECT status FROM mission_runs WHERE mission_key='fire-drill-monthly' ORDER BY created_at DESC LIMIT 1 IN ('SUCCESS', 'FAILED'); SELECT output_artifacts ? 'parity-report.json' FROM mission_runs WHERE mission_key='fire-drill-monthly' ORDER BY created_at DESC LIMIT 1 = true; test -f parity-report.json exit = 0 AND stat -f %s parity-report.json > 0 (file exists and non-empty)
    MUST_NOT_OBSERVE: SELECT count(*) = 0 (no record — fake-success start state); status NOT IN ('SUCCESS', 'FAILED'); output_artifacts ? 'parity-report.json' = false; test -f parity-report.json exit != 0
  verify: SELECT * FROM mission_runs WHERE mission_key='fire-drill-monthly' ORDER BY created_at DESC LIMIT 1 shows status='SUCCESS' or 'FAILED'; output_artifacts contains 'parity-report.json'

AC-3 Failed parity check surfaces as mission failure (flow_ref T-PLAT-025)
  GIVEN: Mission execution running
  WHEN:  parity-report.json shows any PARITY_PASS=false
  THEN:  the mission status is set to FAILED; an alert is emitted (via D04-05 alerting integration); the mission record captures the failure reason
  TEST_TIER: integration · VERIFICATION_SERVICE: Postgres+mission-executor+alerting · TDD_STATE: none
  SCENARIO — start_ref: mission_template_registered · evidence: db_query
    NEGATIVE_CONTROL: would fail if template is a stub; definition_json is empty; schedule is missing
    MUST_OBSERVE: SELECT status FROM mission_runs WHERE mission_key='fire-drill-monthly' ORDER BY created_at DESC LIMIT 1 = 'FAILED'; SELECT failure_reason FROM mission_runs WHERE mission_key='fire-drill-monthly' ORDER BY created_at DESC LIMIT 1 CONTAINS 'PARITY' or 'false'; alert webhook POST count = 1 in alert log (alert emitted); jq '.POSTGRES_PARITY_PASS' parity-report.json = false
    MUST_NOT_OBSERVE: status = 'SUCCESS' (fake-success start state); failure_reason IS NULL or empty; alert webhook POST count = 0; jq '.POSTGRES_PARITY_PASS' = true
  verify: Inject parity failure (e.g., corrupt R2 repo); run mission; SELECT status FROM mission_runs WHERE mission_key='fire-drill-monthly' ORDER BY created_at DESC LIMIT 1 shows 'FAILED'; failure_reason contains 'PARITY_PASS false'

AC-4 Operator runbook authored and committed (flow_ref T-PLAT-025)
  GIVEN: Mission template and fire drill command working
  WHEN:  operator reads the runbook
  THEN:  the runbook is a step-by-step checklist covering: pre-drill snapshot capture, fresh target provision (or use existing), restore execution, parity verification, teardown, and troubleshooting; the runbook is version-controlled in .spec/prds/mk6-migration/runbooks/
  TEST_TIER: unit · VERIFICATION_SERVICE: filesystem · TDD_STATE: none
  SCENARIO — start_ref: d05_04_fire_drill_working · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if template is a stub; definition_json is empty; schedule is missing
    MUST_OBSERVE: test -f .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md exit = 0 (file exists); grep -c '^## ' .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md >= 4 (at least 4 sections); grep -c 'Pre-Drill Checklist' .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md >= 1; grep -c 'holo restore:fire-drill' .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md >= 1 (contains concrete command)
    MUST_NOT_OBSERVE: test -f exit != 0 (missing — fake-success start state); grep -c '^## ' < 4 (sections missing); grep -c 'holo restore:fire-drill' = 0 (no concrete commands)
  verify: ls .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md exists; cat contains sections: Pre-Drill Checklist, Execution Steps, Verification, Troubleshooting; each step has concrete commands

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/mission/templates/fire-drill-monthly.json (NEW)
- .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md (NEW)
- services/platform/src/mission/index.ts (MODIFY — if registration helper needed)
writeProhibited: Modifying mission_templates schema (0017_mission_contracts.sql owns it); Scheduling the mission more frequently than monthly; Omitting the parity report from mission outputs; Authoring a runbook that skips verification steps; Hardcoding credentials or timestamps in the mission template

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/D04-03-configure-continuous-wal-archiving-and-scheduled-base-backups.md:32-280 [INFRA task structure with REQUIREMENT-CONTRACT v1 block, AC/TC pattern, scenario shaping]
2. /Users/inference1/Projects/holocron/services/platform/src/db/migrations/0017_mission_contracts.sql:1-50 [mission_templates and mission_template_versions schema: template_key, latest_version, definition_json, compiled_plan_json]
3. /Users/inference1/Projects/holocron/services/platform/src/mission/templates/README.md:1-80 [Mission template structure, definition_json schema, and schedule patterns]
4. /Users/inference1/Projects/holocron/services/platform/src/observability/mission-research.ts:1-60 [Mission executor pattern: run mission, capture output artifacts, set status]
5. /Users/inference1/Projects/holocron/services/platform/src/backup/fire-drill.ts:1-50 [Fire drill command that the mission will execute]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Mission template registered: `SELECT template_key, latest_version, schedule FROM mission_templates WHERE template_key='fire-drill-monthly'` → 1 row; schedule='monthly'
- Runbook exists: `ls -la .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md; cat .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md | grep '## Pre-Drill Checklist'` → File exists; contains sections
- Mission produces parity report: `SELECT output_artifacts FROM mission_runs WHERE mission_key='fire-drill-monthly' ORDER BY created_at DESC LIMIT 1` → output_artifacts contains 'parity-report.json'
- Parity failure surfaces: `Inject failure; run mission; SELECT status, failure_reason FROM mission_runs ORDER BY created_at DESC LIMIT 1` → status='FAILED'; failure_reason mentions parity

--------------------------------------------------------------------------------
DESIGN / ANTI-PATTERN
--------------------------------------------------------------------------------
pattern: Mission template registration with monthly schedule and parity-check-driven status
anti_pattern: Mission that runs fire drill but ignores parity results; runbook that omits verification; mission status always SUCCESS; scheduling too frequently

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D05-04 · Blocks: D05-06

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
    "d05_04_fire_drill_working": {
      "description": "D05-04 fire drill command is implemented and working; holo restore:fire-drill exits 0 and produces parity-report.json with all PARITY_PASS=true",
      "seed_method": "cli",
      "records": [
        "holo restore:fire-drill --target-timestamp <ts> --scratch <pgdata> exits 0",
        "parity-report.json contains POSTGRES_PARITY_PASS:true, LEDGER_CHECKSUM_MATCH:true, BLOB_PARITY_PASS:true",
        "all concrete counts/digests present"
      ]
    },
    "mission_template_registered": {
      "description": "fire-drill-monthly mission template is registered in mission_templates table with template_key, version, schedule='monthly', and valid definition_json",
      "seed_method": "cli",
      "records": [
        "mission_templates contains fire-drill-monthly row",
        "template_key='fire-drill-monthly'",
        "latest_version='1.0.0' (or similar)",
        "definition_json.schedule='monthly'",
        "definition_json.steps contains fire-drill command"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-025",
      "description": "GIVEN D05-04 working WHEN operator registers fire-drill-monthly mission THEN mission_templates contains the template with template_key, version, schedule='monthly', and valid definition_json",
      "verify": "SELECT FROM mission_templates WHERE template_key='fire-drill-monthly' returns 1 row; definition_json contains schedule and steps",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres+mission-registry",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "template not registered (stub)",
            "definition_json is empty (static)",
            "schedule is omitted",
            "template_key does not match"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "d05_04_fire_drill_working",
            "action": {
              "actor": "operator",
              "steps": [
                "run mission-template-register",
                "query mission_templates"
              ]
            },
            "end_state": {
              "must_observe": [
                "SELECT count(*) = 1",
                "latest_version = '1.0.0' (length > 0)",
                "definition_json->>'schedule' = 'monthly'",
                "jsonb_array_length(definition_json->'steps') >= 1"
              ],
              "must_not_observe": [
                "count(*) = 0",
                "latest_version NULL",
                "definition_json->>'schedule' != 'monthly'"
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
      "description": "GIVEN mission registered WHEN mission executes THEN runs holo restore:fire-drill; captures parity-report.json; mission_runs record contains output_artifacts",
      "verify": "mission_runs shows status; output_artifacts contains 'parity-report.json'; file exists",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres+mission-executor",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "template is a stub",
            "definition_json is empty",
            "schedule is missing",
            "template_key does not match"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "mission_template_registered",
            "action": {
              "actor": "system",
              "steps": [
                "scheduler triggers mission",
                "executor runs steps",
                "captures artifacts"
              ]
            },
            "end_state": {
              "must_observe": [
                "SELECT count(*) FROM mission_runs = 1",
                "status IN ('SUCCESS', 'FAILED')",
                "output_artifacts ? 'parity-report.json' = true",
                "test -f parity-report.json exit = 0 AND stat -f %s > 0"
              ],
              "must_not_observe": [
                "count(*) = 0",
                "status NOT IN ('SUCCESS', 'FAILED')",
                "output_artifacts ? 'parity-report.json' = false",
                "test -f exit != 0"
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
      "description": "GIVEN mission executing WHEN parity fails THEN mission status FAILED; alert emitted; failure_reason captured",
      "verify": "Inject parity failure; run mission; status='FAILED'; failure_reason mentions parity; alert emitted",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres+mission-executor+alerting",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "template is a stub",
            "definition_json is empty",
            "schedule is missing",
            "template_key does not match"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "mission_template_registered",
            "action": {
              "actor": "operator",
              "steps": [
                "corrupt R2 or mock failure",
                "trigger mission",
                "check status"
              ]
            },
            "end_state": {
              "must_observe": [
                "status = 'FAILED'",
                "failure_reason CONTAINS 'PARITY' or 'false'",
                "alert webhook POST count = 1",
                "jq '.POSTGRES_PARITY_PASS' = false"
              ],
              "must_not_observe": [
                "status = 'SUCCESS'",
                "failure_reason IS NULL",
                "alert count = 0"
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
      "description": "GIVEN mission and drill working WHEN operator reads runbook THEN runbook exists with sections: Pre-Drill Checklist, Execution Steps, Verification, Troubleshooting; contains concrete commands",
      "verify": "cat runbooks/fire-drill-monthly.md contains sections with executable commands",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": "filesystem",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "template is a stub",
            "definition_json is empty",
            "schedule is missing",
            "template_key does not match"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "d05_04_fire_drill_working",
            "action": {
              "actor": "operator",
              "steps": [
                "cat runbooks/fire-drill-monthly.md",
                "verify sections"
              ]
            },
            "end_state": {
              "must_observe": [
                "test -f runbooks/fire-drill-monthly.md exit = 0",
                "grep -c '^## ' >= 4",
                "grep -c 'Pre-Drill Checklist' >= 1",
                "grep -c 'holo restore:fire-drill' >= 1"
              ],
              "must_not_observe": [
                "test -f exit != 0",
                "grep -c '^## ' < 4",
                "grep -c 'holo restore:fire-drill' = 0"
              ]
            }
          }
        ],
        "primary": false
      },
      "test_tier": "unit",
      "unit_test_justified": "Runbook is documentation; verified by file existence + section structure, not a real-service integration test"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Mission template registered and scheduled monthly",
      "maps_to_ac": "AC-1",
      "verify": "SELECT FROM mission_templates WHERE template_key='fire-drill-monthly' returns 1 row with schedule='monthly'"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Mission execution produces parity report artifact",
      "maps_to_ac": "AC-2",
      "verify": "mission_runs record shows output_artifacts contains 'parity-report.json'"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Failed parity check surfaces as mission failure",
      "maps_to_ac": "AC-3",
      "verify": "Inject parity failure; mission_runs status='FAILED'; failure_reason mentions parity"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Operator runbook authored and committed",
      "maps_to_ac": "AC-4",
      "verify": "fire-drill-monthly.md exists with sections: Pre-Drill, Execution, Verification, Troubleshooting"
    }
  ]
}
-->

</details>
