# Gate Results: sprint-27

## ✅ VERIFIED — recomputed pass == claimed pass; 6/6 recomputed; 0 discrepancies

**Verdict:** pass  
**Steps:** 6/6 passed  
**Run:** 2026-07-28T02:48:50Z  

## Per-step
- Step 1: pass — Run a live Postgres write burst — WAL archives to R2 continuously, zero continui
- Step 2: pass — Run the scheduled base-backup job — full backup lands in the R2 bucket, verified
- Step 3: pass — Run the restic blob-mirror job — every local/remote object SHA-256 matches.
- Step 4: pass — Kill the backup job mid-archive — alert fires within 15 minutes, no dashboard-po
- Step 5: pass — Let the bucket credential expire in a test fixture — alert fires, not a silent f
- Step 6: pass — Remove the backup config entirely — the alert still fires as overdue, never a fa
