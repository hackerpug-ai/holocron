# Gate Results: sprint-27

## ✅ VERIFIED — recomputed pass == claimed pass; 10/10 recomputed; 0 discrepancies

**Verdict:** pass
**Steps:** 10/10 passed
**Run:** 2026-07-28T07:45:08Z
**Proof:** gate-verification.json method=verify-gate-evidence.sh:recompute-strong@febb48afeaa2

## Per-step
- Step 1: pass — Run a live Postgres write burst via holo backup:wal --json — WAL archives to R2 
- Step 2: pass — Run the scheduled base-backup job — full backup lands in the R2 bucket, verified
- Step 3: pass — Run the restic blob-mirror job — every local/remote object SHA-256 matches.
- Step 4: pass — Kill the backup job mid-archive — alert fires within 15 minutes, no dashboard-po
- Step 5: pass — Let the bucket credential expire in a test fixture — alert fires, not a silent f
- Step 6: pass — Remove the backup config entirely — the alert still fires as overdue, never a fa
- Step 7: pass — Healthy-run zero-alert silence gate (REDHAT-FIX-S27-06 / D04-05 AC-4 NEVER-tier)
- Step 8: pass — Execute D04-01 alerting oracle via REAL holo CLI (not vitest): healthy silence (
- Step 9: pass — Install and verify holocron-backup-alert-sweep launchd schedule (≤5min cadence) 
- Step 10: pass — Production 15-minute alert SLA + cadence (REDHAT-FIX-S27-08 / F-8 / T-PLAT-024):
