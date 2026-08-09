# S31-CX-03: Content-level reconciliation with fail-closed handling of empty source tables

> **Task ID:** S31-CX-03
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Type:** FEATURE · **Priority:** P0 · **Effort:** M · **Estimate:** 180 min
> **PROPOSED-BY:** `convex-planner`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Status:** Backlog

**Capabilities:** CAP-MIG-01
**PRD refs:** UC-DATA-05 · R22 · S31-CX-01 RED suite

## What this does

Extends ETL reconciliation beyond row-count variance to per-field content digests, reports defaulted columns, and fails closed when a source table in the archive is empty while the catalog expects retained rows (or when digests diverge). Turns S31-CX-01's RED assertions green without re-running production ETL.

## Why

R22: null coercion and column-default substitution produce correct counts and wrong values. Empty source tables can also collapse a load into a false "zero variance" story if emptiness is treated as success. Content digests + empty-table refusal make the Sprint 29 retained archive a real witness.

## How to verify

- S31-CX-01 RED suite goes green: corrupt field with matching counts → `ok:false`, `fieldDigestMismatches >= 1`.
- Empty source table fixture → reconcile exits non-zero naming the table.
- `cd services/platform && bun src/cli/holo.ts catalog:reconcile --json` against the retained Sprint 29 archive reports `fieldDigestMismatches: 0` and `defaulted_column` inventory (may be non-zero but listed).

## Scope

`reconcile.ts` (+ helpers), CLI wiring, fixtures, and making CX-01 tests green. Does not re-run ETL load. FK constraint gating remains S31-CX-04.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-CX-03 - Content-level reconciliation + empty source fail-closed
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: convex-planner
ESTIMATE:   180 minutes
TDD_MODE:   red_first
CAPABILITIES: CAP-MIG-01
PRD_REFS:   UC-DATA-05 · R22 · S31-CX-01

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: 0/4 ACs complete

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------

Reconcile fails on field-level corruption and empty retained source tables; clean archive reports zero digest mismatches.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- NEVER re-run production ETL (01-scope).
- NEVER treat row-count variance 0 as sufficient for ok:true.
- NEVER silently skip empty source tables that the catalog marks retain/migrate.
- NEVER mock the archive filesystem.
- NEVER change FK audit production logic here (S31-CX-04).

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] Corrupted field with matching counts yields ok:false and fieldDigestMismatches >= 1 — AC-1 (PRIMARY)
- [ ] Empty retained source table yields non-zero exit naming the table — AC-2
- [ ] Clean retained archive path reports fieldDigestMismatches: 0 — AC-3
- [ ] defaulted_column entries are listed when defaults substituted — AC-4
- [ ] PLATFORM_IT=1 pnpm test:integration passes including S31-CX-01 suite now green

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

AC-1: Field digest mismatch fails reconcile [PRIMARY]
  GIVEN: corrupt_content_matching_counts fixture from S31-CX-01
  WHEN:  catalog:reconcile --json (or etl reconcile CLI)
  THEN:  ok:false, fieldDigestMismatches >= 1, exit != 0

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres+filesystem
  TEST_FILE:     services/platform/tests/integration/sprint31-cx-01-red-reconcile-fk.test.ts
  TEST_FUNCTION: contentCorruptionWithMatchingCountsMustFailReconcile

  SCENARIO:
    START_REF:        corrupt_content_matching_counts
    NEGATIVE_CONTROL: would fail if count-only ok | digest not computed | mock archive
    EVIDENCE:         api_response
    CASES:
      - ACTION: run reconcile against corrupted DB + intact archive
        MUST_OBSERVE:
          - ok == false
          - fieldDigestMismatches >= 1
          - exit code != 0
          - mismatched table name present in report
        MUST_NOT_OBSERVE:
          - ok:true
          - fieldDigestMismatches absent from report schema
          - variance 0 used alone for success

AC-2: Empty retained source table fails closed
  GIVEN: archive table file present with 0 rows for a catalog-retained table that is not approved-empty
  WHEN:  reconcile runs
  THEN:  exit != 0 and reason names EMPTY_SOURCE_TABLE (or equivalent) + table name

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  filesystem+cli
  TEST_FILE:     services/platform/tests/integration/sprint31-cx-03-content-reconcile.test.ts
  TEST_FUNCTION: emptyRetainedSourceTableFailsClosed

AC-3: Clean archive has zero field digest mismatches
  GIVEN: retained Sprint 29 archive + loaded nonprod DB known good (or hermetic fixture pair)
  WHEN:  reconcile --json
  THEN:  fieldDigestMismatches == 0 and ok depends only on digests+variance+empty checks

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres+filesystem
  TEST_FILE:     services/platform/tests/integration/sprint31-cx-03-content-reconcile.test.ts
  TEST_FUNCTION: cleanArchiveZeroFieldDigestMismatches

AC-4: Defaulted columns are reported
  GIVEN: a loaded row where a column value equals the DB default but the source had null/missing
  WHEN:  reconcile runs
  THEN:  defaulted_column inventory includes that table.column with count >= 1

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres
  TEST_FILE:     services/platform/tests/integration/sprint31-cx-03-content-reconcile.test.ts
  TEST_FUNCTION: defaultedColumnsReported

--------------------------------------------------------------------------------
FIXTURES
--------------------------------------------------------------------------------

corrupt_content_matching_counts — shared with S31-CX-01
empty_retained_source_table — archive with 0-row retained table, catalog disposition migrate/retain
clean_s29_pair — retained archive + matching loaded DB (or nonprod snapshot)

--------------------------------------------------------------------------------
SCOPE
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/etl/reconcile.ts (MODIFY)
- services/platform/src/etl/** (NEW helpers for field digests if needed)
- services/platform/src/cli/holo.ts (MODIFY only if report flags needed)
- services/platform/tests/integration/sprint31-cx-03-content-reconcile.test.ts (NEW)
- services/platform/tests/integration/sprint31-cx-01-red-reconcile-fk.test.ts (MODIFY — remains; now green for reconcile half)
- services/platform/tests/fixtures/s31-cx-03/** (NEW)

writeProhibited:
- services/platform/src/etl/fk-audit.ts (S31-CX-04)
- Production ETL re-run
- convex/ source rewrites
- Deleting the retained archive

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. services/platform/src/etl/reconcile.ts — current count variance
2. services/platform/src/etl/transform.ts — null coercion sites
3. services/platform/src/etl/run.ts:501 — column-default substitution
4. S31-CX-01 task file — RED suite to turn green
5. .spec/prds/mk6-migration/10-technical-requirements/08-technical-risks.md R22

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- FK edge derivation / constraint gating (S31-CX-04)
- Archive vs live Convex export (S31-CX-02)
- Permanent domain FK constraints on all tables (01-scope deferred)
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-CX-03",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "corrupt_content_matching_counts": {
      "description": "Matching counts with corrupted field",
      "seed_method": "migration_fixture",
      "records": [
        "documents counts match",
        "one field corrupted"
      ]
    },
    "empty_retained_source_table": {
      "description": "Archive retained table with 0 rows",
      "seed_method": "migration_fixture",
      "records": [
        "table file present",
        "row count 0",
        "catalog disposition retain/migrate"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "maps_to_ac": null,
      "description": "Field digest mismatch fails reconcile",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cx-01-red-reconcile-fk.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "postgres+filesystem",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "count-only ok",
          "digest not computed",
          "mock archive"
        ]
      },
      "evidence": {
        "artifact_type": "api_response",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "corrupt_content_matching_counts",
          "action": {
            "actor": "cli_user",
            "steps": [
              "run reconcile --json against corrupted pair"
            ]
          },
          "end_state": {
            "must_observe": [
              "ok == false",
              "fieldDigestMismatches >= 1",
              "exit code != 0"
            ],
            "must_not_observe": [
              "ok:true",
              "fieldDigestMismatches field absent",
              "success from variance 0 alone"
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
      "description": "Empty retained source table fails closed",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cx-03-content-reconcile.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "filesystem+cli",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "empty table treated as success",
          "silent skip"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "empty_retained_source_table",
          "action": {
            "actor": "cli_user",
            "steps": [
              "run reconcile against empty retained source table fixture"
            ]
          },
          "end_state": {
            "must_observe": [
              "exit code != 0",
              "output names the empty table"
            ],
            "must_not_observe": [
              "ok:true",
              "empty table omitted from report"
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
      "description": "Clean archive has zero field digest mismatches",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cx-03-content-reconcile.test.ts",
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
          "start_ref": "corrupt_content_matching_counts",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-3",
              "Assert prose AC: Clean archive has zero field digest mismatches"
            ]
          },
          "end_state": {
            "must_observe": [
              "Clean archive has zero field digest mismatches"
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
      "description": "Defaulted columns are reported",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cx-03-content-reconcile.test.ts",
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
          "start_ref": "corrupt_content_matching_counts",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-4",
              "Assert prose AC: Defaulted columns are reported"
            ]
          },
          "end_state": {
            "must_observe": [
              "Defaulted columns are reported"
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

**Report to:** team-lead once CX-01 reconcile RED is green and empty-table control passes.
