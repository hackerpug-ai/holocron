# MK6-DATA-001: Restore Postgres data-plane truth

> Status: Backlog
> Assignee: mastra-implementer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: bugfix
> Wave: 1
> Proposed by: mastra-planner
> Files: services/platform/src/cutover/data-plane-content.ts, services/platform/src/cutover/soak-fence.ts, services/platform/src/etl/reconcile.ts, services/platform/src/etl/archive.ts, services/platform/src/etl/latest-run.ts, services/platform/src/db/connection.ts, services/platform/tests/integration/mk6-data-plane-truth-live.test.ts, scripts/verify-mk6-data-plane-truth.sh
> Depends on: MK6-DEP-001

## Outcome

The retained real Convex export and real Postgres agree on non-empty migration corpus content, referential integrity, blobs, and one sentinel, establishing the foundation consumed by final cross-surface attestation.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --json` proves non-zero expected corpus counts, content hashes, FK integrity, blob hashes, and one exact sentinel ID/hash across direct Postgres and the externally served content probe.
- [ ] AC-2: A count-equal/content-corrupt isolated Postgres target exits non-zero with `CONTENT_DIGEST_MISMATCH`; cross-surface retired/wrong/disconnected variants belong to MK6-DATA-002.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | A retained real export reconciles to non-empty Postgres bytes and a matching external sentinel. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --json` |
| TC-2 | A content-corrupt/count-equal database cannot pass. | AC-2 | `PLATFORM_IT=1 MK6_DATA_NEGATIVE=count-equal-content-corrupt bash scripts/verify-mk6-data-plane-truth.sh --json` |

Static seed corpora, fixture archives, row-count-only checks, direct imports, and empty successful reads are non-oracles.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-DATA-001","tdd_mode":"red_first","verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},"fixtures":{"real_export":{"seed_method":"recorded_external","description":"retained immutable real Convex export with one known sentinel","records":["sentinelId: mk6-data-sentinel-1","expectedContentHash: 64-hex"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN a retained real export WHEN reconciliation runs THEN direct Postgres and external content probe return the same non-empty sentinel hash","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --json","maps_to_ac":null,"scenario":{"id":"data-foundation","test_tier":"integration","tier":"visible","verification_service":"postgres-hono","negative_control":{"would_fail_if":["the sentinel is deleted or content is hardcoded"]},"evidence":{"artifact_type":"db_query","required_capture":true},"cases":[{"start_ref":"real_export","action":{"steps":["reconcile the retained export and fetch mk6-data-sentinel-1 through the external API"]},"end_state":{"must_observe":["sentinelMatches: 1","corpusCount > 0"],"must_not_observe":["sentinelMatches: 0","empty corpus"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"Count-equal content corruption fails with CONTENT_DIGEST_MISMATCH","verify":"PLATFORM_IT=1 MK6_DATA_NEGATIVE=count-equal-content-corrupt bash scripts/verify-mk6-data-plane-truth.sh --json","maps_to_ac":null,"scenario":{"id":"data-content-corrupt","test_tier":"integration","tier":"visible","verification_service":"postgres-reconcile","negative_control":{"would_fail_if":["content digest validation is removed or corruption is ignored"]},"evidence":{"artifact_type":"db_query","required_capture":true},"cases":[{"start_ref":"real_export","action":{"steps":["change sentinel bytes in isolated Postgres without changing row count"]},"end_state":{"must_observe":["failureClass: CONTENT_DIGEST_MISMATCH"],"must_not_observe":["failureCount: 0","empty expected digest"]}}]}},{"id":"TC-1","type":"test_criterion","description":"The real export and Postgres sentinel bytes agree","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-data-plane-truth.sh --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"Count-equal content corruption is rejected","verify":"PLATFORM_IT=1 MK6_DATA_NEGATIVE=count-equal-content-corrupt bash scripts/verify-mk6-data-plane-truth.sh --json","maps_to_ac":"AC-2"}]}
-->
