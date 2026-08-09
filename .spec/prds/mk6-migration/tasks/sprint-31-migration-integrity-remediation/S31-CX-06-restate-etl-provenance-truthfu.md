# S31-CX-06: Restate ETL provenance truthfully — Sprint 29, not Sprint 14, proved full-corpus load

**SPRINT:** [Sprint 31](./SPRINT.md)
**AGENT:** convex-reviewer
**ESTIMATE:** 90 min
**TYPE:** FEATURE
**TDD_MODE:** red_first
**RED_GREEN_REQUIRED:** yes

> Status: Backlog
> **PROPOSED-BY:** convex-planner

## What this does

Restate Sprint 14 gate records truthfully; re-point primary evidence to Sprint 29.

## Why

Sprint 14's gate record misattributes a fixture-only run as a full-corpus load. Restatement restores auditability; structural verification prevents recurrence at the moment history becomes unre-derivable.

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
<summary>▸ Full agent specification (S31-CX-06 — required reading for implementer + reviewer)</summary>

## Task Specification: S31-CX-06

**Purpose:** Sprint 14's gate passed on an export of 104 rows across 4 tables, while Sprint 29's real cutover ETL loaded 13,801 rows. The correct remediation is NO...

**PlatformRef:** UC-DATA-05 AC-1, UC-SYNC-03 AC-2

### Acceptance Criteria


### Fixtures

- **sprint14_gate_record**: the Sprint 14 gate records claiming a full-corpus ETL, with primary artifacts absent
- **sprint29_gate_record**: the Sprint 29 cutover gate records with surviving committed evidence


### Reading List

1. services/platform/src/etl/run.ts  [PRIMARY PATTERN] — the stageRowCount/idMapCount/fileObjectCount fields whose claimed values are being verified
2. .spec/prds/mk6-migration/tasks/sprint-14-big-bang-etl-and-content-addressed-file-storage/gate-results.json — the record being restated
3. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/20260805T185338Z/ — the surviving genuine evidence
4. services/platform/src/etl/archive.ts — archiveHash, to check claimed hashes against surviving artifacts
5. services/platform/src/db/schema/etl.ts — etl_runs, the durable record of what actually loaded


### REQUIREMENT-CONTRACT v1

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-CX-06",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "sprint14_gate_record": {
      "description": "the Sprint 14 gate records claiming a full-corpus ETL, with primary artifacts absent",
      "seed_method": "migration_fixture",
      "records": [
        "gate-results.json claims stageRowCount=104",
        "convex-prod-export.zip absent from the repo",
        "three differing archive hashes across gate-plan/gate-results/gate-verification"
      ]
    },
    "sprint29_gate_record": {
      "description": "the Sprint 29 cutover gate records with surviving committed evidence",
      "seed_method": "migration_fixture",
      "records": [
        "13801 rows loaded",
        "documents rows: 1623",
        "parityHash 0a12d2059b recorded",
        "reconcile report committed under .gate-evidence/"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "filesystem",
      "topology": "single-node",
      "primary": true,
      "negative_control": {
        "would_fail_if": [
          "unchanged - Sprint 14 record still claims a full-corpus export",
          "deleted - Sprint 14 record removed rather than restated",
          "stub - restatement text written with no reference to the actual 104-row counts"
        ]
      },
      "evidence": {
        "artifact_type": "file_artifact",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "sprint14_gate_record",
          "action": {
            "actor": "cli_user",
            "steps": [
              "rewrite sprint-14 gate-results.json and GATE-RESULTS.md to state what was actually proven",
              "record the 104-row fixture scope explicitly"
            ]
          },
          "end_state": {
            "must_observe": [
              "restated record states stageRowCount 104 as a fixture-scope run",
              "record contains the phrase 'mechanism' scoping (not full-corpus)",
              "Sprint 14 files still present: 3 (restated, not deleted)"
            ],
            "must_not_observe": [
              "Sprint 14 gate files deleted (file count 0)",
              "record still claiming a production-corpus export",
              "an empty or placeholder restatement body"
            ]
          }
        },
        {
          "start_ref": "sprint29_gate_record",
          "action": {
            "actor": "cli_user",
            "steps": [
              "re-point UC-DATA-05 AC-1 primary evidence to the Sprint 29 artifacts",
              "verify each cited artifact resolves on disk"
            ]
          },
          "end_state": {
            "must_observe": [
              "UC-DATA-05 AC-1 evidence path resolves to a Sprint 29 artifact that exists",
              "cited row count: 13801 matches the surviving reconcile report",
              "parityHash 0a12d2059b present in the cited artifact"
            ],
            "must_not_observe": [
              "evidence pointing at 0 surviving artifacts (dangling citation)",
              "cited artifact absent from the repo",
              "an empty evidence path or a placeholder reference"
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
      "primary": true,
      "negative_control": {
        "would_fail_if": [
          "stub - verifier returns pass without opening the cited artifacts",
          "hardcod - claim list fixed at compile time",
          "empty - verifier checks 0 gate records"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "sprint14_gate_record",
          "action": {
            "actor": "cli_user",
            "steps": [
              "run `holo verify:etl-provenance --json` against a gate record citing an absent artifact"
            ]
          },
          "end_state": {
            "must_observe": [
              "exit code 1 (non-zero refusal)",
              "report names the missing artifact path",
              "gate records inspected: >= 1 with the claimed counts read from disk"
            ],
            "must_not_observe": [
              "exit code 0 for a claim with 0 surviving artifacts",
              "verifier reporting a default pass",
              "an empty violation list while the artifact is absent"
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
