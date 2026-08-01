# D06-04: Capture export watermark + orchestrate the one-time ETL run

> **Task ID:** D06-04
> **Sprint:** [Sprint 29 — Cutover](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Estimate:** 120 min
> **Type:** INFRA
> **Priority:** P0 · **Effort:** M
> **Proposed By:** `devops-engineer`
> **TDD_MODE:** `skipped` · **RED_GREEN_REQUIRED:** no
> Status: Backlog

**Capabilities:** CAP-MIG-01, CAP-CUT-01
**PRD refs:** UC-SYNC-03, T-SYNC-009, CAP-MIG-01

## Specification

**Objective.** Bind D06-03's freeze/drain state to a concrete export watermark, run a real convex export, and orchestrate the existing Sprint 14 ETL pipeline into one operator command producing zero unexplained variance — UC-SYNC-03 AC-2 / T-SYNC-009 / CAP-MIG-01.

**Success state.** `holo cutover:run-etl --json` refuses when the fence is disengaged; when engaged it captures a concrete watermark, runs a real convex export with a verified non-empty source row count, loads via the existing ETL modules, and emits a report with unexplainedVariance==0 and concrete non-zero loaded counts.

## Critical Constraints

- **MUST** — MUST refuse to run if HOLO_MIGRATION_READ_ONLY != '1' (checked via `npx convex env get`) — fail-closed before touching Convex export or Postgres
- **MUST** — MUST capture the export watermark (real ISO timestamp + lastWriteAuditCount from D06-03's quiet-check) BEFORE spawning `convex export`
- **MUST** — MUST invoke a real `convex export` subprocess against the real dev deployment, never reuse a stale export directory
- **MUST** — MUST assert the real export contains a nonzero source row count for at least documents and conversations BEFORE running reconciliation, so a zero-variance result over an empty export is impossible
- **MUST** — MUST call the existing Sprint 14 etl:run → etl:reconcile → etl:fk-audit → etl:vectors modules in sequence rather than reimplementing load/transform logic
- **NEVER** — NEVER run the ETL against an export captured before the fence was engaged
- **NEVER** — NEVER duplicate rows on re-run — must resume from the existing etl_runs row via latest-run.ts
- **NEVER** — NEVER report unexplainedVariance==0 without having actually run etl:reconcile against a real, non-empty archive
- **STRICTLY** — STRICTLY watermark capture runs and is recorded BEFORE the convex export subprocess is spawned
- **STRICTLY** — STRICTLY the unified report's ok field is the AND of reconcile.ok, fkAudit.ok, and vectors.ok

## Acceptance Criteria

#### AC-1 (PRIMARY)

- **GIVEN** fence_engaged_quiet_confirmed
- **WHEN** operator runs cutover:run-etl --json
- **THEN** watermark captured, real non-empty convex export run, existing ETL pipeline sequenced, unexplainedVariance==0

`test_tier: integration` · `service: postgres` · `flow_ref: T-SYNC-009`
#### AC-2

- **GIVEN** fence_disengaged
- **WHEN** operator runs cutover:run-etl
- **THEN** it refuses before touching export/Postgres with error.code FENCE_NOT_ENGAGED

`test_tier: integration` · `service: convex` · `flow_ref: T-SYNC-009`
#### AC-3

- **GIVEN** fence_engaged_quiet_confirmed
- **WHEN** cutover:run-etl completes
- **THEN** watermark-report.json persists concrete traceable fields

`test_tier: integration` · `service: postgres` · `flow_ref: T-SYNC-009`
#### AC-4

- **GIVEN** a completed run
- **WHEN** operator re-runs cutover:run-etl against the same archive
- **THEN** it resumes without duplicating rows

`test_tier: integration` · `service: postgres` · `flow_ref: T-SYNC-009`

## Test Criteria

| ID | Boolean statement | Maps to | Verify |
|----|-------------------|---------|--------|
| TC-1 | watermarkAt is captured before the export subprocess starts | AC-1 | `assert watermark timestamp precedes export process start time` |
| TC-2 | the export contains a nonzero real documents source count | AC-1 | `jq '.archive.exportData.documents | length' watermark-report.json` |
| TC-3 | unexplainedVariance equals zero in the unified report | AC-1 | `jq .unexplainedVariance watermark-report.json` |
| TC-4 | run-etl exits non-zero when the fence is disengaged | AC-2 | `holo cutover:run-etl; echo $?` |
| TC-5 | watermark-report.json exists and exportArchiveHash is 64-hex | AC-3 | `test -f watermark-report.json; jq -r .exportArchiveHash` |
| TC-6 | a re-run against the same archive reports resumed equal to true | AC-4 | `jq .resumed watermark-report.json` |

## Reading List

- `services/platform/src/etl/run.ts` — lines 1-93 — EtlRunOptions/EtlRunResult, LOAD_ORDER, ensureCatalogCoverage
- `services/platform/src/etl/reconcile.ts` — lines 1-60 — EtlReconcileReport shape
- `services/platform/src/etl/latest-run.ts` — lines 1-59 — loadLatestRunContext() for the AC-4 idempotency case
- `services/platform/src/cli/holo.ts` — lines 1105-1200 — existing etl:run/etl:reconcile/etl:fk-audit case bodies to sequence
- `.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md` — lines 11-20 — CAP-MIG-01 full hop chain

## Guardrails

**WRITE-ALLOWED**

- `services/platform/src/cutover/export-watermark.ts` — NEW
- `services/platform/src/cutover/run-convex-export.ts` — NEW
- `services/platform/src/cutover/etl-orchestrate.ts` — NEW
- `services/platform/src/cli/holo.ts` — MODIFY — add cutover:run-etl case
- `services/platform/tests/integration/sprint29-cutover-etl.test.ts` — NEW

**WRITE-PROHIBITED**

- `services/platform/src/etl/{run,transform,reconcile,fk-audit,metadata,archive,vectors,deterministic-uuidv7,latest-run}.ts` — Sprint 14 ETL internals are already built and tested
- `convex/**` — fence/drain engagement is D06-03's scope
- `services/platform/src/http/hono-app.ts` — soak-fence wiring is D06-05's scope

## Design / Code Pattern

**Pattern.** Orchestration script sequencing existing Sprint 14 ETL primitives behind one fail-closed precondition check

**Pattern source.** `services/platform/src/etl/latest-run.ts`

**Anti-pattern.** Re-implementing ETL logic inside the orchestrator; treating watermark capture or the non-empty-export check as optional

**References**

- services/platform/src/etl/run.ts
- services/platform/src/etl/latest-run.ts

## Verification Gates

- `pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/export-watermark.ts services/platform/src/cutover/run-convex-export.ts services/platform/src/cutover/etl-orchestrate.ts services/platform/src/cli/holo.ts` → exit 0
- `pnpm tsgo --noEmit` → exit 0
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-cutover-etl.test.ts` → exit 0
- `pnpm test:lanes` → exit 0
- `bun services/platform/src/cli/holo.ts cutover:run-etl --json` → unexplainedVariance == 0

## Capability Chain

- **Provides:** holo cutover:run-etl unified operator command; export watermark artifact
- **Consumes:** D06-03 HOLO_MIGRATION_READ_ONLY fence + quiet-check; services/platform/src/etl/{run,transform,reconcile,fk-audit,metadata,archive,vectors,latest-run}.ts; holo etl:run/etl:reconcile/etl:fk-audit/etl:vectors CLI cases
- **Boundary contracts:** CAP-MIG-01 hop: watermark → convex export → stage → FK-ordered load → reconciliation; CAP-MIG-01: 'expected target formulas have zero unexplained variance'

## Agent Assignment

`devops-engineer` — Orchestrates already-built Sprint 14 ETL primitives into one fail-closed operator command and adds the missing convex export invocation + watermark capture — deployment orchestration, not new transform/load logic.

## Dependencies

- **Depends on:** D06-03
- **Blocks:** D06-05

## Coding Standards

- RULES.md
- biome.json

## Notes

Expanded by `devops-engineer` from handoff `s29-devops.json`. Fakeability audit: `validate_scenario.py` reports **0 CRITICAL** across every behavioral AC (task-level `fixtures` resolve each `start_ref`).

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
 "version": "1",
 "task_id": "D06-04",
 "tdd_mode": "skipped",
 "verification_policy": {
  "requires_tests": false,
  "requires_red_evidence": false,
  "requires_seeded_evidence": true
 },
 "fixtures": {
  "fence_engaged_quiet_confirmed": {
   "description": "D06-03's fence is engaged, quiet-check shows zero accepted writes, and the Convex deployment holds real non-empty data.",
   "seed_method": "cli",
   "records": [
    "npx convex env get HOLO_MIGRATION_READ_ONLY returns '1'",
    "holo cutover:quiet-check --window-seconds 30 --json reports acceptedWriteCount:0",
    "the Convex dev deployment contains at least 10 real documents and 5 real conversations prior to export"
   ]
  },
  "fence_disengaged": {
   "description": "HOLO_MIGRATION_READ_ONLY unset or '0' \u2014 the negative-control precondition.",
   "seed_method": "public_api",
   "records": [
    "npx convex env get HOLO_MIGRATION_READ_ONLY returns '' or '0'"
   ]
  }
 },
 "requirements": [
  {
   "id": "AC-1",
   "type": "acceptance_criterion",
   "primary": true,
   "flow_ref": "T-SYNC-009",
   "description": "GIVEN fence engaged and quiet WHEN cutover:run-etl runs THEN watermark captured, real non-empty convex export run, existing ETL pipeline sequenced, unexplainedVariance==0",
   "verify": "holo cutover:run-etl --json; jq .watermarkAt; jq .unexplainedVariance == 0; jq .loadedByTable.documents > 0",
   "maps_to_ac": null,
   "test_tier": "integration",
   "scenario": {
    "tier": "visible",
    "test_tier": "integration",
    "verification_service": "postgres",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "watermark is captured after the export runs instead of before",
      "the report claims unexplainedVariance==0 without invoking etl:reconcile against a real, non-empty archive",
      "loaded counts are all zero (an empty-export false pass)"
     ]
    },
    "evidence": {
     "artifact_type": "file_artifact",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "fence_engaged_quiet_confirmed",
      "action": {
       "actor": "operator",
       "steps": [
        "run holo cutover:run-etl --json",
        "inspect the unified report"
       ]
      },
      "end_state": {
       "must_observe": [
        "watermarkAt matches an ISO-8601 timestamp pattern",
        "archive.exportData.documents.length is greater than 0 (e.g. 10)",
        "unexplainedVariance equals the literal 0",
        "loadedByTable.documents is greater than 0 (e.g. 10)",
        "loadedByTable.conversations is greater than 0 (e.g. 5)"
       ],
       "must_not_observe": [
        "archive.exportData.documents.length equals 0 (empty export)",
        "unexplainedVariance greater than 0",
        "loadedByTable.documents equals 0"
       ]
      }
     }
    ]
   }
  },
  {
   "id": "AC-2",
   "type": "acceptance_criterion",
   "primary": false,
   "flow_ref": "T-SYNC-009",
   "description": "GIVEN fence disengaged WHEN cutover:run-etl runs THEN it fail-closes before touching export or Postgres",
   "verify": "holo cutover:run-etl; expect non-zero exit; error.code==FENCE_NOT_ENGAGED; no export dir",
   "maps_to_ac": null,
   "test_tier": "integration",
   "scenario": {
    "tier": "visible",
    "test_tier": "integration",
    "verification_service": "convex",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "the orchestrator proceeds to spawn convex export despite the fence being disengaged (a stub precondition check)"
     ]
    },
    "evidence": {
     "artifact_type": "stdout",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "fence_disengaged",
      "action": {
       "actor": "operator",
       "steps": [
        "run holo cutover:run-etl",
        "check exit code and error payload",
        "check for an export directory"
       ]
      },
      "end_state": {
       "must_observe": [
        "exit code is nonzero (e.g. 1)",
        "error.code equals the literal string 'FENCE_NOT_ENGAGED'",
        "0 export directories exist at the `--export` path"
       ],
       "must_not_observe": [
        "exit code equals 0",
        "an export directory exists (nonempty)"
       ]
      }
     }
    ]
   }
  },
  {
   "id": "AC-3",
   "type": "acceptance_criterion",
   "primary": false,
   "flow_ref": "T-SYNC-009",
   "description": "GIVEN a completed run WHEN inspected THEN watermark-report.json persists concrete traceable fields",
   "verify": "test -f watermark-report.json; jq '.watermarkAt,.exportArchiveHash,.lastWriteAuditCount,.runId'",
   "maps_to_ac": null,
   "test_tier": "integration",
   "scenario": {
    "tier": "visible",
    "test_tier": "integration",
    "verification_service": "postgres",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "any of the 4 fields is null or empty (a stub/mock report writer)"
     ]
    },
    "evidence": {
     "artifact_type": "file_artifact",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "fence_engaged_quiet_confirmed",
      "action": {
       "actor": "operator",
       "steps": [
        "run holo cutover:run-etl --json",
        "inspect watermark-report.json"
       ]
      },
      "end_state": {
       "must_observe": [
        "watermark-report.json exists with byteLength > 0",
        "exportArchiveHash matches `^[0-9a-f]{64}$`",
        "lastWriteAuditCount equals the literal 0",
        "runId matches `^[0-9a-f-]{36}$`"
       ],
       "must_not_observe": [
        "file is missing",
        "exportArchiveHash is an empty string",
        "lastWriteAuditCount is greater than 0"
       ]
      }
     }
    ]
   }
  },
  {
   "id": "AC-4",
   "type": "acceptance_criterion",
   "primary": false,
   "flow_ref": "T-SYNC-009",
   "description": "GIVEN a completed run WHEN re-run against the same archive THEN it resumes without duplicating rows",
   "verify": "holo cutover:run-etl --json (2nd time); jq .resumed == true; compare table counts pre/post",
   "maps_to_ac": null,
   "test_tier": "integration",
   "scenario": {
    "tier": "visible",
    "test_tier": "integration",
    "verification_service": "postgres",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "a re-run duplicates rows (table counts double, a stub idempotency check)",
      "resumed is reported true without checking latest-run.ts (a mocked resume flag)"
     ]
    },
    "evidence": {
     "artifact_type": "db_query",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "fence_engaged_quiet_confirmed",
      "action": {
       "actor": "operator",
       "steps": [
        "run holo cutover:run-etl --json once",
        "capture Postgres table counts",
        "run holo cutover:run-etl --json a second time",
        "capture Postgres table counts again"
       ]
      },
      "end_state": {
       "must_observe": [
        "resumed == true",
        "documents table count identical across the two captures (e.g. 10 == 10)"
       ],
       "must_not_observe": [
        "resumed == false on the identical-archive re-run",
        "documents table count delta between the two captures is greater than 0 (delta must equal 0)"
       ]
      }
     }
    ]
   }
  },
  {
   "id": "TC-1",
   "type": "test_criterion",
   "description": "watermarkAt is captured before the export subprocess starts",
   "maps_to_ac": "AC-1",
   "verify": "assert watermark timestamp precedes export process start time"
  },
  {
   "id": "TC-2",
   "type": "test_criterion",
   "description": "the export contains a nonzero real source count",
   "maps_to_ac": "AC-1",
   "verify": "jq '.archive.exportData.documents | length'"
  },
  {
   "id": "TC-3",
   "type": "test_criterion",
   "description": "unexplainedVariance is zero",
   "maps_to_ac": "AC-1",
   "verify": "jq .unexplainedVariance == 0"
  },
  {
   "id": "TC-4",
   "type": "test_criterion",
   "description": "run-etl exits non-zero when fence disengaged",
   "maps_to_ac": "AC-2",
   "verify": "holo cutover:run-etl; echo $?"
  },
  {
   "id": "TC-5",
   "type": "test_criterion",
   "description": "watermark-report.json exists with a 64-hex archive hash",
   "maps_to_ac": "AC-3",
   "verify": "jq -r .exportArchiveHash watermark-report.json"
  },
  {
   "id": "TC-6",
   "type": "test_criterion",
   "description": "a same-archive re-run reports resumed true",
   "maps_to_ac": "AC-4",
   "verify": "jq .resumed watermark-report.json"
  }
 ]
}
-->
