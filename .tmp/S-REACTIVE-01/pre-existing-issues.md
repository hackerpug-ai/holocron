# Pre-Existing / Substrate Issues (S-REACTIVE-01)

## Typecheck (exit 2)
Worktree missing `drizzle-orm` for `services/platform` paths — pre-existing env gap, not introduced by this task. RN/hook files under WRITE-ALLOWED are not the source of the failure.

## Lint (exit 1)
Repo-wide biome diagnostics; changed task files pass targeted biome check.

## Maestro e2e (AC-1..5 / TC-1..5 exit 1)
`MAESTRO_APP_ID` unset → "Unable to launch app undefined". Flows under `.maestro/reactive/` are present. Re-run with:
```
export MAESTRO_APP_ID=com.holocron.app
# Metro + platform + holo seed:e2e --reset + app install required
maestro test .maestro/reactive/token-streaming.yml
```

## Contract tests (task-local)
`pnpm exec vitest run tests/integration/s-reactive-01-resumable-sse.test.ts` → 16/16 pass after GREEN (edb0ae64).
RED against start (7dc40a0f): 11 failed | 5 passed (maestro yml existence only).
