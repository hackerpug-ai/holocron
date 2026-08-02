# REDHAT-FIX-S29-R2-H04 evidence

## Finding
H-04 HIGH (cycle-2 residual of REDHAT-FIX-S29-H05): `runCrossProcessBlockedWriteProbe`
fell back to in-process `docsCreate` when child stdout was unparseable (`child_pid: null`),
and `runCutoverFreeze` stamped `fence_armed_at` after `rejected` only — without requiring
OS child identity. In-process rejection cannot prove deployment-wide fence propagation.

## Fix
1. **Fail closed**: unparseable child / spawn failure / timeout / missing `rejected` returns
   `rejected:false` with `cross_process_probe_fail_closed:` diagnostic — never in-process
   mutation as arm eligibility.
2. **child_pid gate**: freeze refuses arm unless `typeof child_pid === 'number' && child_pid > 0`.
3. **Harness**: optional `childEvalScript` / `probe.childEvalScript` still uses real OS spawn
   (for RED/GREEN unparseable proof only).

## Verification
- RED: pre-fix mutant → 3 H-04 tests fail (static fallback present; unparseable returns
  rejected:true via in-process; freeze arms on fallback). See `redhat-fix-s29-r2-h04-red.log`.
- GREEN: fail-closed + child_pid → 8/8 `sprint29-fence-arm-order.test.ts` pass.
  See `redhat-fix-s29-r2-h04-green.log`.
- `pnpm tsgo --noEmit` clean; biome clean on touched paths (pre-existing `any` warnings only).

## Artifacts
- freeze-report.json (ok, child_pid number, rejected true)
- r2-h04-ac1-unparseable-probe.json
- r2-h04-ac2-freeze-refuse.json
- r2-h04-ac3-child-pid.json
- r2-h04-source-gate.json
- redhat-fix-s29-r2-h04-red.log / green.log (mirrored under
  `.tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/`)
