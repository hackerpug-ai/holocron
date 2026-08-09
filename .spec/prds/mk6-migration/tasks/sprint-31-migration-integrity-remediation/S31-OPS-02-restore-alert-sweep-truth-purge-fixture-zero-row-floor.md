# S31-OPS-02: Restore alert-sweep truth — repoint to production, purge fixture rows, add the zero-row floor **[OPERATOR_EXECUTED: yes — production heartbeat DELETE]**

> **Closure:** ✅ Completed with verification exception · implementation landed in `279afaf5`; production purge completed 2026-08-09 after dump. Five fixture rows were deleted, zero fixture-like rows remain, and six real jobs were preserved. Healthy-chain verification remains not passed because those real jobs are overdue and `ALERT_WEBHOOK_URL` is unset.

> **Task ID:** S31-OPS-02
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Type:** OPS · **Priority:** P0 · **Effort:** S · **Estimate:** 90 min
> **PROPOSED-BY:** `devops-engineer`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Status:** Backlog
> **OPERATOR_EXECUTED:** yes (production `backup_heartbeat` DELETE is never agent-automated)
> **IRREVERSIBLE:** yes for production row purge — take a SQL dump of fixture rows before DELETE

**Capabilities:** CAP-BAK-01
**PRD refs:** UC-PLAT-06 · R24 · Sprint 27 gate fixture residue

## What this does

Repoints alert-sweep at the production DATABASE_URL (not a captured harness URL), has the operator purge Sprint 27 gate fixture rows from production `backup_heartbeat`, and adds a zero-row floor so an empty heartbeat table cannot report healthy.

## Why

R24: Sprint 27 gate fixtures still sit in the production heartbeat table; harnesses captured alert-sweep DATABASE_URL. A sweep that only sees fixtures or that treats zero rows as healthy hides real backup failures.

## How to verify

- Operator: `SELECT count(*) FROM backup_heartbeat WHERE job_name LIKE '%fixture%' OR …` → 0 after purge; dump retained.
- `holo backup:alert-sweep --json` with production URL exits 0 on healthy chain and non-zero when a real job is overdue/failed.
- Empty heartbeat table (nonprod fixture) → alert-sweep or backup:healthy exits non-zero with ZERO_ROW_FLOOR (or equivalent).

## Scope

Alert-sweep config, zero-row floor logic, operator purge runbook. Not R2 rotation (S31-OPS-01) or harness isolation (S31-OPS-03).

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-OPS-02 - Alert-sweep truth + zero-row floor (operator DELETE)
================================================================================

TASK_TYPE:  OPS
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S
AGENT:      implementer=devops-engineer | reviewer=devops-engineer
PROPOSED-BY: devops-engineer
ESTIMATE:   90 minutes
TDD_MODE:   red_first
OPERATOR_EXECUTED: true
IRREVERSIBLE: true (production heartbeat DELETE)
CAPABILITIES: CAP-BAK-01
PRD_REFS:   UC-PLAT-06 · R24

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: 0/4 ACs complete

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------

Alert-sweep reads production heartbeats without fixture rows and refuses an empty table as healthy.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- NEVER agent-DELETE production heartbeat rows — operator only, after dump.
- NEVER leave alert-sweep DATABASE_URL pointing at a harness capture.
- NEVER treat zero heartbeat rows as all-healthy.
- NEVER commit production connection strings.
- NEVER poison production from integration tests (use nonprod for zero-row tests).

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] Operator purge leaves 0 fixture heartbeat rows in production — AC-1 (PRIMARY) [OPERATOR]
- [ ] Zero-row nonprod table makes healthy/alert-sweep fail closed — AC-2
- [ ] alert-sweep plist/env points at production URL placeholder consistent with secrets — AC-3
- [ ] Induced real failure still alerts (paired with backup:induce-failure) — AC-4

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

AC-1: Production fixture heartbeat rows purged [PRIMARY] [OPERATOR]
  GIVEN: dump of current backup_heartbeat; identified fixture job_name patterns from Sprint 27
  WHEN:  operator DELETEs fixture rows only
  THEN:  count of fixture-pattern rows == 0; dump file retained off-git or in operator store

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  operator-postgres
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-02-alert-sweep.test.ts
  TEST_FUNCTION: operatorPurgeChecklist (verifies runbook + nonprod analog)

  SCENARIO:
    START_REF:        production_heartbeat_with_fixtures
    NEGATIVE_CONTROL: would fail if fixtures remain | full table truncate | no dump
    EVIDENCE:         db_query
    CASES:
      - ACTION: operator dumps; deletes fixture rows; recounts
        MUST_OBSERVE:
          - fixture-pattern row count == 0
          - dump file exists with pre-delete counts
          - non-fixture production job rows still present if they existed
        MUST_NOT_OBSERVE:
          - TRUNCATE backup_heartbeat
          - agent performing production DELETE
          - dump skipped

AC-2: Zero-row floor fails closed
  GIVEN: nonprod namespace with 0 backup_heartbeat rows
  WHEN:  holo backup:healthy --json and/or backup:alert-sweep --json
  THEN:  exit != 0 and reason names ZERO_ROW_FLOOR or empty heartbeat

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres+cli
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-02-alert-sweep.test.ts
  TEST_FUNCTION: zeroRowFloorFailsClosed

  SCENARIO:
    START_REF:        empty_heartbeat_nonprod
    NEGATIVE_CONTROL: would fail if exit 0 on empty | silent healthy
    EVIDENCE:         stdout
    CASES:
      - ACTION: truncate heartbeat on nonprod; run healthy + alert-sweep
        MUST_OBSERVE: exit != 0 · reason token present · ok != true
        MUST_NOT_OBSERVE: exit 0 · ok:true with 0 rows

AC-3: Alert-sweep config repointed off harness capture
  GIVEN: holocron-backup-alert-sweep.plist + secrets example
  WHEN:  inspected for DATABASE_URL source
  THEN:  uses @DATABASE_URL@ / secrets resolution, not a baked harness URL host

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  filesystem
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-02-alert-sweep.test.ts
  TEST_FUNCTION: alertSweepNotPinnedToHarnessUrl

AC-4: Real failure still alerts
  GIVEN: nonprod with ≥1 real job row + webhook test double or recorded transport
  WHEN:  backup:induce-failure then alert-sweep
  THEN:  sweep reports alert fired or pending with failed job_name

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli+postgres
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-02-alert-sweep.test.ts
  TEST_FUNCTION: inducedFailureStillAlerts

--------------------------------------------------------------------------------
FIXTURES
--------------------------------------------------------------------------------

empty_heartbeat_nonprod — provisioned nonprod, backup_heartbeat empty
production_heartbeat_with_fixtures — operator-only; fixture job_name patterns documented in runbook

--------------------------------------------------------------------------------
SCOPE
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/backup/**alert** (MODIFY — zero-row floor)
- services/platform/src/cli/holo.ts (MODIFY backup:healthy / alert-sweep if needed)
- services/platform/deploy/launchd/holocron-backup-alert-sweep.plist (MODIFY)
- .spec/prds/mk6-migration/runbooks/** (NEW operator purge checklist)
- services/platform/tests/integration/sprint31-ops-02-alert-sweep.test.ts (NEW)

writeProhibited:
- Agent DELETE on production
- R2 rotation (S31-OPS-01)
- Writing production conf from tests (S31-OPS-03)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. services/platform/src/cli/holo.ts backup:alert-sweep / backup:healthy cases
2. Sprint 27 D04-01 alert tasks under tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/
3. 08-technical-risks.md R24
4. services/platform/deploy/launchd/holocron-backup-alert-sweep.plist
5. SPRINT.md operator-executed note for S31-OPS-02

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Full fire-drill (S31-OPS-04)
- CI lane health (S31-OPS-05)
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-OPS-02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "empty_heartbeat_nonprod": {
      "description": "Nonprod DB with zero backup_heartbeat rows",
      "seed_method": "migration_fixture",
      "records": [
        "backup_heartbeat count 0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "maps_to_ac": null,
      "description": "Production fixture heartbeat rows purged",
      "verify": "OPERATOR: production fixture heartbeat purge to 0 rows (dump retained); PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-ops-02-alert-sweep.test.ts",
      "tier": "visible",
      "test_tier": "e2e",
      "verification_service": "operator-postgres",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "fixtures remain",
          "full table truncate",
          "no dump"
        ]
      },
      "evidence": {
        "artifact_type": "db_query",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "empty_heartbeat_nonprod",
          "action": {
            "actor": "operator",
            "steps": [
              "dump production heartbeat",
              "DELETE fixture rows only",
              "recount"
            ]
          },
          "end_state": {
            "must_observe": [
              "fixture-pattern row count == 0",
              "dump file exists",
              "non-fixture rows preserved when present"
            ],
            "must_not_observe": [
              "TRUNCATE backup_heartbeat",
              "agent performing production DELETE"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "Zero-row floor fails closed",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-ops-02-alert-sweep.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "postgres+cli",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "exit 0 on empty",
          "silent healthy"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "empty_heartbeat_nonprod",
          "action": {
            "actor": "cli_user",
            "steps": [
              "ensure 0 heartbeat rows",
              "run backup:healthy --json"
            ]
          },
          "end_state": {
            "must_observe": [
              "exit code != 0",
              "reason names empty or ZERO_ROW_FLOOR"
            ],
            "must_not_observe": [
              "exit 0",
              "ok:true with 0 rows"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "Alert-sweep config repointed off harness capture",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-ops-02-alert-sweep.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "cli",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "empty fixture",
          "mock-only harness",
          "hardcoded pass",
          "skip under PLATFORM_IT=1"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "empty_heartbeat_nonprod",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-3",
              "Assert prose AC: Alert-sweep config repointed off harness capture"
            ]
          },
          "end_state": {
            "must_observe": [
              "Alert-sweep config repointed off harness capture"
            ],
            "must_not_observe": [
              "verify command skipped",
              "PRIMARY without real dependency"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "Real failure still alerts",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-ops-02-alert-sweep.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "cli",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "empty fixture",
          "mock-only harness",
          "hardcoded pass",
          "skip under PLATFORM_IT=1"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "empty_heartbeat_nonprod",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-4",
              "Assert prose AC: Real failure still alerts"
            ]
          },
          "end_state": {
            "must_observe": [
              "Real failure still alerts"
            ],
            "must_not_observe": [
              "verify command skipped",
              "PRIMARY without real dependency"
            ]
          }
        }
      ]
    }
  ]
}
-->

</details>

---

**Report to:** team-lead after operator purge dump + zero-row tests green.
