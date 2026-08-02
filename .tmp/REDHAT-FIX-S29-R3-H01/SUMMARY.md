# REDHAT-FIX-S29-R3-H01 — Honest drain inventory / unknown residual fail-closed

## Finding
`drain.ts` claimed `crons/queues/outbox/scheduled_jobs` but only residual-sampled
`tasks` + `subscriptionContent`. Unmeasured surface claims are theatre.

## Fix (honest inventory path)
1. **Measured inventory only**: `CUTOVER_DRAIN_SURFACES = ['tasks','subscriptionContent']`
   mapped to residual counters (active/running tasks + queued subscriptionContent).
2. **Unknown residual fails closed**: requesting `crons|queues|outbox|scheduled_jobs`
   (or any unmeasured label) returns `ok:false`, empty `surfaces[]`, negative residual sentinels.
3. **surfaces[] honesty**: report only names actually drained + re-sampled to residual 0.
4. **Client + export watermark**: `drainSurfacesHonest` / `drainResidualZero` refuse
   unmeasured claims and missing residual inventory before quiet/export.

## Verification
- `PLATFORM_IT=1 pnpm vitest run --project integration --fileParallelism=false services/platform/tests/integration/sprint29-quiet-drain.test.ts` → 14/14 pass
- Evidence: r3-h01-*.json, quiet-check-report-r3-h01.json, quiet-drain-test.log
- `pnpm tsgo --noEmit` → exit 0
- biome on touched paths → clean (pre-existing any warnings only)

## Artifacts
- r3-h01-multi-surface-residual-zero.json
- r3-h01-unknown-residual-fail-closed.json
- r3-h01-green.log
- r3-h01-prefix-theatre-surfaces.json
- quiet-check-report-r3-h01.json
