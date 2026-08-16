# MK6-MISSION-001: Restore Mastra mission lifecycle and Zero publication

> Status: Backlog
> Assignee: mastra-implementer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: feature
> Wave: 5
> Proposed by: mastra-planner
> Files: services/platform/src/index.ts, services/platform/src/http/hono-app.ts, services/platform/src/http/missions.ts, services/platform/src/mission/**, services/platform/src/db/schema/zero-pub.ts, services/platform/src/db/migrations/0039_zero_pub_mission_runs.sql, services/platform/src/zero/mutate.ts, services/platform/tests/integration/sprint17-mission-template.test.ts, services/platform/tests/integration/sprint31-mission-off-http.test.ts, services/platform/tests/integration/sprint31-mission-trace-live.test.ts, services/platform/tests/integration/mission-list-restart-live.test.ts, services/platform/tests/integration/mission-zero-contract.test.ts, scripts/verify-mk6-mission-lifecycle.sh
> Depends on: MK6-FLEET-001, MK6-DATA-001, MK6-QUEUE-001, MK6-RUNTIME-001

## Outcome

The real Mastra registry exposes typed agents/workflows, mission list/status no longer returns 501, and a mission progresses durably through Postgres, scheduler, model trace, and Zero across restart.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-mission-lifecycle.sh --json` creates through external HTTP, lists with pagination and scope, observes `queued -> running -> completed`, a durable side effect and real model trace, kills/restarts the service, and confirms a second real Zero client sees the same terminal run exactly once.
- [ ] AC-2: `--negative-control mission-501` fails with `MISSION_LIST_501`; invalid scope/input/not-found/duplicate/fleet-down paths return declared non-success terminal outcomes and 409/423 mutation rejection rolls back.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | A real mission survives restart and reaches one terminal Zero-visible result. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-mission-lifecycle.sh --json` |
| TC-2 | Reintroducing the list 501 is killed by the named control. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-mk6-mission-lifecycle.sh --negative-control mission-501 --json` |

In-process Hono invocation, 200-or-501 acceptance, a queued row without terminal work, fixture traces, and fabricated 2xx are non-oracles. All Mastra schemas are real Zod schemas; workflows end in `.commit()` and agent tripwires are handled at every call site.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-MISSION-001","tdd_mode":"red_first","verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},"fixtures":{"mission_request":{"seed_method":"public_api","description":"real scoped mission request","records":["missionKey: mk6-mission-1"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN a scoped mission WHEN the external service and scheduler execute it across restart THEN Postgres and Zero expose one completed run with a real trace","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-mission-lifecycle.sh --json","maps_to_ac":null,"scenario":{"test_tier":"e2e","tier":"visible","verification_service":"mastra-postgres-zero-fleet","negative_control":{"would_fail_if":["the mission list is a 501 stub or the model trace is mocked"]},"evidence":{"artifact_type":"event_log","required_capture":true},"cases":[{"start_ref":"mission_request","action":{"steps":["create mk6-mission-1 through external HTTP, restart the service, and observe it from a second real Zero client"]},"end_state":{"must_observe":["completedMissionCount: 1","modelTraceCount >= 1"],"must_not_observe":["completedMissionCount: 0","empty mission list"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"Mission 501 and declared failure paths fail truthfully","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-mission-lifecycle.sh --negative-control mission-501 --json","maps_to_ac":null},{"id":"TC-1","type":"test_criterion","description":"One mission completes durably across restart","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-mission-lifecycle.sh --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"The mission-501 mutant is killed","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-mission-lifecycle.sh --negative-control mission-501 --json","maps_to_ac":"AC-2"}]}
-->
