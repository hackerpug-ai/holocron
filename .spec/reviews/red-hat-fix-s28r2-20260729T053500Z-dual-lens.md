# REDHAT-FIX-S28R2 dual-lens closeout

- **Source review:** `.spec/reviews/red-hat-20260729T051314Z-sprint-28-post-gate-fix-qa1.md` (CRITICAL-1, HIGH-1..H4)
- **Branch tip reviewed:** `35fbd06de2dfdc38b6b08e6c4eda8ea8a7d5b35b`
- **Base:** `963e439e681b287d923b17e0e614ea41928b1769`

## Lenses

| Lens | Verdict |
|------|---------|
| Product | APPROVED |
| Technical | APPROVED |

## Remediation map

| Finding | Product path |
|---------|----------------|
| CRITICAL-1 | `scripts/run-fire-drill-on-fresh-target.sh` + `holo restore:fire-drill --fresh-target` bind docker volume Mountpoints + attestation |
| HIGH-1 | Refuse zero/empty domain baseline at emit (`buildRecoveryBaseline`) |
| HIGH-2 | Exact restic match + live verify at `resolveFireDrillBaseline` |
| HIGH-3 | Require distinct `R2_RESTORE_*`; no ambient RW fallback |
| HIGH-4 | Mandatory `pitr_sentinel` before≥1 / after=0 (no pending soft-pass) |

## Explicitly out of scope

- **HIGH-5** — satisfied only by a later fresh unchanged six-step human gate. Gate-plan/results/verification and `.gate-evidence` were not hand-edited.

## Hook policy

All accepted commits on this branch used default pre-commit hooks (no `--no-verify` / hooksPath bypass). Task contracts rebuilt as `830cc322` after process correction.
