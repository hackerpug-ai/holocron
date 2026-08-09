# S31-01 evidence summary

## Result
All AC-1..AC-5 integration tests green against real Postgres disposable namespaces.

## Changes
- Renumbered `0030_zero_pub_file_objects.sql` → `0033_zero_pub_file_objects.sql`
- Added ordinal uniqueness+contiguity gate (`checkMigrationOrdinals`, CI-callable)
- Forward migrations: 0034 degraded_mode/retry_queue/mission_degraded_state, 0035 backup_wal_burst, 0036 queue reconcile
- Removed runtime DDL from queue/schema, durable-effect, jobs-runner, wal-archive, degraded-mode-controller
- DEGRADED_MODE_ROW_MISSING loud error in escape guard + controller

## Artifacts
- ac1-*.json — fresh migrate + verify merges
- ac2-*.json — ordinal collision/gap refuse
- ac3-*.json — no-DDL + CLI paths
- ac4-*.json — missing row loud fail + positive decision
- ac5-*.json — queue constraints/indexes/grants

## Verify
PLATFORM_IT=1 vitest sprint31-* → 5/5 passed
tsgo --noEmit clean
