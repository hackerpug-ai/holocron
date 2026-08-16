# MK6-CLIENT-003: Prove chat terminal semantics with scoped service faults

> Status: Backlog
> Assignee: react-native-ui-implementer
> Reviewer: react-native-ui-reviewer
> Priority: P1
> Type: verification
> Wave: 11
> Proposed by: mastra-planner
> Files: hooks/use-resumable-sse-stream.ts, app/(drawer)/chat/[conversationId].tsx, components/chat/ChatThread.tsx, tests/integration/s-reactive-04-degraded-chat.test.ts, tests/integration/s-reactive-01-resumable-sse.test.ts, tests/integration/s31-fe-07-offline-contract-scope.test.ts, .maestro/reactive/service-scoped-reconnect-contracts.yml, .maestro/reactive/run-service-scoped-reconnect-contracts.sh, .maestro/reactive/chat-terminal-matrix.yml, .maestro/reactive/run-chat-terminal-matrix.sh, .gate-evidence/mk6-client-chat
> Depends on: MK6-CLIENT-001, MK6-CLIENT-004, MK6-RUNTIME-001

## Outcome

Five reconnect contracts and eight atomized chat failure modes correlate native UI, external server, Zero, and Postgres evidence while Internet and host/device networking stay continuously available.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash .maestro/reactive/run-service-scoped-reconnect-contracts.sh --all-cases --json` — Task-owned service proxies independently prove cached read during scoped Zero unavailability, queued write/reconnect, 409/423 rejection rollback, replay dedupe, and concurrent edit reconciliation. Every case correlates UI, server log, Zero event, and Postgres readback.
- [ ] AC-2: `PLATFORM_IT=1 bash .maestro/reactive/run-chat-terminal-matrix.sh --all-cases --json` — The eight separately counted cases—API 500, hydration/stale research, wrong host, retired 410, fleet-down, midstream SSE loss, stalled-SSE deadline, and non-fleet `status=failed`—render distinct truthful states. Only verified fleet/role unavailability degrades; stalled/non-fleet failures become neither degraded nor complete; midstream recovery yields one final message.
- [ ] AC-3: `PLATFORM_IT=1 bash .maestro/reactive/run-service-scoped-reconnect-contracts.sh --verify-network-continuity --json` — Preflight continuously proves public Internet reachability and unchanged device/host network configuration; any Wi-Fi/interface/Tailscale mutation immediately fails the harness.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Cached read remains visible during isolated Zero fault. | AC-1 | `PLATFORM_IT=1 bash .maestro/reactive/run-service-scoped-reconnect-contracts.sh --case cache-read --json` |
| TC-2 | Queued write persists once after isolated Zero restore. | AC-1 | `PLATFORM_IT=1 bash .maestro/reactive/run-service-scoped-reconnect-contracts.sh --case queued-write-reconnect --json` |
| TC-3 | Server-scoped 409 and 423 roll back with zero durable rows. | AC-1 | `PLATFORM_IT=1 bash .maestro/reactive/run-service-scoped-reconnect-contracts.sh --case rejection-rollback --json` |
| TC-4 | Duplicate replay leaves one message/event/row. | AC-1 | `PLATFORM_IT=1 bash .maestro/reactive/run-service-scoped-reconnect-contracts.sh --case replay-dedupe --json` |
| TC-5 | Concurrent edits reconcile to one declared winner on four surfaces. | AC-1 | `PLATFORM_IT=1 bash .maestro/reactive/run-service-scoped-reconnect-contracts.sh --case concurrent-edit --json` |
| TC-6 | API 500 is terminal, visible, and not degraded. | AC-2 | `PLATFORM_IT=1 bash .maestro/reactive/run-chat-terminal-matrix.sh --case api-500 --json` |
| TC-7 | Hydration/stale research failure is visible and recoverable. | AC-2 | `PLATFORM_IT=1 bash .maestro/reactive/run-chat-terminal-matrix.sh --case hydration-stale-research --json` |
| TC-8 | Wrong host is terminal, not degraded. | AC-2 | `PLATFORM_IT=1 bash .maestro/reactive/run-chat-terminal-matrix.sh --case wrong-host --json` |
| TC-9 | Real fleet-down yields one degraded banner and one recovery reply. | AC-2 | `PLATFORM_IT=1 bash .maestro/reactive/run-chat-terminal-matrix.sh --case fleet-down-recovery --json` |
| TC-10 | Midstream loss replays exactly one final Zero/Postgres message. | AC-2 | `PLATFORM_IT=1 bash .maestro/reactive/run-chat-terminal-matrix.sh --case midstream-loss --json` |
| TC-11 | Internet/network continuity receipts remain unchanged across all cases. | AC-3 | `PLATFORM_IT=1 bash .maestro/reactive/run-service-scoped-reconnect-contracts.sh --verify-network-continuity --json` |
| TC-12 | Retired 410 is terminal, not degraded. | AC-2 | `PLATFORM_IT=1 bash .maestro/reactive/run-chat-terminal-matrix.sh --case retired-410 --json` |
| TC-13 | Service-scoped stalled SSE reaches its deadline without degraded or complete state. | AC-2 | `PLATFORM_IT=1 bash .maestro/reactive/run-chat-terminal-matrix.sh --case stalled-sse-deadline --json` |
| TC-14 | Non-fleet `status=failed` stays terminal and never becomes degraded or complete. | AC-2 | `PLATFORM_IT=1 bash .maestro/reactive/run-chat-terminal-matrix.sh --case nonfleet-status-failed --json` |

Only task-owned isolated Zero/SSE/fleet proxy processes may be stopped or faulted. Airplane mode, Wi-Fi/Tailscale/interface changes, Funnel changes, shared-service restarts, and device network disruption are prohibited.

Every scenario retains one task-owned correlated receipt keyed by a single operation ID with `uiScreenshotRef`, `externalServerEventRef`, `zeroObservationRef`, and `directPostgresReadRef`; a screenshot alone cannot pass.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "MK6-CLIENT-003",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "reconnect_matrix": {
      "seed_method": "ui_flow",
      "description": "task-owned isolated service proxies and five real UI reconnect cases",
      "records": [
        "reconnectCaseCount: 5"
      ]
    },
    "terminal_matrix": {
      "seed_method": "ui_flow",
      "description": "eight atomized scoped server/fleet/SSE failure cases",
      "records": [
        "terminalCaseCount: 8"
      ]
    },
    "network_receipt": {
      "seed_method": "cli",
      "description": "pre/post public Internet and interface identity receipt",
      "records": [
        "networkMutationCount: 0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN five service-scoped reconnect cases WHEN the native UI drives them THEN UI, server, Zero and Postgres reconcile each case",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-service-scoped-reconnect-contracts.sh --all-cases --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "client-reconnect-five",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "ios-isolated-zero-sse-postgres",
        "negative_control": {
          "would_fail_if": [
            "replay dedupe is removed or service evidence is disconnected"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "reconnect_matrix",
            "action": {
              "steps": [
                "drive cache read, queued reconnect, rejection rollback, replay dedupe and concurrent edit"
              ]
            },
            "end_state": {
              "must_observe": [
                "operationIdCount: 1",
                "uiScreenshotRefCount: 1",
                "externalServerEventRefCount: 1",
                "zeroObservationRefCount: 1",
                "directPostgresReadRefCount: 1",
                "reconnectCasePassCount: 5",
                "correlatedSurfaceCountPerCase: 4"
              ],
              "must_not_observe": [
                "reconnectCasePassCount: 0",
                "empty operation IDs"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN eight atomized scoped failure modes WHEN chat runs THEN each state is truthful and midstream recovery is exactly once",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-chat-terminal-matrix.sh --all-cases --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "client-chat-terminal-eight",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "ios-hono-zero-fleet-sse",
        "negative_control": {
          "would_fail_if": [
            "generic failures are marked degraded or final-message dedupe is removed"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "terminal_matrix",
            "action": {
              "steps": [
                "drive API 500, hydration stale, wrong host, retired 410, fleet-down, midstream loss, stalled-SSE deadline, and non-fleet status=failed cases independently"
              ]
            },
            "end_state": {
              "must_observe": [
                "operationIdCount: 1",
                "uiScreenshotRefCount: 1",
                "externalServerEventRefCount: 1",
                "zeroObservationRefCount: 1",
                "directPostgresReadRefCount: 1",
                "terminalMatrixPassCount: 8",
                "finalMessageCopies: 1",
                "stalledSseDeadlineCount: 1",
                "nonFleetFailedTerminalCount: 1",
                "falseDegradedCount: 0",
                "falseCompleteCount: 0"
              ],
              "must_not_observe": [
                "terminalMatrixPassCount: 0",
                "empty failure code"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN preflight network identity WHEN all scoped faults run THEN Internet remains reachable and networkMutationCount stays zero",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-service-scoped-reconnect-contracts.sh --verify-network-continuity --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "client-network-continuity",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "network-continuity-probe",
        "negative_control": {
          "would_fail_if": [
            "Wi-Fi, Tailscale or an interface is disconnected"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "network_receipt",
            "action": {
              "steps": [
                "compare pre/post Internet and interface identities around scoped service faults"
              ]
            },
            "end_state": {
              "must_observe": [
                "operationIdCount: 1",
                "uiScreenshotRefCount: 1",
                "externalServerEventRefCount: 1",
                "zeroObservationRefCount: 1",
                "directPostgresReadRefCount: 1",
                "internetReachabilityPassCount: 2",
                "networkMutationCount: 0"
              ],
              "must_not_observe": [
                "internetReachabilityPassCount: 0",
                "empty interface identity"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Cache read passes",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-service-scoped-reconnect-contracts.sh --case cache-read --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Queued reconnect passes",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-service-scoped-reconnect-contracts.sh --case queued-write-reconnect --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Rejection rollback passes",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-service-scoped-reconnect-contracts.sh --case rejection-rollback --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Replay dedupe passes",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-service-scoped-reconnect-contracts.sh --case replay-dedupe --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Concurrent edit passes",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-service-scoped-reconnect-contracts.sh --case concurrent-edit --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "API 500 is terminal",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-chat-terminal-matrix.sh --case api-500 --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Hydration stale is visible",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-chat-terminal-matrix.sh --case hydration-stale-research --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "Wrong host retired 410 is terminal",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-chat-terminal-matrix.sh --case wrong-host --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "Fleet-down recovers",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-chat-terminal-matrix.sh --case fleet-down-recovery --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "Midstream loss is exactly once",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-chat-terminal-matrix.sh --case midstream-loss --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": "Network continuity is unchanged",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-service-scoped-reconnect-contracts.sh --verify-network-continuity --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": "Retired 410 is terminal",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-chat-terminal-matrix.sh --case retired-410 --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-13",
      "type": "test_criterion",
      "description": "Stalled SSE deadline is terminal",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-chat-terminal-matrix.sh --case stalled-sse-deadline --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-14",
      "type": "test_criterion",
      "description": "Nonfleet status failed is terminal",
      "verify": "PLATFORM_IT=1 bash .maestro/reactive/run-chat-terminal-matrix.sh --case nonfleet-status-failed --json",
      "maps_to_ac": "AC-2"
    }
  ]
}
-->
