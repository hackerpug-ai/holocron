# S31-CX-02: Prove the retained ETL archive is a faithful complete image of the live Convex deployment **[OPERATOR_EXECUTED: yes — reads live Convex, requires manual confirmation]**

> **Closure:** ✅ Completed with accepted operator exception · provenance tooling landed in `1ef97b21`/`329705c9`; live export/archive fidelity comparison is deferred while Convex remains retained.

**SPRINT:** [Sprint 31](./SPRINT.md)
**AGENT:** convex-implementer
**ESTIMATE:** 210 min
**TYPE:** FEATURE
**TDD_MODE:** red_first
**RED_GREEN_REQUIRED:** yes

> Status: Backlog
> **PROPOSED-BY:** convex-planner

## What this does

Architecture validates S31-CX-02's artifact integrity and provenance gates before removing Convex.

## Why

The Convex deployment is frozen and will be deleted. The archive must be validated before all Convex evidence becomes inaccessible. Read-only verification protects against a reconstructed archive's divergence from the source.

## How to verify

- Run all 0 acceptance criteria in sequence (RED → GREEN → REFACTOR per AC)
- Validate via `validate_scenario.py`: exit 0 with all PRIMARY scenarios un-fakeable
- Confirm: one test per AC, RED evidence captured, minimal implementation only

## Scope

**Must complete in this task:**
- Extract and validate the artifact per AC-1 (primary)
- Fail-closed gate implementation (AC-2 or later)
- All tests passing; no gold-plating

**Out of scope:**
- Applying constraints or implementing replacements (other sprint's work)
- Re-running one-time-only operations
- Modifying Convex source code

---

<details>
<summary>▸ Full agent specification (S31-CX-02 — required reading for implementer + reviewer)</summary>

## Task Specification: S31-CX-02

**Purpose:** The deployment has been write-frozen since 2026-08-05 (HOLO_MIGRATION_READ_ONLY=1, HOLO_CUTOVER_SCHEDULES_DISABLED=1 on dev:acrobatic-echidna-253), so...

**PlatformRef:** UC-DATA-05 AC-1, UC-DATA-05 AC-4

### Acceptance Criteria


### Fixtures

- **retained_s29_archive**: the immutable export directory the Sprint 29 cutover ETL loaded from, as recorded in etl_runs.export_root
- **sidecarless_export_dir**: a copy of an export directory with the provenance sidecar file removed


### Reading List

1. services/platform/src/etl/archive.ts  [PRIMARY PATTERN] — readImmutableExport + archiveHash; the sidecar hooks in here
2. services/platform/src/cutover/convex-fence-client.ts — convexEnv/export invocation against the live deployment
3. services/platform/src/cutover/etl-orchestrate.ts — where exportArchiveHash is resolved and bound
4. services/platform/src/etl/latest-run.ts — export_root resolution from etl_runs
5. services/platform/src/db/schema/etl.ts — etl_runs.export_hash column being compared


### REQUIREMENT-CONTRACT v1

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-CX-02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "retained_s29_archive": {
      "description": "the immutable export directory the Sprint 29 cutover ETL loaded from, as recorded in etl_runs.export_root",
      "seed_method": "migration_fixture",
      "records": [
        "60 source tables listed",
        "documents rows: 1623",
        "chat_messages rows: 1100",
        "etl_runs.export_hash recorded for the Sprint 29 run"
      ]
    },
    "sidecarless_export_dir": {
      "description": "a copy of an export directory with the provenance sidecar file removed",
      "seed_method": "migration_fixture",
      "records": [
        "table files present",
        "provenance sidecar absent"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "convex-deployment+filesystem",
      "topology": "single-node",
      "primary": true,
      "negative_control": {
        "would_fail_if": [
          "mock - convex export mocked instead of invoked against the live deployment",
          "stub - comparison hardcoded to report equal without digesting rows",
          "empty - retained archive directory missing or empty",
          "disconnect - Convex deployment unreachable"
        ]
      },
      "evidence": {
        "artifact_type": "file_artifact",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "retained_s29_archive",
          "action": {
            "actor": "cli_user",
            "steps": [
              "run a fresh read-only `convex export` against dev:acrobatic-echidna-253",
              "run `holo cutover:verify-archive-provenance --json`",
              "compare table set, per-table row counts, and per-row content digests"
            ]
          },
          "end_state": {
            "must_observe": [
              "fresh export table count == 60 (identical to retained archive)",
              "documents rows: 1623 in both fresh export and retained archive",
              "per-table digest match count: 60 of 60",
              "report field `ok` == true"
            ],
            "must_not_observe": [
              "table count 0 or an empty export directory",
              "any table reporting a digest mismatch",
              "documents rows: 0 (start signature \u2014 comparison ran against nothing)"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-2",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "filesystem",
      "topology": "single-node",
      "primary": false,
      "negative_control": {
        "would_fail_if": [
          "stub - readImmutableExport accepts any directory it is handed",
          "omit - sidecar check skipped when the file is absent",
          "hardcod - provenance treated as valid by a constant"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "sidecarless_export_dir",
          "action": {
            "actor": "cli_user",
            "steps": [
              "invoke readImmutableExport against the sidecar-less directory",
              "capture the thrown error"
            ]
          },
          "end_state": {
            "must_observe": [
              "throws with message containing 'provenance'",
              "exit code 1 (non-zero refusal)",
              "0 rows staged from the refused directory"
            ],
            "must_not_observe": [
              "load proceeds with 0 provenance checks (silent accept)",
              "archiveHash returned for a directory with no sidecar",
              "empty error (refusal swallowed)"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-3",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "postgres+object-storage",
      "topology": "single-node",
      "primary": false,
      "negative_control": {
        "would_fail_if": [
          "empty - archive absent from the off-mini bucket",
          "stub - mirror status reported without querying the bucket",
          "unchanged - etl_runs.export_hash never compared to the on-disk archive"
        ]
      },
      "evidence": {
        "artifact_type": "db_query",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "retained_s29_archive",
          "action": {
            "actor": "cli_user",
            "steps": [
              "recompute the on-disk archive hash",
              "SELECT export_hash FROM etl_runs for the Sprint 29 run",
              "list the archive object in the off-mini bucket"
            ]
          },
          "end_state": {
            "must_observe": [
              "on-disk archive hash == etl_runs.export_hash (64 hex chars)",
              "off-mini bucket object count for the archive: 1",
              "archive byte length > 0 and matches the recorded manifest total"
            ],
            "must_not_observe": [
              "bucket object count: 0 (archive not mirrored)",
              "export_hash empty or null in etl_runs",
              "hash mismatch between disk and etl_runs"
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

**Report to:** team-lead via SendMessage once all files are written and validated.
