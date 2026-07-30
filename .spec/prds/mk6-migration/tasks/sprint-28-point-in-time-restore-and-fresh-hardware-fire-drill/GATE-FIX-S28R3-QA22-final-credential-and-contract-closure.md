# GATE-FIX-S28R3-QA22 — Final credential PATH/argv, restic trust, contracts, hermetic proof

**Task id:** `GATE-FIX-S28R3-QA22`  
**H1 id:** `GATE-FIX-S28R3-QA22`  
**Sprint:** sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill  
**Binding review:** `red-hat-20260730T002820Z-sprint-28-main-sha-6a2a61b9fdcc3d0f890fd722ad3470a6cf4f9aff`  
**Source SHA:** `6a2a61b9fdcc3d0f890fd722ad3470a6cf4f9aff`

## Intent

Close every remaining finding from the binding review:

1. Eliminate credential-ambient PATH/argv execution seams in the human gate stream
2. Make explicit `options.resticBin` obey the root-owned trust boundary
3. Make Sprint requirement contracts discriminating (D05-02..D05-06)
4. Make mandatory live-proof / full-suite sequence hermetic

## Acceptance criteria

- [x] All six `gate-plan.json` commands use absolute `/bin/bash`, `/usr/bin/tee`, `/usr/bin/jq`, absolute docker candidates; `HUMAN-GATE.md` regenerated in parity
- [x] Credential scripts resolve ROOT without bare PATH `dirname`
- [x] Ordered hostile-PATH regression executes the gate credential-ambient fragment with shadow executables and proves no shadow markers
- [x] `options.resticBin` validated via `validateRootOwnedBin`; user-owned absolute refused before credential env; tests inject `runProcess` below trust boundary
- [x] Fire-drill diagnostic redactor never places restore secrets on Python argv (FD 3 transfer + process-argument negative control)
- [x] D05-01..D05-06 `validate_scenario` → zero CRITICAL / zero HIGH
- [x] Probe mutation uses out-of-tree bak + byte-for-byte restore; no tracked `.qa16bak` left dirty
- [x] QA21 closures preserved

## Verify

See implementer VERIFY block (tsc, focused QA22/QA21/qa1, full sprint28, bash -n, py_compile, live R2 when env available, hermetic git status).

## Status

Implemented in worktree `task/GATE-FIX-S28R3-QA22`.
