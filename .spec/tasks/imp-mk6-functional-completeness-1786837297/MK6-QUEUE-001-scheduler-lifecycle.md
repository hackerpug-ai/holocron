# MK6-QUEUE-001: Repair scheduler ownership and persistence

> Status: Backlog
> Assignee: mastra-implementer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: bugfix
> Wave: 2
> Proposed by: mastra-planner
> Files: services/platform/src/queue/backend.ts, services/platform/src/queue/scheduler-worker.ts, services/platform/src/queue/probe-cli.ts, services/platform/tests/integration/queue-backend-idempotency.test.ts, services/platform/tests/integration/queue-heartbeat-persistence-live.test.ts, scripts/verify-mk6-queue-lifecycle.sh
> Depends on: MK6-DATA-001

## Outcome

One durable PgBoss owner survives concurrent starts and restarts without connection growth, while queued work completes exactly once.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-queue-lifecycle.sh --duration-seconds 120 --json` observes at least three 30-second heartbeats, one owner, bounded `pg_stat_activity` sessions, one terminal side effect, zero owned sessions after SIGTERM, and exactly-once completion after restart.
- [ ] AC-2: `--negative-control queue-recreation` removes reuse/constructs on heartbeat and must exit non-zero with `QUEUE_RECREATION_DETECTED`.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | A real queued job survives restart and its terminal side effect occurs exactly once. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-queue-lifecycle.sh --duration-seconds 120 --json` |
| TC-2 | The queue-recreation mutant is killed. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-mk6-queue-lifecycle.sh --negative-control queue-recreation --json` |

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-QUEUE-001","tdd_mode":"red_first","verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},"fixtures":{"queued_job":{"seed_method":"public_api","description":"real PgBoss job with durable effect","records":["jobId: mk6-queue-job-1"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN one real queued job WHEN scheduler runs, stops and restarts THEN one owner completes one durable effect exactly once","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-queue-lifecycle.sh --duration-seconds 120 --json","maps_to_ac":null,"scenario":{"test_tier":"integration","tier":"visible","verification_service":"postgres-pgboss","negative_control":{"would_fail_if":["the queue backend is recreated on every heartbeat or persistence is removed"]},"evidence":{"artifact_type":"db_query","required_capture":true},"cases":[{"start_ref":"queued_job","action":{"steps":["run scheduler for 120 seconds, SIGTERM it, and restart it"]},"end_state":{"must_observe":["heartbeatCount >= 3","durableEffectCount: 1"],"must_not_observe":["durableEffectCount: 0","empty owner identity"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"Queue recreation is a named failing negative control","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-queue-lifecycle.sh --negative-control queue-recreation --json","maps_to_ac":null},{"id":"TC-1","type":"test_criterion","description":"The durable job completes once after restart","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-queue-lifecycle.sh --duration-seconds 120 --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"The queue-recreation mutant fails","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-queue-lifecycle.sh --negative-control queue-recreation --json","maps_to_ac":"AC-2"}]}
-->
