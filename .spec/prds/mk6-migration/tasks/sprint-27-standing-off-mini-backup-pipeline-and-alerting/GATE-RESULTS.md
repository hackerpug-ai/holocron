# Gate Results: sprint-27

## ✅ VERIFIED — recomputed pass == claimed pass; 10/10 recomputed; 0 discrepancies

**Verdict:** pass
**Steps:** 10/10 passed
**Run:** 2026-07-28T07:54:22Z
**Evidence:** .gate-evidence/20260728T075339Z
**Proof:** gate-verification.json method=verify-gate-evidence.sh:recompute-strong@febb48afeaa2
**SLA step 10:** pure CLI `scripts/gate/s27-step10-production-sla.sh` with `env -u BACKUP_ALERT_OVERDUE_MS` (DEFAULT_OVERDUE_MS=900000)

## Per-step
- Step 1: **pass** (6207ms) — Run a live Postgres write burst via holo backup:wal --json — WAL archives to R2 continuous
- Step 2: **pass** (17217ms) — Run the scheduled base-backup job — full backup lands in the R2 bucket, verified by manife
- Step 3: **pass** (8926ms) — Run the restic blob-mirror job — every local/remote object SHA-256 matches.
- Step 4: **pass** (1134ms) — Kill the backup job mid-archive — alert fires within 15 minutes, no dashboard-polling need
- Step 5: **pass** (763ms) — Let the bucket credential expire in a test fixture — alert fires, not a silent failure. (R
- Step 6: **pass** (658ms) — Remove the backup config entirely — the alert still fires as overdue, never a false-health
- Step 7: **pass** (706ms) — Healthy-run zero-alert silence gate (REDHAT-FIX-S27-06 / D04-05 AC-4 NEVER-tier): seed all
- Step 8: **pass** (2990ms) — Execute D04-01 alerting oracle via REAL holo CLI (not vitest): healthy silence (alerted:0)
- Step 9: **pass** (1458ms) — Install and verify holocron-backup-alert-sweep launchd schedule (≤5min cadence) with ALERT
- Step 10: **pass** (1122ms) — Production 15-minute alert SLA + cadence (REDHAT-FIX-S27-08 / F-8 / T-PLAT-024): BACKUP_AL
