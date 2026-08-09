# S31-OPS-03: Isolate integration/gate harnesses from production config paths

> **Task ID:** S31-OPS-03
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Type:** OPS · **Priority:** P0 · **Effort:** S · **Estimate:** 60 min
> **PROPOSED-BY:** `devops-engineer`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Status:** Backlog

**Capabilities:** CAP-BAK-01, CAP-MIG-01
**PRD refs:** UC-PLAT-04 · R24

## What this does

Ensures integration and human-gate harnesses resolve config, secrets, and pgbackrest paths only under ephemeral nonprod roots (e.g. `.tmp/`, `services/platform/deploy/nonprod/`), and fail closed if a harness process would read or write production `pgbackrest.conf`, production secrets.yaml, or production PGDATA.

## Why

R24: Sprint 29's PITR test overwrote Sprint 27's production `pgbackrest.conf` and captured the alert-sweep DATABASE_URL. A harness that can mutate production config falsifies every CAP-BAK-01 claim.

## How to verify

- `PLATFORM_IT=1 pnpm test:integration -- services/platform/tests/integration/sprint31-ops-03-harness-isolation.test.ts` exits 0.
- A deliberate probe that sets HOLO_PGBACKREST_CONF to the production path is refused with HARNESS_PRODUCTION_PATH_REFUSED.
- `git grep` / suite asserts no test writes the canonical production conf absolute path.

## Scope

Harness path guards, test helpers, and any backup/PITR test setup that still points at production. Not operator backup restore (S31-OPS-01).

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-OPS-03 - Isolate gate harnesses from production config
================================================================================

TASK_TYPE:  OPS
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S
AGENT:      implementer=devops-engineer | reviewer=devops-engineer
PROPOSED-BY: devops-engineer
ESTIMATE:   60 minutes
TDD_MODE:   red_first
CAPABILITIES: CAP-BAK-01, CAP-MIG-01
PRD_REFS:   UC-PLAT-04 · R24

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: 0/3 ACs complete

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------

Any harness that targets a production config/PGDATA path exits non-zero before mutation.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- NEVER allow tests to write production pgbackrest.conf.
- NEVER read production secrets.yaml into an integration process when HOLO_HARNESS=1.
- NEVER weaken isolation by allowlisting production paths under PLATFORM_IT.
- NEVER use live mini PGDATA as scratch for PITR/fire-drill tests.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] Production conf path write attempt is refused — AC-1 (PRIMARY)
- [ ] Harness secrets resolution uses ephemeral path only — AC-2
- [ ] Existing PITR/backup integration tests pass under isolated roots — AC-3

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

AC-1: Production path mutation refused [PRIMARY]
  GIVEN: HOLO_HARNESS=1 and HOLO_PGBACKREST_CONF set to a known production absolute path
  WHEN:  backup provision/validate or PITR setup runs
  THEN:  exit != 0 with HARNESS_PRODUCTION_PATH_REFUSED; file mtime unchanged

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  filesystem+cli
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-03-harness-isolation.test.ts
  TEST_FUNCTION: productionConfWriteRefused

  SCENARIO:
    START_REF:        harness_env
    NEGATIVE_CONTROL: would fail if write succeeds | mtime changes | exit 0
    EVIDENCE:         stdout
    CASES:
      - ACTION: point conf at production path; invoke harness entry; stat mtime before/after
        MUST_OBSERVE: exit != 0 · HARNESS_PRODUCTION_PATH_REFUSED · mtime equal
        MUST_NOT_OBSERVE: exit 0 · file content changed

AC-2: Harness secrets stay ephemeral
  GIVEN: HOLO_HARNESS=1
  WHEN:  secrets loader runs
  THEN:  resolved path is under .tmp/ or deploy/nonprod/, never services/platform/config/secrets.yaml production operator file unless explicitly opted out for operator tools

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-03-harness-isolation.test.ts
  TEST_FUNCTION: harnessSecretsPathEphemeral

AC-3: Backup integration tests use isolated roots
  GIVEN: PLATFORM_IT backup/PITR tests
  WHEN:  suite runs
  THEN:  all conf/repo paths under integration/ or .tmp/; 0 references to production absolute conf in test setup

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  filesystem
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-03-harness-isolation.test.ts
  TEST_FUNCTION: backupTestsUseIsolatedRoots

--------------------------------------------------------------------------------
FIXTURES
--------------------------------------------------------------------------------

harness_env — HOLO_HARNESS=1, disposable dirs under .tmp/s31-ops-03/

--------------------------------------------------------------------------------
SCOPE
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/backup/** (MODIFY path guards)
- services/platform/src/db/connection.ts (MODIFY only if harness URL guards live here)
- services/platform/tests/integration/** (MODIFY tests that still use production paths)
- services/platform/tests/integration/sprint31-ops-03-harness-isolation.test.ts (NEW)
- services/platform/deploy/nonprod/** (NEW/MODIFY ephemeral conf templates)

writeProhibited:
- Operator production secret values
- Disabling backups on the mini
- Changing R2 account ownership

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. 08-technical-risks.md R24
2. services/platform/src/backup/recovery-baseline.ts — isolated prefix requirements
3. services/platform/src/backup/fire-drill.ts — FORBIDDEN_PGDATA
4. services/platform/deploy/nonprod/
5. Sprint 29 PITR test paths (historical overwrite)

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Operator R2 rotation (S31-OPS-01)
- Fixture heartbeat purge (S31-OPS-02)
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-OPS-03",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "harness_env": {
      "description": "HOLO_HARNESS=1 with disposable .tmp roots",
      "seed_method": "migration_fixture",
      "records": [
        "HOLO_HARNESS=1",
        ".tmp/s31-ops-03 present"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "maps_to_ac": null,
      "description": "Production path mutation refused",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-ops-03-harness-isolation.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "filesystem+cli",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "write succeeds",
          "mtime changes",
          "exit 0"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "harness_env",
          "action": {
            "actor": "cli_user",
            "steps": [
              "set HOLO_PGBACKREST_CONF to production path",
              "invoke harness backup entry",
              "compare mtime before/after"
            ]
          },
          "end_state": {
            "must_observe": [
              "exit code != 0",
              "output contains HARNESS_PRODUCTION_PATH_REFUSED",
              "mtime unchanged"
            ],
            "must_not_observe": [
              "exit 0",
              "file content changed"
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
      "description": "Harness secrets stay ephemeral",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-ops-03-harness-isolation.test.ts",
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
          "start_ref": "harness_env",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-2",
              "Assert prose AC: Harness secrets stay ephemeral"
            ]
          },
          "end_state": {
            "must_observe": [
              "Harness secrets stay ephemeral"
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
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "Backup integration tests use isolated roots",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-ops-03-harness-isolation.test.ts",
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
          "start_ref": "harness_env",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-3",
              "Assert prose AC: Backup integration tests use isolated roots"
            ]
          },
          "end_state": {
            "must_observe": [
              "Backup integration tests use isolated roots"
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

**Report to:** team-lead once production-path refusal is proven.
