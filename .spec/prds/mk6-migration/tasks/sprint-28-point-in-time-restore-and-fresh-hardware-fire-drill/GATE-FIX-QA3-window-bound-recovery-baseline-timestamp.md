# GATE-FIX-QA3 — Recovery baseline target_timestamp must be recoverable in live pgBackRest/WAL window

> Status: ⬜ Pending  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer  
> Reviewer: code-reviewer + product-manager  
> Priority: P0  
> Proposed By: independent Terra High QA fail `20260729T061718Z` (+ rearm precondition `20260729T062200Z`) on main after GATE-FIX-QA2  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes  

## Outcome

Emit and select recovery baselines whose **`target_timestamp` is bound to real pgBackRest backup/archive window metadata** (e.g. latest backup stop / `queryPitrWindow().recommended_pitr`), so a baseline that is restic-verified and domain-meaningful is also **selectable** when fire-drill uses the live in-window `PITR_TIMESTAMP`.

**Root defect (verified):** emitted baseline `c5101e1c…` has `target_timestamp=2026-07-29T06:17:48.998Z` (wall clock) while live window latest/recommended is `2026-07-29T00:28:02Z`. Discovery correctly requires `baseline.target_timestamp <= drill target` → **zero candidates** → steps 3–5 fail. Not scratch hygiene (step1 empty-scratch is disposable).

## Evidence (immutable — do not rewrite)

- Fail run: `.gate-evidence/20260729T061718Z/` · `gate-results.json` run_id `20260729T061718Z`  
- Rearm precondition: `.gate-evidence/20260729T062200Z/precondition-window.log` (latest=`2026-07-29T00:28:02Z`)  
- `.gate-evidence/20260729T062200Z/baseline-r2-load.log` (baseline target_timestamp `2026-07-29T06:17:48.998Z`, restic listable)  
- Step3: `no recovery baseline with target_timestamp <= 2026-07-29T00:28:02Z among 5 R2 keys`  
- QA surface `9902F5C7-2966-4D5A-89AC-42A84703CA74` · session `019fac77-25d8-7913-af17-368dd38f5c4b`

## MUST

- MUST bind baseline `target_timestamp` (and emit default) to live pgBackRest window / backup-stop metadata — **never** wall-clock `new Date()` when that is after window latest  
- MUST fail closed if no recoverable timestamp can be resolved (missing window / empty labels)  
- MUST keep restic exact listable verify, non-zero domain refuse, and discovery fail-closed for ghosts  
- MUST keep `target_timestamp <= drill target` selection honesty (do not accept future baselines by weakening the comparator)  
- NEVER hand-edit/fabricate timestamps into R2 objects outside product emit  
- NEVER edit `gate-plan.json`, `gate-results.json`, `gate-verification.json`, `GATE-RESULTS.md`, `.gate-evidence/**`  
- NEVER `--no-verify` / hook bypass  

## ACs

### AC-1 [PRIMARY] — Emit uses recoverable target_timestamp
GIVEN live pgBackRest window with `recommended_pitr` / latest stop  
WHEN `emitLiveRecoveryBaseline` / `buildRecoveryBaseline` (without explicit targetTimestamp) runs  
THEN baseline.target_timestamp equals window recommended/latest (or backup-stop for bound label), **≤ window latest**, not wall clock after latest  

### AC-2 — Fail closed when window unresolvable
GIVEN pgBackRest info yields no labels/latest  
WHEN emit runs  
THEN ok:false, no R2 upload  

### AC-3 — Selectable by fire-drill at recommended PITR
GIVEN a baseline emitted under AC-1 with listable restic + non-zero domain  
WHEN resolveFireDrillBaseline runs with targetTimestamp = that recommended_pitr  
THEN a restic-verified candidate is loaded (not “no baseline with target_timestamp ≤ …”)  

### AC-4 — Typecheck/lint clean  

## VERIFY

```bash
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-gate-fix-qa3.test.ts
pnpm tsgo --noEmit
pnpm biome check services/platform/src/backup/ services/platform/tests/integration/sprint28-gate-fix-qa3.test.ts
```

## WRITE-ALLOWED

- `services/platform/src/backup/recovery-baseline.ts`
- `services/platform/src/backup/restore.ts` (window helpers only if needed)
- `services/platform/src/backup/base-backup.ts` / `restic-mirror.ts` (pass window-bound timestamp into hooks if they still use wall clock)
- `services/platform/src/backup/index.ts`
- `services/platform/src/cli/holo.ts` (only if emit CLI needs flags)
- `services/platform/tests/integration/sprint28-gate-fix-qa3.test.ts` (NEW)
- task/SPRINT/review notes under sprint-28 + `.spec/reviews/`
- `.tmp/GATE-FIX-QA3/**` local only

## WRITE-PROHIBITED

- `gate-plan.json`, gate results/verification, GATE-RESULTS.md, `.gate-evidence/**`
- Unrelated Sprint 27 / `.tmp/D05-*` / surface 137

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-QA3",
  "qa_run_id": "20260729T061718Z",
  "rearm_run_id": "20260729T062200Z",
  "requirements": [{"id":"AC-1"},{"id":"AC-2"},{"id":"AC-3"},{"id":"AC-4"}],
  "tdd_mode": "red_first"
}
-->
