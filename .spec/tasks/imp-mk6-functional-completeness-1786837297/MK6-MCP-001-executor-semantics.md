# MK6-MCP-001: Repair MCP executor semantics and durable mutations

> Status: Backlog
> Assignee: mcp-implementer
> Reviewer: mcp-reviewer
> Priority: P0
> Type: bugfix
> Wave: 2
> Proposed by: mastra-planner
> Files: services/platform/src/mcp/executor.ts, services/platform/src/mcp/list-mutations.ts, services/platform/src/db/schema/subscriptions.ts, services/platform/src/db/migrations/0040_mcp_subscription_replay.sql, services/platform/tests/integration/mcp-behavior-live.test.ts, scripts/verify-mk6-mcp-executor.sh
> Depends on: MK6-DATA-001, MK6-QUEUE-001, MK6-MISSION-001

## Outcome

`check_subscriptions` and every MCP mutation produce truthful real Postgres/blob/queue effects, idempotent replay, and declared errors instead of zero/null false success.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-mcp-executor.sh --json` uses a real controlled feed/HTTP source, real Postgres, and real queue to prove sourceType/enabled filtering, fetched content persistence, `last_checked` update, downstream enqueue, durable mutation readback, and one stable result under two concurrent identical calls.
- [ ] AC-2: `--negative-control mcp-semantic-no-op` hardcodes zero and exits non-zero with `MCP_SEMANTIC_NO_OP`; disabled/malformed/upstream-error/not-found/retired-Convex paths return manifest-declared errors rather than ordinary null/empty success.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Real feed content changes source, content, last-checked, and queue state exactly once. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-mcp-executor.sh --json` |
| TC-2 | The hardcoded-zero semantic no-op is killed. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-mk6-mcp-executor.sh --negative-control mcp-semantic-no-op --json` |

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-MCP-001","tdd_mode":"red_first","verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},"fixtures":{"subscription_source":{"seed_method":"recorded_external","description":"real controlled HTTP feed with one new item","records":["sourceId: mk6-source-1","itemCount: 1"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN one enabled real feed WHEN check_subscriptions and duplicate mutations execute THEN Postgres and queue record one durable item and stable replay","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-mcp-executor.sh --json","maps_to_ac":null,"scenario":{"test_tier":"integration","tier":"visible","verification_service":"mcp-postgres-queue-http-feed","negative_control":{"would_fail_if":["check_subscriptions is a hardcoded zero no-op or mutation persistence is removed"]},"evidence":{"artifact_type":"db_query","required_capture":true},"cases":[{"start_ref":"subscription_source","action":{"steps":["call check_subscriptions and issue two concurrent identical mutations"]},"end_state":{"must_observe":["persistedItemCount: 1","downstreamQueueDelta: 1"],"must_not_observe":["persistedItemCount: 0","empty last_checked"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"Semantic no-op and retired-plane paths return named failure","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-mcp-executor.sh --negative-control mcp-semantic-no-op --json","maps_to_ac":null},{"id":"TC-1","type":"test_criterion","description":"One real feed item is persisted and queued once","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-mcp-executor.sh --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"The semantic-no-op mutant fails","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-mcp-executor.sh --negative-control mcp-semantic-no-op --json","maps_to_ac":"AC-2"}]}
-->
