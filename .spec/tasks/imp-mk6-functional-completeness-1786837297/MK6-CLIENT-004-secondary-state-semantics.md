# MK6-CLIENT-004: Make secondary Zero and error states truthful

> Status: Backlog
> Assignee: react-native-ui-implementer
> Reviewer: react-native-ui-reviewer
> Priority: P1
> Type: bugfix
> Wave: 10
> Proposed by: mastra-planner
> Files: hooks/use-zero-query-state.ts, hooks/use-whats-new-feed.ts, hooks/use-file-object-by-content-hash.ts, components/deep-research/DeepResearchDetailView.tsx, app/(drawer)/research/[sessionId].tsx, components/articles/ArticleImportModal.tsx, components/improvements/ImprovementSubmitSheet.tsx, tests/integration/client-zero-state-semantics.test.ts, .maestro/reactive/client-zero-state-semantics.yml, .maestro/reactive/run-client-zero-state-semantics.sh, .gate-evidence/mk6-client-state
> Depends on: MK6-CLIENT-002

## Outcome

Fresh empty, stale cache, terminal sync error, blob completion, import failure, and research rejection are visibly distinct and correlate to direct service/store truth.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case state-and-whats-new-matrix --json` proves fresh empty, stale cache with two rows, and service-scoped Zero-down terminal error are distinct; persisted-empty What's New remains empty, refresh failure is visible/retryable, `seed-feed-items` pseudo-reports remain zero, and no fabricated `Date.now()` timestamp appears.
- [ ] AC-2: `PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case blob-readback-matrix --json` labels a blob synced only after its matching real `file_objects` row/SHA; a missing row remains pending and a mismatched row becomes a named visible error.
- [ ] AC-3: `PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case import-research-rejection --json` — Real article-import failure and research-mission rejection are visible, carry server codes, persist no false success, and Retry succeeds after the task-owned dependency is restored.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Fresh empty renders empty, not loading/error. | AC-1 | `PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case fresh-empty --json` |
| TC-2 | Stale cache renders two rows and stale marker. | AC-1 | `PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case stale-cache --json` |
| TC-3 | Zero-down renders terminal error, not empty. | AC-1 | `PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case zero-down --json` |
| TC-4 | Blob sync waits for matching real `file_objects` row. | AC-2 | `PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case blob-readback-matrix --json` |
| TC-5 | Import and research rejection are visible and recover through Retry. | AC-3 | `PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case import-research-rejection --json` |
| TC-6 | Persisted-empty What's New and refresh failure are truthful with no pseudo-report or fabricated timestamp. | AC-1 | `PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case whats-new-matrix --json` |
| TC-7 | Missing `file_objects` row remains visibly pending. | AC-2 | `PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case file-object-missing --json` |
| TC-8 | Mismatched `file_objects` SHA becomes a named visible error. | AC-2 | `PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case file-object-mismatch --json` |

Every scenario retains one task-owned correlated receipt keyed by a single operation ID with `uiScreenshotRef`, `externalServerEventRef`, `zeroObservationRef`, and `directPostgresReadRef`; a screenshot alone cannot pass.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "MK6-CLIENT-004",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "state_matrix": {
      "seed_method": "public_api",
      "description": "fresh-empty, two-row stale cache and isolated Zero-down cases",
      "records": [
        "stateCaseCount: 3"
      ]
    },
    "blob_row": {
      "seed_method": "public_api",
      "description": "uploaded blob and matching file_objects row",
      "records": [
        "blobCount: 1"
      ]
    },
    "visible_failures": {
      "seed_method": "ui_flow",
      "description": "real import failure and mission rejection with restored dependency",
      "records": [
        "failureCaseCount: 2"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN three data states WHEN screens load THEN fresh empty, stale two-row cache and Zero error are visibly distinct",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case state-and-whats-new-matrix --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "client-state-matrix",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "ios-zero-postgres",
        "negative_control": {
          "would_fail_if": [
            "Zero error is replaced by empty or stale marker is removed"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "state_matrix",
            "action": {
              "steps": [
                "open each state case and the persisted-empty and refresh-failure Whats New cases through the native UI"
              ]
            },
            "end_state": {
              "must_observe": [
                "operationIdCount: 1",
                "uiScreenshotRefCount: 1",
                "externalServerEventRefCount: 1",
                "zeroObservationRefCount: 1",
                "directPostgresReadRefCount: 1",
                "distinctVisibleStateCount: 3",
                "staleRowCount: 2",
                "whatsNewMatrixPassCount: 2",
                "seedFeedPseudoReportCount: 0",
                "fabricatedTimestampCount: 0",
                "refreshRetrySuccessCount: 1"
              ],
              "must_not_observe": [
                "distinctVisibleStateCount: 0",
                "empty error message"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN one blob WHEN file_objects readback arrives THEN only matching SHA becomes synced",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case blob-readback-matrix --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "client-blob-readback",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "ios-zero-postgres-blob",
        "negative_control": {
          "would_fail_if": [
            "synced status is hardcoded or file_objects readback is removed"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "blob_row",
            "action": {
              "steps": [
                "drive matching, missing, and mismatched file_objects rows for one real blob"
              ]
            },
            "end_state": {
              "must_observe": [
                "operationIdCount: 1",
                "uiScreenshotRefCount: 1",
                "externalServerEventRefCount: 1",
                "zeroObservationRefCount: 1",
                "directPostgresReadRefCount: 1",
                "syncedBlobCount: 1",
                "matchingFileObjectCount: 1",
                "missingFileObjectPendingCount: 1",
                "mismatchedFileObjectErrorCount: 1"
              ],
              "must_not_observe": [
                "syncedBlobCount: 0",
                "empty content hash"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN real import and research failures WHEN Retry follows restore THEN both errors are visible and both retries succeed",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case import-research-rejection --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "client-visible-failures",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "ios-hono-mission",
        "negative_control": {
          "would_fail_if": [
            "errors are console-only or Retry is a no-op"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "visible_failures",
            "action": {
              "steps": [
                "trigger import failure and research rejection, restore dependencies, press Retry"
              ]
            },
            "end_state": {
              "must_observe": [
                "operationIdCount: 1",
                "uiScreenshotRefCount: 1",
                "externalServerEventRefCount: 1",
                "zeroObservationRefCount: 1",
                "directPostgresReadRefCount: 1",
                "visibleFailureCount: 2",
                "successfulRetryCount: 2"
              ],
              "must_not_observe": [
                "visibleFailureCount: 0",
                "empty server code"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Fresh empty is distinct",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case fresh-empty --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Stale cache is distinct",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case stale-cache --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Zero error is distinct",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case zero-down --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Blob waits for row readback",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case blob-readback-matrix --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Import and research failures recover",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case import-research-rejection --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Whats New matrix is truthful",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case whats-new-matrix --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Missing file object remains pending",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case file-object-missing --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "Mismatched file object errors",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-client-zero-state-semantics.sh --case file-object-mismatch --json",
      "maps_to_ac": "AC-2"
    }
  ]
}
-->
