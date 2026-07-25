# Pre-Existing Issues Blocking Commit

## TypeScript Errors (`pnpm tsgo --noEmit` exit 2)
Pre-existing on clean tree (verified via `git stash` of REDHAT-FIX-08 changes).
Platform / integration noise includes:
- `services/platform/src/**` many TS5097 (`.ts` import extensions without `allowImportingTsExtensions`)
- `services/platform/src/http/chat-runs.ts` and related Mastra typing mismatches
- `tests/integration/redhat-fix-04-production-hook-reconnect.test.ts` XMLHttpRequest typing
- Task packet already notes: typecheck may have pre-existing platform TS noise

## Unit Test Failures (`pnpm test:unit` exit 1)
On clean tree (same 2 suites fail without our changes):
- `components/narration/hooks/useAudioPlayback.test.ts` — Cannot find module `/@fs/.../vitest-native/dist/setup.mjs` (worktree + symlinked node_modules vitest-native resolution)
- `components/narration/hooks/useNarrationState.test.ts` — same

Otherwise: 89 passed | 5 skipped | 963 tests passed.

## Lint
`pnpm biome check` on staged docs/json — passes.

## Our changes
Only SPRINT.md docs + gate-results artifacts under sprint-25 folder. No product TS/TSX modified.
Product freeze files have empty porcelain status.

All issues verified as pre-existing via git stash baseline.
