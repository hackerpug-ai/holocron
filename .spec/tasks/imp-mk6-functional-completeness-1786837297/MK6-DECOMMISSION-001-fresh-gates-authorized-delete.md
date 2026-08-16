# MK6-DECOMMISSION-001: Gate fresh recovery, two-device drill, and authorized deletion

> Status: Backlog
> Assignee: devops-engineer
> Reviewer: integration-validator
> Priority: P0
> Type: manual verification
> Wave: 19
> Proposed by: mastra-planner
> Files: scripts/run-mk6-authorized-decommission.sh, services/platform/tests/integration/mk6-authorized-decommission-live.test.ts, .gate-evidence/mk6-decommission
> Depends on: MK6-SOAK-001

## Outcome

Fresh D08-03 and two-device D08-09 bind the soaked release; only a named timestamped operator authorization for the exact Convex deployment permits deletion, followed by Convex-unreachable and non-empty Holocron health proof.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/run-mk6-authorized-decommission.sh --preflight-d08-03 --release "$MK6_PROMOTED_RELEASE" --json` — `MANUAL-ONLY DECOM-M1`: fresh D08-03 uses the soaked release and real restore tuple, passes retained-byte deletion/mutation controls, and proves DB/blob plus HTTP/MCP/Zero/native behavior.
- [ ] AC-2: `PLATFORM_IT=1 bash scripts/run-mk6-authorized-decommission.sh --preflight-d08-09 --release "$MK6_PROMOTED_RELEASE" --json` — `MANUAL-ONLY DECOM-M2`: fresh D08-09 uses two real authorized devices and the same soaked SHA/digest/generation/host, with four healthy services, Postgres-down 503/recovery 200, 44 MCP tools, persistent PG/blob sentinels, no Funnel, and capture hashes.
- [ ] AC-3: `PLATFORM_IT=1 bash scripts/run-mk6-authorized-decommission.sh --execute --authorization "$MK6_DECOMMISSION_AUTHORIZATION" --post-delete-smoke --json` — `MANUAL-ONLY DECOM-M3`: `scripts/run-mk6-authorized-decommission.sh` fails closed without an allowlisted receipt containing named operator, authorization timestamp/expiry, provider account/org/environment/deployment fingerprints, candidate identity, and exact action; with valid authority it deletes only that deployment, proves Convex unreachable, and proves non-empty Postgres/Zero/MCP/native health.
- [ ] AC-4: `PLATFORM_IT=1 MK6_DECOMMISSION_NEGATIVE=authorization-matrix bash scripts/run-mk6-authorized-decommission.sh --execute --authorization "$MK6_DECOMMISSION_AUTHORIZATION" --json` enumerates expired, wrong account, wrong org, wrong environment, wrong candidate, wrong action, missing required fields, and wrong deployment receipts; all eight perform zero provider actions.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Fresh D08-03 binds restore and application behavior to the soaked release. | AC-1 | `PLATFORM_IT=1 bash scripts/run-mk6-authorized-decommission.sh --preflight-d08-03 --release "$MK6_PROMOTED_RELEASE" --json` |
| TC-2 | Fresh two-device D08-09 binds complete captures to the soaked release. | AC-2 | `PLATFORM_IT=1 bash scripts/run-mk6-authorized-decommission.sh --preflight-d08-09 --release "$MK6_PROMOTED_RELEASE" --json` |
| TC-3 | Missing authorization performs zero provider actions. | AC-4 | `PLATFORM_IT=1 MK6_DECOMMISSION_NEGATIVE=missing-authorization bash scripts/run-mk6-authorized-decommission.sh --execute --json` |
| TC-4 | Wrong deployment fingerprint performs zero provider actions. | AC-4 | `PLATFORM_IT=1 MK6_DECOMMISSION_NEGATIVE=wrong-deployment bash scripts/run-mk6-authorized-decommission.sh --execute --authorization "$MK6_DECOMMISSION_AUTHORIZATION" --json` |
| TC-5 | Valid authorization deletes the exact deployment and post-delete smoke proves four healthy non-empty Holocron surfaces. | AC-3 | `PLATFORM_IT=1 bash scripts/run-mk6-authorized-decommission.sh --execute --authorization "$MK6_DECOMMISSION_AUTHORIZATION" --post-delete-smoke --json` |
| TC-6 | All eight authorization variants fail closed with zero provider actions. | AC-4 | `PLATFORM_IT=1 MK6_DECOMMISSION_NEGATIVE=authorization-matrix bash scripts/run-mk6-authorized-decommission.sh --execute --authorization "$MK6_DECOMMISSION_AUTHORIZATION" --json` |

Historical PRD evidence is read-only input and never proof. Receipt schema stores only redacted fingerprints, names, timestamps, exact candidate/action, receipt digests, and outcome codes—never provider tokens or raw account identifiers. Without valid authority, zero provider API calls occur and the closed gate is the correct result.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "MK6-DECOMMISSION-001",
  "tdd_mode": "shared",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fresh_d08_03": {
      "seed_method": "recorded_external",
      "description": "new restore and application smoke for the soaked release",
      "records": [
        "expectedD0803PassCount: 1"
      ]
    },
    "fresh_d08_09": {
      "seed_method": "recorded_external",
      "description": "two real devices and complete current drill captures",
      "records": [
        "authorizedDeviceCount: 2",
        "mcpToolCount: 44"
      ]
    },
    "delete_authority": {
      "seed_method": "recorded_external",
      "description": "allowlisted named authorization for one exact deployment fingerprint",
      "records": [
        "expectedProviderActionCount: 1"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the soaked release WHEN fresh D08-03 runs THEN retained restore and four application surfaces pass deletion and mutation controls",
      "verify": "PLATFORM_IT=1 bash scripts/run-mk6-authorized-decommission.sh --preflight-d08-03 --release \"$MK6_PROMOTED_RELEASE\" --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "decom-d08-03",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "r2-postgres-http-mcp-zero-ios",
        "negative_control": {
          "would_fail_if": [
            "one retained receipt is deleted or application smoke is removed"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh_d08_03",
            "action": {
              "steps": [
                "run fresh restore, application smoke, deletion and byte-mutation controls"
              ]
            },
            "end_state": {
              "must_observe": [
                "d0803PassCount: 1",
                "applicationSurfacePassCount: 4"
              ],
              "must_not_observe": [
                "d0803PassCount: 0",
                "empty restore receipt"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN two real devices WHEN fresh D08-09 runs THEN complete captures bind the same soaked release",
      "verify": "PLATFORM_IT=1 bash scripts/run-mk6-authorized-decommission.sh --preflight-d08-09 --release \"$MK6_PROMOTED_RELEASE\" --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "decom-d08-09",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "two-device-tailnet-drill",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "the second real device is removed or capture hashes are absent"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh_d08_09",
            "action": {
              "steps": [
                "drive device A and a second real device B through the complete D08-09 drill"
              ]
            },
            "end_state": {
              "must_observe": [
                "authorizedDevicePassCount: 2",
                "mcpToolCount: 44",
                "healthyServiceCount: 4"
              ],
              "must_not_observe": [
                "authorizedDevicePassCount: 0",
                "empty capture hash"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN exact named authority WHEN delete executes THEN only the fingerprinted deployment is deleted and four Holocron surfaces remain healthy",
      "verify": "PLATFORM_IT=1 bash scripts/run-mk6-authorized-decommission.sh --execute --authorization \"$MK6_DECOMMISSION_AUTHORIZATION\" --post-delete-smoke --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "decom-authorized-delete",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "convex-provider-holocron-smoke",
        "negative_control": {
          "would_fail_if": [
            "authorization is absent, wrong deployment is targeted, or post-delete smoke is removed"
          ]
        },
        "evidence": {
          "artifact_type": "event_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "delete_authority",
            "action": {
              "steps": [
                "validate authority, delete exact deployment, prove Convex unreachable and query four Holocron surfaces"
              ]
            },
            "end_state": {
              "must_observe": [
                "providerActionCount: 1",
                "convexUnreachableCount: 1",
                "healthyNonEmptyHolocronSurfaceCount: 4"
              ],
              "must_not_observe": [
                "providerActionCount: 0",
                "empty deployment fingerprint"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "Eight invalid authorization variants perform zero provider actions",
      "verify": "PLATFORM_IT=1 MK6_DECOMMISSION_NEGATIVE=authorization-matrix bash scripts/run-mk6-authorized-decommission.sh --execute --authorization \"$MK6_DECOMMISSION_AUTHORIZATION\" --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "decom-authorization-matrix",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "decommission-authorization-preflight",
        "negative_control": {
          "would_fail_if": [
            "authorization is absent, expired, or mismatched but provider invocation is not blocked"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "delete_authority",
            "action": {
              "steps": [
                "enumerate expired, wrong account, wrong org, wrong environment, wrong candidate, wrong action, missing-field, and wrong-deployment receipts"
              ]
            },
            "end_state": {
              "must_observe": [
                "enumeratedVariantCount: 8",
                "namedFailureCount: 8",
                "providerActionCount: 0"
              ],
              "must_not_observe": [
                "providerActionCount > 0",
                "empty failure class"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Fresh D08-03 passes",
      "verify": "PLATFORM_IT=1 bash scripts/run-mk6-authorized-decommission.sh --preflight-d08-03 --release \"$MK6_PROMOTED_RELEASE\" --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Fresh D08-09 passes two devices",
      "verify": "PLATFORM_IT=1 bash scripts/run-mk6-authorized-decommission.sh --preflight-d08-09 --release \"$MK6_PROMOTED_RELEASE\" --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Missing authorization performs zero actions",
      "verify": "PLATFORM_IT=1 MK6_DECOMMISSION_NEGATIVE=missing-authorization bash scripts/run-mk6-authorized-decommission.sh --execute --json",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Wrong deployment performs zero actions",
      "verify": "PLATFORM_IT=1 MK6_DECOMMISSION_NEGATIVE=wrong-deployment bash scripts/run-mk6-authorized-decommission.sh --execute --authorization \"$MK6_DECOMMISSION_AUTHORIZATION\" --json",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Authorized delete leaves four healthy surfaces",
      "verify": "PLATFORM_IT=1 bash scripts/run-mk6-authorized-decommission.sh --execute --authorization \"$MK6_DECOMMISSION_AUTHORIZATION\" --post-delete-smoke --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Eight invalid authorization variants fail closed",
      "verify": "PLATFORM_IT=1 MK6_DECOMMISSION_NEGATIVE=authorization-matrix bash scripts/run-mk6-authorized-decommission.sh --execute --authorization \"$MK6_DECOMMISSION_AUTHORIZATION\" --json",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
