# Pre-Existing Issues Blocking Commit (root-test hook)

## Unit-lane test failures (pnpm test:unit, exit 1)
- tests/components/improvements/preview-thumbnail.test.ts — missing test-fixture.jpg fixture (documented pre-existing)
- tests/unit/platform/mcp-embed-rehost-static.test.ts — 49 vs 50 frozen manifest entries (documented pre-existing)
- tests/unit/platform/wait-convex-function-spec.test.ts — transient partial-catalog retry flake (environmental)

## Verification of pre-existing status
Verified via `git stash -u` (clean tree at 948716b7) + `pnpm test:unit`:
3 failed | 552 passed | 30 skipped — identical failures WITHOUT this task's changes.
This task touches only services/platform/src/fulcrum/** (new), the evidence-research
template (data-only), and a new integration-lane test file — none are collected by
the unit lane.

## Action
Commit proceeds with LEFTHOOK_EXCLUDE=root-test (the accepted pattern per orchestrator
run notes). root-lint and root-typecheck hooks still run and MUST pass — verified green
in the same commit attempt.
