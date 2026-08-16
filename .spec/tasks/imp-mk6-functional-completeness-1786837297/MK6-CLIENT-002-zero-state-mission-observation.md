# MK6-CLIENT-002: Restore drawer lifecycle and mission observation

> Status: Backlog
> Assignee: react-native-ui-implementer
> Reviewer: react-native-ui-reviewer
> Priority: P0
> Type: bugfix
> Wave: 9
> Proposed by: mastra-planner
> Files: app/(drawer)/_layout.tsx, screens/DrawerContent.tsx, app/(drawer)/missions.tsx, app/zero/queries.ts, app/toolbelt/add.tsx, tests/integration/drawer-mission-observation.test.ts, .maestro/reactive/drawer-mission-observation.yml, .maestro/reactive/run-drawer-mission-observation.sh, .gate-evidence/mk6-client-drawer
> Depends on: MK6-CLIENT-001

## Outcome

The drawer shows real seeded conversations, exposes truthful Zero-down/retry state, and follows one external Toolbelt mission from queued to one durable terminal result.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --case seeded-cold-launch --json` — Cold launch displays exactly two seeded real Postgres conversations after Zero sync; a direct server/Zero/Postgres receipt matches the visible IDs.
- [ ] AC-2: `PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --case zero-down-retry --json` — Service-scoped Zero unavailability with a wiped disposable replica shows one terminal error, not empty; restoring only Zero and pressing the real Retry control recovers the same two IDs.
- [ ] AC-3: `PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --case mission-replay --json` — A real Toolbelt request validates a run envelope and visibly progresses queued/running/terminal; Postgres output and Zero agree, and replay leaves exactly one result.
- [ ] AC-4: `PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --case rename-delete-matrix --json` — A real rename/delete matrix shows pending state, then a declared server mutation failure without a false optimistic title or disappearance; the prior durable row remains, and pressing the real Retry after recovery succeeds for both operations.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Two visible conversations match direct receipts. | AC-1 | `PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --case seeded-cold-launch --json` |
| TC-2 | Zero-down is terminal and Retry recovers two IDs. | AC-2 | `PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --case zero-down-retry --json` |
| TC-3 | One mission progresses to one terminal durable result under replay. | AC-3 | `PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --case mission-replay --json` |
| TC-4 | Rename and delete failures preserve the prior row and both real Retry actions succeed. | AC-4 | `PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --case rename-delete-matrix --json` |

The fault harness may stop only the task-owned isolated Zero process; Internet and host/device networking remain unchanged.

Every scenario retains one task-owned correlated receipt keyed by a single operation ID with `uiScreenshotRef`, `externalServerEventRef`, `zeroObservationRef`, and `directPostgresReadRef`; a screenshot alone cannot pass.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "MK6-CLIENT-002",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded_drawer": {
      "seed_method": "public_api",
      "description": "two real Postgres conversations synced through Zero",
      "records": [
        "expectedConversationCount: 2"
      ]
    },
    "zero_fault": {
      "seed_method": "cli",
      "description": "task-owned isolated Zero process and disposable replica",
      "records": [
        "expectedRecoveredCount: 2"
      ]
    },
    "toolbelt_mission": {
      "seed_method": "ui_flow",
      "description": "real Toolbelt mission request",
      "records": [
        "missionKey: mk6-drawer-mission-1"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN two real conversations WHEN native drawer cold-launches THEN two visible IDs match server, Zero and Postgres",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --case seeded-cold-launch --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "drawer-seeded",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "ios-zero-postgres",
        "negative_control": {
          "would_fail_if": [
            "the drawer is a static empty shell or Zero is disconnected"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_drawer",
            "action": {
              "steps": [
                "cold launch and open the drawer"
              ]
            },
            "end_state": {
              "must_observe": [
                "operationIdCount: 1",
                "uiScreenshotRefCount: 1",
                "externalServerEventRefCount: 1",
                "zeroObservationRefCount: 1",
                "directPostgresReadRefCount: 1",
                "visibleConversationCount: 2",
                "correlatedSurfaceCount: 3"
              ],
              "must_not_observe": [
                "visibleConversationCount: 0",
                "empty conversation IDs"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN isolated Zero is stopped WHEN drawer loads and Retry runs after restore THEN terminal error becomes the same two rows",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --case zero-down-retry --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "drawer-zero-retry",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "ios-isolated-zero",
        "negative_control": {
          "would_fail_if": [
            "the Retry callback is a no-op or Zero error is rendered as empty"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "zero_fault",
            "action": {
              "steps": [
                "stop only isolated Zero, load, restore Zero, and press Retry"
              ]
            },
            "end_state": {
              "must_observe": [
                "operationIdCount: 1",
                "uiScreenshotRefCount: 1",
                "externalServerEventRefCount: 1",
                "zeroObservationRefCount: 1",
                "directPostgresReadRefCount: 1",
                "terminalErrorCount: 1",
                "recoveredConversationCount: 2"
              ],
              "must_not_observe": [
                "recoveredConversationCount: 0",
                "empty error message"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN a Toolbelt mission WHEN events replay THEN UI and durable stores expose one terminal result",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --case mission-replay --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "drawer-mission",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "ios-mission-zero-postgres",
        "negative_control": {
          "would_fail_if": [
            "mission status is hardcoded or replay dedupe is removed"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "toolbelt_mission",
            "action": {
              "steps": [
                "submit mission and replay terminal event"
              ]
            },
            "end_state": {
              "must_observe": [
                "operationIdCount: 1",
                "uiScreenshotRefCount: 1",
                "externalServerEventRefCount: 1",
                "zeroObservationRefCount: 1",
                "directPostgresReadRefCount: 1",
                "terminalMissionCount: 1",
                "visibleResultCount: 1",
                "postgresOutputCount: 1"
              ],
              "must_not_observe": [
                "terminalMissionCount: 0",
                "empty run envelope"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN real rename and delete failures WHEN pending operations reject and Retry follows recovery THEN prior durable state remains until both retries succeed",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --case rename-delete-matrix --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "drawer-rename-delete",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "ios-hono-zero-postgres",
        "negative_control": {
          "would_fail_if": [
            "Retry is a no-op or optimistic rename or deletion persists after failure"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "start_state": {
          "seed_method": "ui_flow",
          "description": "one real durable drawer row driven through rename and delete failures",
          "records": [
            "matrixCaseCount: 2"
          ]
        },
        "cases": [
          {
            "action": {
              "steps": [
                "drive rename and delete pending, declared failure, rollback, dependency recovery and real Retry"
              ]
            },
            "end_state": {
              "must_observe": [
                "operationIdCount: 1",
                "uiScreenshotRefCount: 1",
                "externalServerEventRefCount: 1",
                "zeroObservationRefCount: 1",
                "directPostgresReadRefCount: 1",
                "matrixCasePassCount: 2",
                "pendingStateCount: 2",
                "declaredFailureCount: 2",
                "priorDurableRowCount: 2",
                "successfulRetryCount: 2"
              ],
              "must_not_observe": [
                "matrixCasePassCount: 0",
                "empty durable row identity"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Two drawer rows correlate",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --case seeded-cold-launch --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Zero retry recovers rows",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --case zero-down-retry --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Mission replay yields one result",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --case mission-replay --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Rename delete matrix preserves prior rows and retries",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --case rename-delete-matrix --json",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
