# MK6-NATIVE-001: Isolate native build state per worktree

> Status: Backlog
> Assignee: react-native-ui-implementer
> Reviewer: react-native-ui-reviewer
> Priority: P0
> Type: infrastructure
> Wave: 3
> Proposed by: mastra-planner
> Files: scripts/agent-worktree-env.sh, scripts/e2e/build-expo-dev-client.sh, scripts/e2e/run-maestro-native-gate.sh, scripts/e2e/verify-native-worktree-isolation.sh, services/platform/tests/integration/mk6-native-worktree-isolation-live.test.ts, .gate-evidence/mk6-native/**
> Depends on: MK6-DEP-001, MK6-PROVENANCE-001

## Outcome

Hook and human native builds use worktree-local DerivedData, SwiftPM, Metro, and artifact roots; two concurrent disposable-worktree builds cannot share caches and each artifact is SHA-bound.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/e2e/verify-native-worktree-isolation.sh --two-disposable-worktrees --json` runs two concurrent real iOS builds with distinct DerivedData/SwiftPM/Metro/artifact roots and matches each artifact to its own SHA.
- [ ] AC-2: Shared build database/cache, artifact SHA mismatch, concurrent owner collision, or missing worktree wrapper fails before the native gate.
- [ ] AC-3: `PLATFORM_IT=1 bash scripts/e2e/run-maestro-native-gate.sh --build-provenance "$MK6_NATIVE_BUILD_RECEIPT" --no-convex --json` runs the full real no-Convex gate using one isolated artifact without consuming another worktree's output.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Two concurrent builds use distinct cache roots and match two SHAs. | AC-1 | `PLATFORM_IT=1 bash scripts/e2e/verify-native-worktree-isolation.sh --two-disposable-worktrees --json` |
| TC-2 | A shared DerivedData root fails before build. | AC-2 | `PLATFORM_IT=1 MK6_NATIVE_NEGATIVE=shared-derived-data bash scripts/e2e/verify-native-worktree-isolation.sh --json` |
| TC-3 | The isolated artifact passes the real no-Convex native gate. | AC-3 | `PLATFORM_IT=1 bash scripts/e2e/run-maestro-native-gate.sh --build-provenance "$MK6_NATIVE_BUILD_RECEIPT" --no-convex --json` |

`MANUAL-ONLY NATIVE-M1`: reserve named simulator/UDID and Xcode owner. Never erase/delete/shutdown a shared simulator. No network disruption is permitted.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-NATIVE-001","tdd_mode":"shared","verification_policy":{"requires_tests":true,"requires_red_evidence":false,"requires_seeded_evidence":true},"fixtures":{"two_worktrees":{"seed_method":"cli","description":"two disposable worktrees with distinct source SHAs","records":["worktreeCount: 2"]},"shared_cache":{"seed_method":"cli","description":"two disposable worktrees configured to one disposable DerivedData root","records":["sharedCacheCount: 1"]},"native_artifact":{"seed_method":"ui_flow","description":"one SHA-bound isolated dev build on named simulator","records":["artifactCount: 1"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN two disposable worktrees WHEN real iOS builds run concurrently THEN cache roots are distinct and each artifact matches its SHA","verify":"PLATFORM_IT=1 bash scripts/e2e/verify-native-worktree-isolation.sh --two-disposable-worktrees --json","maps_to_ac":null,"scenario":{"id":"native-two-worktrees","test_tier":"e2e","tier":"visible","verification_service":"xcode-swiftpm","negative_control":{"would_fail_if":["the worktrees share DerivedData or artifact provenance is hardcoded"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"two_worktrees","action":{"steps":["run two concurrent real builds through the worktree wrapper"]},"end_state":{"must_observe":["buildPassCount: 2","distinctCacheRootCount: 2"],"must_not_observe":["buildPassCount: 0","empty artifact SHA"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"GIVEN a shared cache root WHEN preflight runs THEN it fails before Xcode starts","verify":"PLATFORM_IT=1 MK6_NATIVE_NEGATIVE=shared-derived-data bash scripts/e2e/verify-native-worktree-isolation.sh --json","maps_to_ac":null,"scenario":{"id":"native-shared-cache","test_tier":"integration","tier":"visible","verification_service":"native-build-preflight","negative_control":{"would_fail_if":["the shared-cache guard is removed and owner collision is ignored"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"shared_cache","action":{"steps":["run preflight with both disposable worktrees pointed at one cache"]},"end_state":{"must_observe":["failureClass: SHARED_DERIVED_DATA"],"must_not_observe":["xcodeStartedCount: 1","empty failure class"]}}]}},{"id":"AC-3","type":"acceptance_criterion","description":"GIVEN one isolated artifact WHEN the native no-Convex gate runs THEN the artifact alone proves the current SHA","verify":"PLATFORM_IT=1 bash scripts/e2e/run-maestro-native-gate.sh --build-provenance \"$MK6_NATIVE_BUILD_RECEIPT\" --no-convex --json","maps_to_ac":null,"scenario":{"id":"native-no-convex","test_tier":"e2e","tier":"visible","verification_service":"ios-postgres-zero-mcp","negative_control":{"would_fail_if":["the native artifact is stale or the no-Convex gate is removed"]},"evidence":{"artifact_type":"screenshot","required_capture":true},"cases":[{"start_ref":"native_artifact","action":{"steps":["launch the isolated artifact and run the full no-Convex flow"]},"end_state":{"must_observe":["nativeGatePassCount: 1","artifactShaMatchCount: 1"],"must_not_observe":["nativeGatePassCount: 0","empty build provenance"]}}]}},{"id":"TC-1","type":"test_criterion","description":"Two builds use two cache roots","verify":"PLATFORM_IT=1 bash scripts/e2e/verify-native-worktree-isolation.sh --two-disposable-worktrees --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"Shared DerivedData fails preflight","verify":"PLATFORM_IT=1 MK6_NATIVE_NEGATIVE=shared-derived-data bash scripts/e2e/verify-native-worktree-isolation.sh --json","maps_to_ac":"AC-2"},{"id":"TC-3","type":"test_criterion","description":"One isolated artifact passes no-Convex gate","verify":"PLATFORM_IT=1 bash scripts/e2e/run-maestro-native-gate.sh --build-provenance \"$MK6_NATIVE_BUILD_RECEIPT\" --no-convex --json","maps_to_ac":"AC-3"}]}
-->
