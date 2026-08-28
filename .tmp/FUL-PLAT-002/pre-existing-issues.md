# Pre-Existing Issues Blocking Commit (root-test lane only)

The lefthook `root-test` pre-commit command (`pnpm test:unit`) fails on main before any
FUL-PLAT-002 change. Verified pre-existing via the orchestrator's dispatch notes
("Known pre-existing failures (verified pre-existing via stash)") and re-verified during the
RED phase of this task: both failures reproduce with only the FUL-PLAT-002 test file staged —
no production code exists yet at commit time (RED state). Unchanged for GREEN.

## Test Failures (unit lane)

- tests/unit/platform/mcp-embed-rehost-static.test.ts — AssertionError: expected 49 to be 50
  (registered MCP tools vs frozen manifest). Known pre-existing (orchestrator wave notes).
- tests/components/improvements/preview-thumbnail.test.ts — AssertionError: missing fixture
  .tmp/S-UPLOAD-01/test-fixture.jpg. Known pre-existing (orchestrator wave notes).

## Resolution

Commit uses `LEFTHOOK_EXCLUDE=root-test` — the orchestrator-accepted pattern.
`root-lint` (biome, warnings=errors) and `root-typecheck` (tsgo) both pass and are NOT excluded.

## GREEN-phase gate evidence (updated 2026-08-28)

- `pnpm lint` (biome check .) — exit 0, 593 warnings / 70 infos, zero errors
  (.tmp/FUL-PLAT-002/lint-output.txt).
- `pnpm typecheck` (tsgo --noEmit, root) — exit 0 (.tmp/FUL-PLAT-002/typecheck-output.txt).
- Contract Gate 3 `pnpm biome check --write --diagnostic-level=error` over the 5 write-allowed
  files — clean, "No fixes applied".
- Root `pnpm test:unit` (root-test lane) — the 2 failures above; both pre-existing on main,
  unrelated to this task's files (neither file touches fulcrum or the admission path).
- Manifest verifies: 17/17 requirements green (ac-N-output.txt / tc-N-output.txt here;
  TC-N commands are byte-identical to their mapped AC-N command per verify-manifest.json,
  so tc-N-output.txt is a copy of the same command's captured output).
- Seeded evidence: AC-N-green.txt (verbose run incl. db_query console lines) +
  AC-N-seeded-artifact.txt (fresh psql dumps of the persisted rows / scan report) per AC.

## Platform-lane typecheck baseline (informational)

`pnpm tsgo --noEmit -p services/platform` reports 238 pre-existing errors on main baseline
(verified via `git stash -u` re-run during RED). The FUL-PLAT-002 files add ZERO new errors
(0 mentions of fulcrum files in the root typecheck run above).
