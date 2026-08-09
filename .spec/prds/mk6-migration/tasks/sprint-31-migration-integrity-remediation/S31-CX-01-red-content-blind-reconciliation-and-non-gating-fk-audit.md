# S31-CX-01: RED — content-blind reconciliation and non-gating FK audit pass on corrupt data

> **Task ID:** S31-CX-01
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Type:** RED · **Priority:** P0 · **Effort:** S · **Estimate:** 90 min
> **PROPOSED-BY:** `convex-planner`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes (RED-only deliverable; GREEN is S31-CX-03 / S31-CX-04)
> **Status:** Backlog

**Capabilities:** CAP-MIG-01
**PRD refs:** UC-DATA-05 · R22 · R30

## What this does

Authors and lands the RED integration suite that proves today's ETL reconciliation is content-blind and today's FK audit can report `ok:true` with zero enforced domain foreign keys. No product fix is required in this task — capturing failing assertions against HEAD is the deliverable.

## Why

R22: row-count parity cannot detect field-level corruption from null coercion or column-default substitution. R30: `fk-audit` derives `ok` from `issues.length` alone, so a database with zero FK constraints still passes. S31-CX-03 and S31-CX-04 implement the fixes; without committed RED evidence those fixes can greenwash.

## How to verify

- `PLATFORM_IT=1 pnpm test:integration -- services/platform/tests/integration/sprint31-cx-01-red-reconcile-fk.test.ts` exits non-zero on HEAD (RED) with named assertions:
  - content corruption with matching counts still yields reconcile `ok:true` today (bug), so the RED test asserts the *desired* fail-closed behaviour and therefore FAILS until S31-CX-03.
  - FK audit `ok:true` with `enforcedForeignKeys === 0` fails the desired assertion until S31-CX-04.
- RED evidence artifact committed under the sprint `.gate-evidence/` or test snapshot path as required by verification_policy.

## Scope

Tests and fixtures only. No changes to `reconcile.ts` or `fk-audit.ts` production logic (those are S31-CX-03 / S31-CX-04).

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-CX-01 - RED content-blind reconcile + non-gating FK audit
================================================================================

TASK_TYPE:  RED
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: convex-planner
ESTIMATE:   90 minutes
TDD_MODE:   red_first
CAPABILITIES: CAP-MIG-01
PRD_REFS:   UC-DATA-05 · R22 · R30

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: 0/3 ACs complete

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------

Committed RED tests fail on HEAD, proving content-blind reconcile and zero-constraint FK ok:true.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- NEVER implement the production fix in this task — RED only (GREEN is S31-CX-03 / S31-CX-04).
- NEVER mock Postgres or the archive reader.
- NEVER assert on today's buggy pass as a permanent AC; assert desired fail-closed behaviour that fails until fixed.
- NEVER re-run production ETL (01-scope).
- NEVER plant violations in production database — use nonprod/provisioned namespace only.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] RED test proves corrupt field values with matching row counts still pass reconcile today by failing the desired assertion — AC-1 (PRIMARY)
- [ ] RED test proves FK audit ok:true with 0 domain FKs by failing the desired assertion — AC-2
- [ ] RED evidence (failing run log) captured and referenced — AC-3
- [ ] Only SCOPE.writeAllowed files modified (tests/fixtures/evidence)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

AC-1: Content corruption with matching counts is rejected by the desired contract [PRIMARY]
  GIVEN: nonprod DB + archive where documents row counts match but one field is corrupted
  WHEN:  holo catalog:reconcile / runEtlReconcile runs (or the CLI that wraps it)
  THEN:  the DESIRED contract requires ok:false and fieldDigestMismatches >= 1 — this assertion FAILS on HEAD (RED)

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres+filesystem
  TEST_FILE:     services/platform/tests/integration/sprint31-cx-01-red-reconcile-fk.test.ts
  TEST_FUNCTION: contentCorruptionWithMatchingCountsMustFailReconcile

  SCENARIO:
    START_REF:        corrupt_content_matching_counts
    NEGATIVE_CONTROL: would fail if empty archive | mock reconcile | count-only assertion without field check
    EVIDENCE:         stdout
    CASES:
      - ACTION: plant matching counts + corrupted title field; run reconcile --json; assert desired fail-closed fields
        MUST_OBSERVE (post S31-CX-03; RED fails until then):
          - ok == false
          - fieldDigestMismatches >= 1
          - exit code != 0
        MUST_NOT_OBSERVE (desired):
          - ok:true with corrupted field present
          - variance 0 used as sole success signal

AC-2: FK audit must not ok:true with zero enforced domain FKs
  GIVEN: migrated domain tables with 0 FOREIGN KEY constraints
  WHEN:  FK audit runs
  THEN:  desired contract requires ok:false and unenforcedEdges.length > 0 — FAILS on HEAD if ok ignores constraints (RED)

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres
  TEST_FILE:     services/platform/tests/integration/sprint31-cx-01-red-reconcile-fk.test.ts
  TEST_FUNCTION: fkAuditMustNotPassWithZeroConstraints

  SCENARIO:
    START_REF:        loaded_db_no_domain_fks
    NEGATIVE_CONTROL: would fail if stub ok | empty edge set | issues.length-only gate
    EVIDENCE:         db_query
    CASES:
      - ACTION: confirm 0 domain FKs; run fk-audit; assert desired ok:false
        MUST_OBSERVE (post S31-CX-04; RED fails until then):
          - ok == false OR unenforcedEdges.length == edgeCount for eligible edges
          - enforcedForeignKeys count reported
        MUST_NOT_OBSERVE (desired):
          - ok:true with enforcedForeignKeys == 0 and eligible edges > 0

AC-3: RED evidence artifact is durable
  GIVEN: the failing test run from AC-1 and AC-2
  WHEN:  implementer captures the run
  THEN:  a log or json artifact under the sprint task evidence path records non-zero exit and assertion names

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  filesystem
  TEST_FILE:     services/platform/tests/integration/sprint31-cx-01-red-reconcile-fk.test.ts
  TEST_FUNCTION: redEvidenceArtifactPresent

--------------------------------------------------------------------------------
FIXTURES
--------------------------------------------------------------------------------

corrupt_content_matching_counts (seed_method: migration_fixture)
  - documents source count == loaded count
  - one documents.title (or equivalent) byte-corrupted in Postgres
  - archive export_root available from etl_runs or fixture export

loaded_db_no_domain_fks (seed_method: migration_fixture)
  - domain tables present
  - FOREIGN KEY constraints on migrated domain tables: 0

--------------------------------------------------------------------------------
SCOPE
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/tests/integration/sprint31-cx-01-red-reconcile-fk.test.ts (NEW)
- services/platform/tests/fixtures/s31-cx-01/** (NEW)
- .spec/prds/mk6-migration/tasks/sprint-31-migration-integrity-remediation/.gate-evidence/s31-cx-01/** (NEW — RED logs)

writeProhibited:
- services/platform/src/etl/reconcile.ts (S31-CX-03)
- services/platform/src/etl/fk-audit.ts (S31-CX-04)
- services/platform/src/etl/transform.ts production behaviour changes
- Production database / production ETL re-run

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. services/platform/src/etl/reconcile.ts — count-only variance
2. services/platform/src/etl/fk-audit.ts — ok from issues.length (R30)
3. services/platform/src/etl/transform.ts:63,75,87,102 — null coercion sites (R22)
4. .spec/prds/mk6-migration/10-technical-requirements/08-technical-risks.md — R22, R30
5. S31-CX-03 and S31-CX-04 task files — GREEN counterparts

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Implementing content digests (S31-CX-03)
- Deriving edges / gating FK audit (S31-CX-04)
- Archive provenance (S31-CX-02)
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-CX-01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "corrupt_content_matching_counts": {
      "description": "Matching row counts with one corrupted field value in Postgres",
      "seed_method": "migration_fixture",
      "records": [
        "documents sourceCount == loadedCount",
        "one documents field corrupted",
        "archive present"
      ]
    },
    "loaded_db_no_domain_fks": {
      "description": "Migrated domain tables with zero FK constraints",
      "seed_method": "migration_fixture",
      "records": [
        "domain tables present",
        "FOREIGN KEY constraints on domain tables: 0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "postgres+filesystem",
      "topology": "single-node",
      "primary": true,
      "negative_control": {
        "would_fail_if": ["empty archive", "mock reconcile", "count-only assertion"]
      },
      "evidence": { "artifact_type": "stdout", "required_capture": true },
      "cases": [
        {
          "start_ref": "corrupt_content_matching_counts",
          "action": {
            "actor": "cli_user",
            "steps": [
              "plant matching counts with corrupted field",
              "run reconcile --json",
              "assert desired ok:false and fieldDigestMismatches >= 1"
            ]
          },
          "end_state": {
            "must_observe": [
              "desired: ok == false",
              "desired: fieldDigestMismatches >= 1",
              "RED: assertion fails on HEAD until S31-CX-03"
            ],
            "must_not_observe": [
              "desired contract accepting ok:true with corrupted field",
              "empty archive used as success"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-2",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "postgres",
      "topology": "single-node",
      "primary": false,
      "negative_control": {
        "would_fail_if": ["stub ok", "empty edge set", "issues.length-only gate"]
      },
      "evidence": { "artifact_type": "db_query", "required_capture": true },
      "cases": [
        {
          "start_ref": "loaded_db_no_domain_fks",
          "action": {
            "actor": "cli_user",
            "steps": ["confirm 0 domain FKs", "run fk-audit", "assert desired fail-closed ok"]
          },
          "end_state": {
            "must_observe": [
              "desired: ok false when eligible edges unenforced",
              "enforcedForeignKeys count reported"
            ],
            "must_not_observe": [
              "desired: ok:true with enforcedForeignKeys == 0 and eligible edges > 0"
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

**Report to:** team-lead once RED evidence is captured (no GREEN required in this task).
