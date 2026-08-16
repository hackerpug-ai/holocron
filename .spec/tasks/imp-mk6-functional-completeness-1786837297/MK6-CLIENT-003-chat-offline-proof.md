# MK6-CLIENT-003: Repair chat terminal semantics and prove offline contracts

> Status: Backlog
> Assignee: react-native-ui-implementer
> Reviewer: react-native-ui-reviewer
> Priority: P1
> Type: verification
> Wave: 4
> Proposed by: mastra-planner
> Files: hooks/use-resumable-sse-stream.ts, app/(drawer)/chat/[conversationId].tsx, components/chat/ChatThread.tsx, tests/integration/s-reactive-04-degraded-chat.test.ts, tests/integration/s-reactive-01-resumable-sse.test.ts, tests/integration/s31-fe-07-offline-contract-scope.test.ts, .maestro/reactive/degraded-no-hang.yml, .maestro/reactive/degraded-recovery.yml, .maestro/reactive/offline-contract-airplane-reads.yml, .maestro/reactive/zero-down-terminal-error.yml, .maestro/reactive/run-degraded-no-hang.sh, .maestro/reactive/run-degraded-recovery.sh, .maestro/reactive/run-offline-contract-airplane-reads.sh, .maestro/reactive/run-zero-down-terminal-error.sh, scripts/e2e/run-mk6-client-fallback-control.sh
> Depends on: MK6-CLIENT-001, MK6-CLIENT-002, MK6-RUNTIME-001

## Outcome

Only verified role/fleet unavailability enters degraded mode; wrong-host and generic failures terminate truthfully, replay is exactly once, and all five immutable offline contracts pass on a named native build.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash .maestro/reactive/run-offline-contract-airplane-reads.sh --json` proves cached read, queued write/reconnect, rejection rollback, duplicate replay, and concurrent edit against real nonprod Postgres/Zero, with build SHA and simulator identity in captures.
- [ ] AC-2: Real fleet-down shows exactly one degraded banner and recovery reply; wrong-host/retired/410/500 is a non-degraded terminal error; midstream loss replays one final Zero message exactly once.
- [ ] AC-3: `PLATFORM_IT=1 bash scripts/e2e/run-mk6-client-fallback-control.sh --json` kills loopback/e2e/retired fallback and is the executable AC-3 `client-fallback` control.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | All five real offline cases pass and recover on the same named build. | AC-1 | `PLATFORM_IT=1 bash .maestro/reactive/run-offline-contract-airplane-reads.sh --json` |
| TC-2 | Wrong-host is terminal and not labeled degraded. | AC-2 | `PLATFORM_IT=1 MK6_CHAT_NEGATIVE=wrong-host bash .maestro/reactive/run-degraded-no-hang.sh --json` |
| TC-3 | The client fallback mutant is killed with zero loopback requests. | AC-3 | `PLATFORM_IT=1 bash scripts/e2e/run-mk6-client-fallback-control.sh --json` |

Static/regex tests and historical `.gate-evidence` are supplemental only. `MANUAL-ONLY CLIENT-M2`: a named reserved simulator, fresh dev build, isolated DerivedData/Metro, and operator-owned service fault window are required.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-CLIENT-003","tdd_mode":"red_first","verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},"fixtures":{"offline_conversation":{"seed_method":"ui_flow","description":"named native build with cached conversation and real nonprod Zero/Postgres","records":["conversationId: mk6-offline-1","cachedMessageCount: 3"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN a real cached conversation WHEN five offline/reconnect cases run THEN durable state and visible messages reconcile exactly once","verify":"PLATFORM_IT=1 bash .maestro/reactive/run-offline-contract-airplane-reads.sh --json","maps_to_ac":null,"scenario":{"test_tier":"e2e","tier":"visible","verification_service":"ios-zero-postgres-sse","negative_control":{"would_fail_if":["offline state is injected by a fixture or SSE replay is disconnected"]},"evidence":{"artifact_type":"screenshot","required_capture":true},"cases":[{"start_ref":"offline_conversation","action":{"steps":["drive cached read, queued write, rejection, duplicate replay and concurrent edit through the real native UI"]},"end_state":{"must_observe":["offlineCasesPassed: 5","finalMessageCopies: 1"],"must_not_observe":["offlineCasesPassed: 0","empty conversation"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"Fleet-down degrades while wrong-host terminates and replay remains exactly once","verify":"PLATFORM_IT=1 MK6_CHAT_NEGATIVE=wrong-host bash .maestro/reactive/run-degraded-no-hang.sh --json","maps_to_ac":null},{"id":"AC-3","type":"acceptance_criterion","description":"The client-fallback negative control rejects loopback, e2e and retired hosts","verify":"PLATFORM_IT=1 bash scripts/e2e/run-mk6-client-fallback-control.sh --json","maps_to_ac":null},{"id":"TC-1","type":"test_criterion","description":"Five offline cases pass on the real named build","verify":"PLATFORM_IT=1 bash .maestro/reactive/run-offline-contract-airplane-reads.sh --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"Wrong-host is terminal rather than degraded","verify":"PLATFORM_IT=1 MK6_CHAT_NEGATIVE=wrong-host bash .maestro/reactive/run-degraded-no-hang.sh --json","maps_to_ac":"AC-2"},{"id":"TC-3","type":"test_criterion","description":"Client fallback causes zero loopback requests","verify":"PLATFORM_IT=1 bash scripts/e2e/run-mk6-client-fallback-control.sh --json","maps_to_ac":"AC-3"}]}
-->
