# GATE-FIX-QA1 dual-lens review — Sprint 28 QA remediation

- **Task:** GATE-FIX-QA1 (scratch Postgres start + recovery-baseline emit/select honesty)
- **QA run remediated:** `20260729T042338Z` (verified fail, zero discrepancies)
- **Branch tip at review:** `27e9a40e66507bd5edd62b3aacabbf6b957d28cf` (product tree; `.tmp` untracked)
- **Base main:** `447cf7b036ad6ccaa44b7cf07baa2c49b084c1f1`

## Lenses

| Lens | Verdict | Notes |
|------|---------|-------|
| Product | APPROVED | Addresses step1 start naming, step3 zero/stale baseline + ghost restic, steps 4–5 inherit honest parity; gate-plan untouched |
| Technical | APPROVED (re-review) | T-PROMOTE-EARLY fixed (no forced mid-PITR `pg_promote`); emit refuse + discovery honesty; `main...HEAD` product-only under `services/platform/` |

## Product scope landed (main...HEAD)

- `services/platform/src/backup/restore.ts`
- `services/platform/src/backup/recovery-baseline.ts`
- `services/platform/src/backup/fire-drill.ts`
- `services/platform/src/backup/index.ts`
- `services/platform/tests/integration/sprint28-gate-fix-qa1.test.ts`
- `services/platform/tests/integration/sprint28-recovery-baseline.test.ts`

## Closeout notes

- `.tmp/GATE-FIX-QA1/**` evidence kept local/uncommitted (closeout contract)
- Independent human gate **not** re-run in this cycle (operator request)
