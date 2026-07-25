# Harvest notes

## Project gates
- typecheck: fails pre-existing (worktree missing drizzle-orm for services/platform); our RN files clean
- lint: fails on unrelated repo-wide diagnostics; changed files pass `biome check`
- test:unit: 949 passed; 3 suites fail pre-existing (vitest-native path, drizzle-orm)

## Maestro ACs
All flows failed at launch: `MAESTRO_APP_ID` unset → "Unable to launch app undefined".
Flows are present and valid under `.maestro/reactive/`. Re-run with:
```
export MAESTRO_APP_ID=com.holocron.app
maestro test .maestro/reactive/token-streaming.yml
```
after seed + platform + Metro.

## Contract tests (this task)
16/16 pass: tests/integration/s-reactive-01-resumable-sse.test.ts
