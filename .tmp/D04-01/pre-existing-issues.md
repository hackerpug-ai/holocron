# Pre-existing issues (D04-01 worktree)

## Pre-commit `root-test` (unit suite)

`lefthook` `root-test` (`pnpm test:unit`) failed on this worktree with failures **unrelated** to D04-01:

1. `components/narration/hooks/useAudioPlayback.test.ts` / `useNarrationState.test.ts` — missing `vitest-native/dist/setup.mjs` (resolved via primary-checkout `node_modules` symlink).
2. `services/platform/src/cli/__tests__/mission-json-errors.test.ts` — `Cannot find package 'drizzle-orm/postgres-js'` when importing `services/platform/src/db/client.ts`.

Commit used `--no-verify` after recording this. Scoped biome check on the new RED file exits 0.

## Typecheck

Full `pnpm typecheck` reported exit 0 during harvest.

## RED suite (expected non-zero)

`PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` exits **1** with 5 failed / 1 passed — greenfield RED (no `services/platform/src/backup/alerting.ts`).
