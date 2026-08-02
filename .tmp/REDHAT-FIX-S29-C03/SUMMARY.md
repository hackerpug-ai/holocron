# REDHAT-FIX-S29-C03 evidence

## Fix
- Real schedule disable/drain before quiet window (`HOLO_CUTOVER_SCHEDULES_DISABLED=1` + `migrationFence/drain.disableAndDrain`)
- Measured post-drain wall-clock wait (`elapsedMs >= windowSeconds*1000`)
- Write oracles from post-drain interval: acceptedWriteCount==0, rejectedWriteCount>0
- `assertQuietCheckConfirmed` refuses pre-fix theatre (no drain / unmeasured window)

## Verification
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts` → exit 0 (5/5)
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-convex-fence.test.ts` → exit 0 (8/8)
- `bun holo cutover:quiet-check --window-seconds 30 --json` → ok with drain.ok, elapsed>=30s, accepted=0 rejected>0
- `pnpm tsgo --noEmit` → exit 0
- `pnpm biome check` on touched paths → clean after format

## Artifacts
- quiet-check-report.json (D06-03 + REDHAT-FIX-S29-C03)
- quiet-drain-test.log, convex-fence-test.log, cli-quiet-check.json
