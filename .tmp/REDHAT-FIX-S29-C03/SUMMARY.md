# REDHAT-FIX-S29-C03 evidence

## Dual-lens reject (prior) → remediation

Prior path set `HOLO_CUTOVER_SCHEDULES_DISABLED` and wrote `drain_completed` audit only —
nothing under `convex/` read the flag (bookkeeping theatre).

## Fix
1. **Real schedule disable**: `isCutoverSchedulesDisabled()` in `convex/lib/migrationFence.ts`;
   `fencedInternalMutation` / `fencedInternalAction` (cron/queue/scheduled consumers) call
   `assertSchedulesEnabled` before the write fence. `taskCrons` + `crons.ts` also honor the flag.
2. **Real drain**: `disableAndDrain` fails closed unless env is visible in Convex runtime,
   cancels active tasks + skips queued subscription content, returns `consumersHonored`.
   Client requires `convexDrainOk && consumersHonored && probe.skipped` (not env-set alone).
3. **Measured quiet window**: full wall-clock wait after drain; `acceptedWriteCount==0` and
   `rejectedWriteCount>0` from post-drain interval.
4. **assertQuietCheckConfirmed** refuses theatre without `consumersHonored` / `convexDrainOk`
   / measured elapsed.

## Verification
- `PLATFORM_IT=1 pnpm vitest run --project integration --fileParallelism=false services/platform/tests/integration/sprint29-quiet-drain.test.ts services/platform/tests/integration/sprint29-convex-fence.test.ts` → 13/13 pass
- `bun holo cutover:quiet-check --window-seconds 30 --json` → ok with drain.ok, consumersHonored, elapsed≥30s, accepted=0 rejected>0
- `pnpm tsgo --noEmit` → exit 0
- `pnpm biome check` on touched paths → clean

## Artifacts
- quiet-check-report.json, cli-quiet-check.json
- quiet-drain-test / combined-tests / convex-fence-test logs
- ac1–ac5 evidence JSON
