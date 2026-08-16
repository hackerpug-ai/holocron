# MK6-DATA-002: Attest one non-empty Postgres sentinel across every surface

> Status: Backlog
> Assignee: mastra-implementer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: verification
> Wave: 12
> Proposed by: mastra-planner
> Files: services/platform/src/cutover/cross-surface-attestation.ts, services/platform/tests/integration/mk6-cross-surface-data-plane-live.test.ts, scripts/verify-mk6-cross-surface-data-plane.sh, .gate-evidence/mk6-data-plane
> Depends on: MK6-HOST-001, MK6-FLEET-001, MK6-QUEUE-001, MK6-BACKUP-001, MK6-RUNTIME-001, MK6-MCP-002, MK6-CLIENT-003

## Outcome

Direct Postgres, external HTTP, authenticated MCP get/list, and a real Zero client return the same non-empty sentinel ID and content hash from the exact candidate; the retired plane returns one exact 410 error everywhere.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-cross-surface-data-plane.sh --candidate "$MK6_CANDIDATE_ID" --external-health --json` requires external `:44111/health` to report `data_plane=postgres` and the expected target database identity, then proves one identical non-empty ID/hash through direct Postgres, `https://<tailnet>:44111/api/content-probe`, MCP get/list, and Zero.
- [ ] AC-2: `PLATFORM_IT=1 MK6_DATA_ATTEST_NEGATIVE=retired-plane bash scripts/verify-mk6-cross-surface-data-plane.sh --json` — `HOLO_DATA_PLANE=convex`, MCP get/list retired-source calls, and retired HTTP content-plane calls return HTTP 410/error code exactly `retired_cloud_plane_removed_d08_02`; no path translates it to null, empty list, zero count, or ordinary success.
- [ ] AC-3: `PLATFORM_IT=1 MK6_DATA_ATTEST_NEGATIVE=attestation-matrix bash scripts/verify-mk6-cross-surface-data-plane.sh --json` enumerates wrong DB, missing sentinel, stale release, count-equal/content-corrupt, and disconnected surface; all five fail named and leave the candidate unattested.
- [ ] AC-4: `PLATFORM_IT=1 bash scripts/verify-mk6-cross-surface-data-plane.sh --rollback-control --candidate "$MK6_CANDIDATE_ID" --json` proves rollback retains both the cloud export and Postgres candidate bytes, performs zero cloud-deletion actions, keeps retired reads closed, and leaves external health bound to the selected Postgres authority.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | External health identifies the expected Postgres target and five real reads return one identical non-empty sentinel/hash and release identity. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-cross-surface-data-plane.sh --candidate "$MK6_CANDIDATE_ID" --external-health --json` |
| TC-2 | Retired HTTP and MCP get/list return exact 410/error code, never null/empty. | AC-2 | `PLATFORM_IT=1 MK6_DATA_ATTEST_NEGATIVE=retired-plane bash scripts/verify-mk6-cross-surface-data-plane.sh --json` |
| TC-3 | Count-equal/content-corrupt Postgres fails attestation. | AC-3 | `PLATFORM_IT=1 MK6_DATA_ATTEST_NEGATIVE=count-equal-content-corrupt bash scripts/verify-mk6-cross-surface-data-plane.sh --json` |
| TC-4 | A disconnected Zero surface fails attestation. | AC-3 | `PLATFORM_IT=1 MK6_DATA_ATTEST_NEGATIVE=zero-disconnected bash scripts/verify-mk6-cross-surface-data-plane.sh --json` |
| TC-5 | Rollback preserves both retained planes, deletes no cloud data, and reports the selected Postgres authority. | AC-4 | `PLATFORM_IT=1 bash scripts/verify-mk6-cross-surface-data-plane.sh --rollback-control --candidate "$MK6_CANDIDATE_ID" --json` |
| TC-6 | The five-case attestation matrix rejects every named variant. | AC-3 | `PLATFORM_IT=1 MK6_DATA_ATTEST_NEGATIVE=attestation-matrix bash scripts/verify-mk6-cross-surface-data-plane.sh --json` |

This final attestation consumes H0-01 through H0-04 and product surfaces; it does not own or duplicate their implementation files. Historical PRD evidence and seed-only corpora cannot pass.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "MK6-DATA-002",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "candidate_sentinel": {
      "seed_method": "public_api",
      "description": "one exact candidate and known real Postgres sentinel",
      "records": [
        "expectedSurfaceCount: 5",
        "sentinelId: mk6-data-sentinel-1"
      ]
    },
    "retired_plane": {
      "seed_method": "public_api",
      "description": "real candidate queried with retired Convex source",
      "records": [
        "expectedRetiredErrorCount: 3"
      ]
    },
    "corrupt_surface": {
      "seed_method": "cli",
      "description": "isolated real database with one content-corrupt sentinel",
      "records": [
        "expectedFailureCount: 1"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN one candidate sentinel WHEN five real surfaces read it THEN all return one identical non-empty ID and hash",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-cross-surface-data-plane.sh --candidate \"$MK6_CANDIDATE_ID\" --external-health --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "data-five-surfaces",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "postgres-http-mcp-zero",
        "negative_control": {
          "would_fail_if": [
            "one surface is disconnected or sentinel output is hardcoded"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "candidate_sentinel",
            "action": {
              "steps": [
                "require external health data_plane=postgres and expected target database identity, then read the same sentinel from direct Postgres, HTTP, MCP get, MCP list and Zero"
              ]
            },
            "end_state": {
              "must_observe": [
                "matchingSurfaceCount: 5",
                "distinctSentinelHashCount: 1",
                "externalHealthDataPlane: postgres",
                "expectedTargetDatabaseIdentityCount: 1"
              ],
              "must_not_observe": [
                "matchingSurfaceCount: 0",
                "empty sentinel hash"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN retired-plane requests WHEN HTTP and MCP read THEN each returns retired_cloud_plane_removed_d08_02",
      "verify": "PLATFORM_IT=1 MK6_DATA_ATTEST_NEGATIVE=retired-plane bash scripts/verify-mk6-cross-surface-data-plane.sh --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "data-retired-plane",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "http-mcp-retired-plane",
        "negative_control": {
          "would_fail_if": [
            "the 410 is translated to null, empty, zero or ordinary success"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "retired_plane",
            "action": {
              "steps": [
                "query retired HTTP content probe plus MCP get and list"
              ]
            },
            "end_state": {
              "must_observe": [
                "retiredErrorCount: 3",
                "errorCode: retired_cloud_plane_removed_d08_02"
              ],
              "must_not_observe": [
                "retiredErrorCount: 0",
                "empty error code"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN a corrupt or disconnected surface WHEN attestation runs THEN it names the failed surface and does not attest",
      "verify": "PLATFORM_IT=1 MK6_DATA_ATTEST_NEGATIVE=attestation-matrix bash scripts/verify-mk6-cross-surface-data-plane.sh --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "data-corrupt-surface",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "postgres-zero-attestation",
        "negative_control": {
          "would_fail_if": [
            "content corruption or a disconnected Zero surface is ignored"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "corrupt_surface",
            "action": {
              "steps": [
                "enumerate wrong database, missing sentinel, stale release, count-equal content corruption, and disconnected-surface isolated cases"
              ]
            },
            "end_state": {
              "must_observe": [
                "enumeratedVariantCount: 5",
                "namedFailureCount: 5",
                "attestedCandidateCount: 0"
              ],
              "must_not_observe": [
                "namedFailureCount: 0",
                "empty failure surface"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "Rollback retains cloud-export and Postgres-candidate bytes without deletion and selects Postgres truthfully",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-cross-surface-data-plane.sh --rollback-control --candidate \"$MK6_CANDIDATE_ID\" --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "data-attestation-rollback",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "external-health-postgres-retained-export",
        "negative_control": {
          "would_fail_if": [
            "rollback deletes retained bytes, reactivates retired reads, or reports a non-Postgres authority"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "candidate_sentinel",
            "action": {
              "steps": [
                "exercise rollback and independently verify retained cloud-export bytes, Postgres candidate bytes, retired-plane failure, and external health"
              ]
            },
            "end_state": {
              "must_observe": [
                "retainedCloudExportCount: 1",
                "retainedPostgresCandidateCount: 1",
                "cloudDeleteActionCount: 0",
                "retiredPlaneReadSuccessCount: 0",
                "externalHealthDataPlane: postgres"
              ],
              "must_not_observe": [
                "cloudDeleteActionCount > 0",
                "retiredPlaneReadSuccessCount > 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Five surfaces match one sentinel",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-cross-surface-data-plane.sh --candidate \"$MK6_CANDIDATE_ID\" --external-health --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Retired HTTP and MCP paths return exact 410 code",
      "verify": "PLATFORM_IT=1 MK6_DATA_ATTEST_NEGATIVE=retired-plane bash scripts/verify-mk6-cross-surface-data-plane.sh --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Content corruption fails",
      "verify": "PLATFORM_IT=1 MK6_DATA_ATTEST_NEGATIVE=count-equal-content-corrupt bash scripts/verify-mk6-cross-surface-data-plane.sh --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Disconnected Zero fails",
      "verify": "PLATFORM_IT=1 MK6_DATA_ATTEST_NEGATIVE=zero-disconnected bash scripts/verify-mk6-cross-surface-data-plane.sh --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Rollback retains both planes without cloud deletion",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-cross-surface-data-plane.sh --rollback-control --candidate \"$MK6_CANDIDATE_ID\" --json",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Five attestation variants fail named",
      "verify": "PLATFORM_IT=1 MK6_DATA_ATTEST_NEGATIVE=attestation-matrix bash scripts/verify-mk6-cross-surface-data-plane.sh --json",
      "maps_to_ac": "AC-3"
    }
  ]
}
-->
