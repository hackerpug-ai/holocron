# REDHAT-FIX-S28R3 dual-lens approval

**Task:** REDHAT-FIX-S28R3 — Bind six-step gate to provisioned fresh-target volumes + live distinct R2_RESTORE_*  
**Branch tip:** `7664f715fd669e8686c88d464385169c87f970ad`  
**Base:** `e1e9221114c877cbb6f865de31c58cdf18000ce3`  
**Source review:** `red-hat-20260729T075401Z-sprint-28-final-independent-terra.md` (NEEDS-FIXES CRITICAL-1 + HIGH-1)

## Lenses

| Lens | Agent | Verdict |
|------|-------|---------|
| technical | code-reviewer | **APPROVED** |
| product / test-reality | product-manager | **APPROVED** |

Artifacts: `.tmp/REDHAT-FIX-S28R3/technical-verdict.json`, `product-verdict.json`, `review-lenses.json`.

## Disposition

- **CRITICAL-1 closed:** gate-plan step3 → `run-fire-drill-on-fresh-target.sh` + attestation; steps 4–5 read volume-bound parity report; strong jq predicates preserved.
- **HIGH-1 closed:** gate-plan step2 → `REQUIRE_LIVE_R2_RO=1`, distinct `R2_RESTORE_*` only, `prove-r2-readonly.sh` + fail-closed isolation; no `ro-test` green path.
- **Residual:** `DEPENDENCY-S28-R2-RO` — project secrets have ambient RW R2 only; `R2_RESTORE_*` and mint parents absent. Live step2 fails closed until human mints object-read-only restore credentials. No fabricated keys.

## MEDIUM (advisory, non-blocking)

Technical: live PLATFORM_IT still resolve-only for full fire-drill body; static gate-plan contracts catch host-.tmp / ro-test regressions.
