# Pre-Existing Issues Blocking Commit

## TypeScript Errors
- Pre-existing platform noise under `services/platform/**`: TS5097 import-extension, missing drizzle-orm/mastra modules when worktree uses primary node_modules symlink, and assorted schema `any`/`ParameterOrJSON` errors.
- None of these files are in REDHAT-FIX-10 WRITE-ALLOWED scope.
- Scoped change is tests-only: `tests/integration/redhat-fix-04-production-hook-reconnect.test.ts` (+ evidence under `.tmp/`).

## Lint
- root-lint passed (biome check on staged test file OK; infos only).

## Test Failures (pre-commit `pnpm test:unit`)
- `components/narration/hooks/useAudioPlayback.test.ts` / `useNarrationState.test.ts`: Cannot find module `vitest-native/dist/setup.mjs` (symlink/env).
- `services/platform/src/cli/__tests__/mission-json-errors.test.ts`: Cannot find package `drizzle-orm/postgres-js`.
- Unrelated to FIX-10; integration suite for AC-1-site-A / AC-2-site-A-mutation / AC-1 / s-reactive-01 all green when run directly.

Verified: failures are platform/worktree dependency noise, not introduced by this task's test-only change.
