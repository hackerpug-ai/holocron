# REDHAT-FIX-S28R2-H2 — Exact restic existence at baseline selection (HIGH-2)

> Status: ⬜ Pending · Agent: devops-engineer · Priority: P0  
> Source: red-hat-20260729T051314Z HIGH-2 · TDD: red_first  

## Outcome
Fire-drill baseline **discovery/selection** must call live restic snapshot verification and accept only **exact** id/short_id matches (no `startsWith` ambiguity). Ghost/nonzero-count baselines with missing restic IDs must lose to valid siblings or fail closed.

## MUST
- MUST invoke `verifyResticSnapshotInRepo` (or equivalent) during `resolveFireDrillBaseline` candidate ranking when restic is reachable
- MUST match only exact full id or exact short_id equality (remove `needle.startsWith(short)` / over-permissive prefix extension)
- MUST add tests: nonzero ghost candidate vs valid candidate → valid wins; pure ghost set → fail closed  

## ACs
### AC-1 Exact match only in verifyResticSnapshotInRepo
### AC-2 Selection filters unlistable restic IDs
### AC-3 Test covers ghost nonzero vs valid  

## VERIFY
`PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-gate-fix-qa1.test.ts -t 'restic|select|ghost|exact'`

## WRITE-ALLOWED
`services/platform/src/backup/recovery-baseline.ts`, `fire-drill.ts`, `sprint28-gate-fix-qa1.test.ts`

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"REDHAT-FIX-S28R2-H2","requirements":[{"id":"AC-1"},{"id":"AC-2"},{"id":"AC-3"}],"tdd_mode":"red_first"}
-->
