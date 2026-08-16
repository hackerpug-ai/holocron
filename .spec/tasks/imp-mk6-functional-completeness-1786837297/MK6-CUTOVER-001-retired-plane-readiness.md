# MK6-CUTOVER-001: Prove the Convex plane retired before promotion

> Status: Backlog
> Assignee: devops-engineer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: verification
> Wave: 13
> Proposed by: mastra-planner
> Files: services/platform/src/config/verify-no-convex-env.ts, services/platform/src/cli/commands/verify-no-convex.ts, services/platform/src/cli/commands/verify-no-convex-client.ts, services/platform/src/sync/client-callsite-inventory.ts, services/platform/src/cutover/convex-live-attestation.ts, services/platform/src/cutover/fence-status.ts, services/platform/tests/integration/s32-d08-01-no-convex-decommission.test.ts, services/platform/tests/integration/sprint32-decommission-runbook.test.ts, scripts/verify-mk6-retired-plane.sh, .gate-evidence/mk6-cutover/**
> Depends on: MK6-DATA-002, MK6-MCP-002, MK6-CLIENT-003, MK6-RECOVERY-001, MK6-NATIVE-001, MK6-PROVENANCE-001

## Outcome

Fresh code, runtime, MCP, native, and two-device evidence proves only Postgres/Zero/Mastra serve the candidate, while Convex deletion remains closed.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-retired-plane.sh --json` proves no Convex runtime/config/callsite, authenticated real MCP initialize, a named native Postgres/Zero read and durable mutation, and a current D08-02 receipt bound to the candidate.
- [ ] AC-2: Current two-device D08-09 evidence records exact SHA/image/generation, four healthy services, Postgres-down 503/recovery 200, persistent PG/blob sentinels, 44 MCP tools, no Funnel, and capture hashes; stale, one-device, or wrong-release evidence fails.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | The current native/MCP candidate uses no Convex plane and persists one mutation. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-retired-plane.sh --native --mcp --json` |
| TC-2 | A one-device D08-09 capture is rejected. | AC-2 | `PLATFORM_IT=1 MK6_CUTOVER_NEGATIVE=one-device bash scripts/verify-mk6-retired-plane.sh --d08-09 --json` |

`services/platform/src/cli/holo.ts` remains exclusively owned by the downstream ledger task; this task adds leaf commands only. `MANUAL-ONLY CUTOVER-M1`: reserve the simulator and second authorized tailnet device. This task must not delete Convex.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-CUTOVER-001","tdd_mode":"red_first","verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},"fixtures":{"cutover_candidate":{"seed_method":"ui_flow","description":"exact candidate on named native build plus second real tailnet device","records":["healthyServiceCount: 4","mcpToolCount: 44"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN the exact candidate WHEN native, MCP and two-device gates run THEN only Postgres, Zero and Mastra serve non-empty durable state","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-retired-plane.sh --native --mcp --json","maps_to_ac":null,"scenario":{"test_tier":"e2e","tier":"visible","verification_service":"ios-mcp-tailnet-postgres-zero","topology":"multi-node","negative_control":{"would_fail_if":["the second real device is removed or a Convex callsite remains"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"cutover_candidate","action":{"steps":["drive the named native build and a second real tailnet device against the same candidate"]},"end_state":{"must_observe":["healthyServiceCount: 4","mcpToolCount: 44","durableMutationCount: 1"],"must_not_observe":["healthyServiceCount: 0","empty Postgres sentinel"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"Stale, one-device and wrong-release D08-09 evidence fails","verify":"PLATFORM_IT=1 MK6_CUTOVER_NEGATIVE=one-device bash scripts/verify-mk6-retired-plane.sh --d08-09 --json","maps_to_ac":null},{"id":"TC-1","type":"test_criterion","description":"Native and MCP operate without Convex","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-retired-plane.sh --native --mcp --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"One-device D08-09 evidence is rejected","verify":"PLATFORM_IT=1 MK6_CUTOVER_NEGATIVE=one-device bash scripts/verify-mk6-retired-plane.sh --d08-09 --json","maps_to_ac":"AC-2"}]}
-->
