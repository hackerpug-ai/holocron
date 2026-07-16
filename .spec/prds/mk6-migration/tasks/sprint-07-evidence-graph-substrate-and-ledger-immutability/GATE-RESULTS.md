# Gate Results: sprint-07-evidence-graph-substrate-and-ledger-immutability

## ✅ VERIFIED — recomputed pass == claimed pass; 7/7 recomputed; 0 discrepancies

proof: `.spec/prds/mk6-migration/tasks/sprint-07-evidence-graph-substrate-and-ledger-immutability/gate-verification.json`

| Field | Value |
|-------|-------|
| **Date** | 2026-07-15T20:51:49Z |
| **Sprint** | sprint-07-evidence-graph-substrate-and-ledger-immutability |
| **Main SHA** | `b4ac1603fbe17673afbc442ae034a86d449b9c0f` |
| **Environment** | real Postgres @ 127.0.0.1:5432/holocron; product pool `holocron_app` |
| **Exec pane** | surface:269 (`A283A7EA-DD08-4340-AF76-0C3E86379CA9`) |
| **UI driver** | none (terminal/CLI gate) |
| **Evidence dir** | `/tmp/holocron-gate-sprint-07-evidence-graph-substrate-and-ledger-immutability-fresh` |
| **Verdict** | **pass** (verified:true) |

## Summary

| Metric | Count |
|--------|------:|
| ✅ Pass | 7 |
| ❌ Fail | 0 |
| 🔧 Wiring gap | 0 |
| **Steps executed** | **7/7** |

## Per-Step Results

| # | Gate | Method | Result | Evidence |
|---|------|--------|--------|----------|
| 1 | `holo evidence:seed` — claim + 2 contradicting passages | real-cli | ✅ pass | exit=0, beliefId present · `/tmp/holocron-gate-sprint-07-evidence-graph-substrate-and-ledger-immutability-fresh/step1.log` |
| 2 | `holo evidence:belief --as-of now` — net current belief | real-cli | ✅ pass | exit=0, beliefId + netSupport · `/tmp/holocron-gate-sprint-07-evidence-graph-substrate-and-ledger-immutability-fresh/step2.log` |
| 3 | `holo db:probe --raw UPDATE beliefs…` — DML denied | real-cli | ✅ pass | ERROR 42501 permission denied · `/tmp/holocron-gate-sprint-07-evidence-graph-substrate-and-ledger-immutability-fresh/step3.log` |
| 4 | `holo evidence:revise` — close predecessor, insert successor | real-cli | ✅ pass | exit=0, successorId · `/tmp/holocron-gate-sprint-07-evidence-graph-substrate-and-ledger-immutability-fresh/step4.log` |
| 5 | concurrent `evidence:revise` — one wins, stale rejected | real-cli | ✅ pass | concurrent_exits=1,0; open_count=1; REVISE_STALE_CONCURRENT · `/tmp/holocron-gate-sprint-07-evidence-graph-substrate-and-ledger-immutability-fresh/step5.log` |
| 6 | `evidence:belief --as-of <earlier-tx>` — pre-revision belief | real-cli | ✅ pass | pre-revision statement "Quarterly revenue…" · `/tmp/holocron-gate-sprint-07-evidence-graph-substrate-and-ledger-immutability-fresh/step6.log` |
| 7 | `evidence:register-doc` — canonical passages, no dup corpus | real-cli | ✅ pass | ok:true, passagesCreated:0, self_sourced · `/tmp/holocron-gate-sprint-07-evidence-graph-substrate-and-ledger-immutability-fresh/step7.log` |

## Failures

None.

## Notes

- Gate executed against remediated main head `b4ac1603fbe17673afbc442ae034a86d449b9c0f` (REDHAT-FIX H1/H2/H3).
- Steps driven via cmux exec pane + `exec-step.sh` (not agent in-session Bash).
- Step 3: human-observable `ERROR 42501 permission denied` on direct belief UPDATE as `holocron_app`; pane exit capture records 0 under zsh process-substitution (CLI still fails closed; log is the proof).
- Step 5: concurrent revise produced one commit + one `REVISE_STALE_CONCURRENT` rejection; open belief count remained 1.
- Step 6: as-of mid-window before first revision returned original seed statement (audit chain intact).
- Step 7: GIVEN existing passages tagged with document_id (app-role UPDATE on passages, not beliefs); register-doc linked without creating passages.

## Session Video

N/A (no UI steps).

## Wiring Gaps

None.
