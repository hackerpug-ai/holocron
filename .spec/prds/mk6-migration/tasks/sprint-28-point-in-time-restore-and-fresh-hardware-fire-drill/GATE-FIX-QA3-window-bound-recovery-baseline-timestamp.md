# GATE-FIX-QA3 — Truthfully recoverable recovery baseline (window-bound, no temporal relabeling)

> Status: ⬜ Pending  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer  
> Reviewer: code-reviewer + product-manager  
> Priority: P0  
> Proposed By: independent Terra High QA fail `20260729T061718Z` (+ rearm precondition `20260729T062200Z`) on main after GATE-FIX-QA2  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes  

## Outcome

Produce recovery baselines whose **entire payload** (target_timestamp **and** row counts, ledger digest, blob manifest, restic snapshot id, pgBackRest label/LSN) is **truthfully recoverable** at that target_timestamp within the live pgBackRest/WAL window.

When fire-drill runs with in-window `PITR_TIMESTAMP` (e.g. window `recommended_pitr`), discovery can load a restic-verified, domain-meaningful baseline whose bound stop is not “after” the drill target — **without** green-washing via timestamp-only relabeling.

## Anti-pattern (explicitly forbidden)

**Temporal relabeling:** replacing wall-clock `target_timestamp` with an older `recommended_pitr` / backup stop while **retaining** row counts, ledger SHA-256, blob_manifest_sha256, or restic_snapshot_id that were captured **later** than that stop.

That can make selection green (`target_timestamp <= drill`) while restored-as-of state cannot match the labeled baseline (false parity).

## Root defect (verified)

| Fact | Value |
|------|--------|
| Fail run | `20260729T061718Z` · steps 3–5 fail (2/6) |
| Rearm window | `20260729T062200Z` · latest/recommended `2026-07-29T00:28:02Z` |
| Emitted baseline | id `c5101e1c…` · `target_timestamp=2026-07-29T06:17:48.998Z` · restic listable |
| Step3 | `no recovery baseline with target_timestamp <= 2026-07-29T00:28:02Z among 5 R2 keys` |

Emit used wall clock after last backup stop. Selection correctly filtered; no honest candidate remained.

Evidence (immutable — do not rewrite):
- `.gate-evidence/20260729T061718Z/`
- `.gate-evidence/20260729T062200Z/precondition-window.log`
- `.gate-evidence/20260729T062200Z/baseline-r2-load.log`
- QA surface `9902F5C7-2966-4D5A-89AC-42A84703CA74` · session `019fac77-25d8-7913-af17-368dd38f5c4b`

## Acceptable implementation patterns (pick one or combine)

1. **Capture-then-cover:** Capture parity inputs at time T, then create/verify **real** pgBackRest backup + WAL archiving that covers through T; bind `target_timestamp` (and label/LSN) only to that post-capture backup/archive metadata; bind restic snapshot only if taken as part of the same coordinated snapshot moment (or proven co-temporal).

2. **Restore/as-of derive:** Choose a recoverable backup stop S inside the live window; restore/query as-of S (or equivalent as-of evidence) to derive row counts + ledger digest + blob binding that reflect state **at S**; bind restic to a snapshot that is truthful for that same coordinated point (or prove blob manifest from the restorable set).

Either way: **one coherent recoverable point**, not mixed timelines.

## MUST

- MUST ensure baseline payload is jointly truthful at `target_timestamp` (counts, ledger, blob manifest, restic id, pgBackRest label/LSN)
- MUST bind `target_timestamp` only to real backup/archive metadata that proves recoverability for that payload
- MUST fail closed when coverage cannot be established (no backup/WAL through capture point; cannot derive as-of state)
- MUST preserve exact listable restic selection (no ghost acceptance)
- MUST preserve discovery honesty: do not weaken `target_timestamp <= drill target` to pass false baselines
- MUST NOT merely overwrite `target_timestamp` with older recommended_pitr while keeping later-captured digests/counts/restic
- NEVER edit `gate-plan.json` / gate results / verification / GATE-RESULTS.md / `.gate-evidence/**`
- NEVER `--no-verify` or other hook bypass

## ACs

### AC-1 [PRIMARY] — Coherent recoverable emit
GIVEN live pgBackRest + restic + domain data  
WHEN recovery baseline emit runs (CLI emit and/or backup hooks)  
THEN uploaded baseline has:
- `target_timestamp` recoverable in live window (≤ window latest / within real archive coverage for that stop)
- row_counts, ledger_sha256, blob_manifest_sha256, restic_snapshot_id, pgbackrest_backup_label all bound to that **same** recoverable point (not mixed later live state with older stop label)
- restic id listable via exact verify  

### AC-2 — Negative: no temporal relabeling of later state
GIVEN live domain/blob state that has **changed after** backup stop S  
WHEN code would label that later-captured payload with `target_timestamp=S`  
THEN emit **refuses** (ok:false, no upload) — later live changes cannot be accepted as a truthful baseline for older stop S  

### AC-3 — Fail closed without coverage
GIVEN no real backup/WAL coverage can be established for the capture point  
WHEN emit runs  
THEN ok:false; no fabricated timestamps  

### AC-4 — Fire-drill can select a truthful baseline at recommended PITR
GIVEN AC-1 baseline in R2 and drill target = window recommended_pitr  
WHEN resolveFireDrillBaseline / fire-drill discovery runs  
THEN a restic-verified, meaningful baseline with `target_timestamp <=` drill is loaded (not empty “among N keys”)  

### AC-5 — Typecheck/lint clean  

## Test criteria

| ID | Statement |
|----|-----------|
| TC-1 | RED then GREEN for coherent emit (AC-1) |
| TC-2 | **Required negative:** later live DB/blob changes cannot be labeled as older backup stop and accepted (AC-2) |
| TC-3 | Missing coverage → refuse emit (AC-3) |
| TC-4 | Selection at recommended_pitr loads window-truthful baseline when one exists (AC-4) |

## VERIFY

```bash
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-gate-fix-qa3.test.ts
pnpm tsgo --noEmit
pnpm biome check services/platform/src/backup/ services/platform/tests/integration/sprint28-gate-fix-qa3.test.ts
```

## WRITE-ALLOWED

- `services/platform/src/backup/recovery-baseline.ts`
- `services/platform/src/backup/restore.ts` (window helpers only if needed)
- `services/platform/src/backup/base-backup.ts`, `restic-mirror.ts` (coordinated emit hooks)
- `services/platform/src/backup/index.ts`
- `services/platform/src/cli/holo.ts` (emit path only if needed)
- `services/platform/tests/integration/sprint28-gate-fix-qa3.test.ts` (NEW)
- task/SPRINT/review under sprint-28 + `.spec/reviews/`
- `.tmp/GATE-FIX-QA3/**` local only

## WRITE-PROHIBITED

- `gate-plan.json`, gate-results/verification, GATE-RESULTS.md, `.gate-evidence/**`
- Unrelated Sprint 27, `.tmp/D05-*`, surface 137

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-QA3",
  "qa_run_id": "20260729T061718Z",
  "rearm_run_id": "20260729T062200Z",
  "requirements": [
    {"id": "AC-1"},
    {"id": "AC-2"},
    {"id": "AC-3"},
    {"id": "AC-4"},
    {"id": "AC-5"}
  ],
  "tdd_mode": "red_first",
  "forbidden_pattern": "temporal_relabel_wall_clock_payload_to_older_stop"
}
-->
