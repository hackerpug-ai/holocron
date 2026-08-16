# MK6-RUNTIME-001: Make runtime readiness release-bound and truthful

> Status: Backlog
> Assignee: mastra-implementer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: bugfix
> Wave: 2
> Proposed by: mastra-planner
> Files: services/platform/src/http/health.ts, services/platform/src/http/deployment-identity.ts, services/platform/tests/integration/service/health-readiness.test.ts, services/platform/tests/integration/mk6-runtime-health-live.test.ts, scripts/verify-mk6-runtime-health.sh
> Depends on: MK6-DATA-001, MK6-QUEUE-001, MK6-BACKUP-001

## Outcome

The already-listening external Bun/Mastra process returns 200 only when release identity, real Postgres, fleet completion, scheduler, backup, and alerts are current.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-runtime-health.sh --consecutive 3 --json` observes three external 200s from one source SHA/image/generation/host with non-empty Postgres identity, real fleet completion, bounded queue sessions, and fresh scheduler/backup/alert ages.
- [ ] AC-2: Wrong fleet, wrong DB, missing release identity, overdue scheduler, and overdue backup each return a named 503 from the same external surface.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Three external health responses bind one real release and all live dependencies. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-runtime-health.sh --consecutive 3 --json` |
| TC-2 | Fleet-down produces `503` and `FLEET_COMPLETION_FAILED`. | AC-2 | `PLATFORM_IT=1 MK6_HEALTH_NEGATIVE=fleet-down bash scripts/verify-mk6-runtime-health.sh --json` |

`ready:true`, `SELECT 1` alone, `/v1/models` without a completion, in-process Hono calls, and caller-minted identity are non-oracles.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-RUNTIME-001","tdd_mode":"red_first","verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},"fixtures":{"serving_release":{"seed_method":"cli","description":"already-listening real candidate with release identity","records":["candidateSha: 40-hex","healthRequests: 3"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN an already-listening candidate WHEN external health is queried three times THEN one release identity and all live dependency proofs return 200","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-runtime-health.sh --consecutive 3 --json","maps_to_ac":null,"scenario":{"test_tier":"integration","tier":"visible","verification_service":"external-mastra-health","negative_control":{"would_fail_if":["fleet completion is disconnected or readiness is hardcoded"]},"evidence":{"artifact_type":"api_response","required_capture":true},"cases":[{"start_ref":"serving_release","action":{"steps":["query the already-listening process three times from the external client"]},"end_state":{"must_observe":["http200Count: 3","releaseIdentityCount: 1"],"must_not_observe":["http200Count: 0","empty Postgres identity"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"Each stale or wrong dependency returns named 503","verify":"PLATFORM_IT=1 MK6_HEALTH_NEGATIVE=fleet-down bash scripts/verify-mk6-runtime-health.sh --json","maps_to_ac":null},{"id":"TC-1","type":"test_criterion","description":"Three external health checks bind one real release","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-runtime-health.sh --consecutive 3 --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"Fleet-down health is a named 503","verify":"PLATFORM_IT=1 MK6_HEALTH_NEGATIVE=fleet-down bash scripts/verify-mk6-runtime-health.sh --json","maps_to_ac":"AC-2"}]}
-->
