# MK6-RELEASE-001: Produce one immutable promotion candidate

> Status: Backlog
> Assignee: devops-engineer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: infrastructure
> Wave: 14
> Proposed by: mastra-planner
> Files: services/platform/src/deploy/production-deploy.ts, services/platform/src/deploy/production-release.ts, services/platform/src/deploy/verify-production.ts, services/platform/deploy/compose/compose.yaml, services/platform/deploy/compose/image-lock.json, services/platform/deploy/compose/production.env.example, scripts/run-mk6-promotion.sh, services/platform/tests/integration/mk6-release-orchestration-live.test.ts
> Depends on: MK6-CUTOVER-001

## Outcome

Release orchestration produces one immutable candidate identity and invokes every mandatory H2-06 lane in order without skipping or caller-authored liveness.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/run-mk6-promotion.sh --candidate-only --json` binds source SHA, image digest, compose generation, host identity, and deployment timestamp, then executes the ten H2-06 producers in order against that same candidate.
- [ ] AC-2: Wrong SHA/image/generation/host, skipped lane, unsigned identity, historical receipt, stale capture, or automatic rollback failure exits non-zero before authority changes.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | One candidate identity is shared by all ten ordered lane receipts. | AC-1 | `PLATFORM_IT=1 bash scripts/run-mk6-promotion.sh --candidate-only --json` |
| TC-2 | A skipped iOS/Zero lane prevents candidate readiness. | AC-2 | `PLATFORM_IT=1 MK6_RELEASE_NEGATIVE=skip-ios-zero bash scripts/run-mk6-promotion.sh --candidate-only --json` |

This task produces real receipts but does not decide promotability; the existing ledger task owns the six binding gate files and consumes them.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-RELEASE-001","tdd_mode":"red_first","verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},"fixtures":{"candidate_release":{"seed_method":"cli","description":"one immutable nonprod candidate with all dependency lanes ready","records":["requiredGateSteps: 10"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN all repaired lanes WHEN candidate orchestration runs THEN ten ordered receipts share one immutable release identity","verify":"PLATFORM_IT=1 bash scripts/run-mk6-promotion.sh --candidate-only --json","maps_to_ac":null,"scenario":{"test_tier":"e2e","tier":"visible","verification_service":"mk6-candidate-stack","negative_control":{"would_fail_if":["one mandatory lane is removed or release identity is hardcoded"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"candidate_release","action":{"steps":["execute all ten H2-06 lane producers against one candidate"]},"end_state":{"must_observe":["orderedReceiptCount: 10","releaseIdentityCount: 1"],"must_not_observe":["orderedReceiptCount: 0","empty release identity"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"Identity drift, skipped lanes and rollback failure block the candidate","verify":"PLATFORM_IT=1 MK6_RELEASE_NEGATIVE=skip-ios-zero bash scripts/run-mk6-promotion.sh --candidate-only --json","maps_to_ac":null},{"id":"TC-1","type":"test_criterion","description":"Ten ordered receipts bind one candidate","verify":"PLATFORM_IT=1 bash scripts/run-mk6-promotion.sh --candidate-only --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"Skipping iOS and Zero blocks readiness","verify":"PLATFORM_IT=1 MK6_RELEASE_NEGATIVE=skip-ios-zero bash scripts/run-mk6-promotion.sh --candidate-only --json","maps_to_ac":"AC-2"}]}
-->
