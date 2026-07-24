# Pre-Existing Issues Blocking Commit Hook

## TypeScript Errors
- 110 errors under `services/platform/**` — missing worktree-local packages (`drizzle-orm`, etc.).
- Verified none of the 110 errors touch S-REWRITE-01 scoped files (`app/(drawer)`, `app/zero`, `hooks/use-chat-history`, `hooks/use-agent-activity`, `components/chat/*`, `components/agent/ToolApprovalCard`).
- Primary checkout typechecks the app surface; worktree shares node_modules symlink but platform deps are incomplete.

## Unit test suite (lefthook root-test)
- `vitest-native` setup module missing (`/@fs/.../vitest-native/dist/setup.mjs`) for voice/narration tests.
- `drizzle-orm/postgres-js` missing for platform mission-json-errors test.
- S-REWRITE-01 tests pass: `hooks/use-agent-activity.test.ts` + `tests/integration/s-rewrite-01-chat-cluster-zero.test.ts` (25/25).

## Lint
- Scoped files pass `biome check` after format; full-repo lint has pre-existing noise outside scope.

All issues verified as pre-existing / environment (not introduced by this rewire).
