# Pre-Existing / Substrate Issues (S-REACTIVE-01 remediation c3)

## Typecheck (exit 2)
Worktree monorepo root `pnpm typecheck` fails on platform `.ts` import extensions and peer module resolution. RN polyfill + hooks typecheck clean in isolation.

## Lint (exit 1)
Repo-wide biome diagnostics outside WRITE-ALLOWED paths. Changed product files biome-checked.

## Unit tests
vitest-native path resolution failures pre-exist in narration hooks suites.

## Maestro PRIMARY ACs (harvest-evidence.sh)
AC-1..AC-5 all exit 0 in verification-summary (generator.tool=harvest-evidence.sh).
TC-1 flaked once (same flow as AC-1 which is green); TC-6/TC-7 pre-existing typecheck/lint.
Screenshots under `.tmp/S-REACTIVE-01/S-REACTIVE-01-AC-*.png`.

## Root causes fixed this cycle
- Fleet budget empty → deterministic multi-token `chat_run_events` SSE in nonprod
- Hermes missing Event globals → plain JS polyfill before eventsource
- Drawer stole deep links → bootstrap once only + holocron://chat/* routing
- Stop/assistant visibility after reconnect → runBusy latch + status poll + durable overlay
