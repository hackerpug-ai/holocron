#!/bin/bash
set +e
WT=/Users/inference1/Projects/holocron/.kb-run-sprint/worktrees/D05-04
MAIN=/Users/inference1/Projects/holocron
cd "$WT"
SCRATCH="/tmp/d05-04-pgdata-restore"
BLOB="/tmp/d05-04-blob-restore"
REPORT="$WT/.tmp/D05-04/parity-report.json"
# only stop our scratch if present
if [ -f "$SCRATCH/postmaster.pid" ]; then
  /opt/homebrew/bin/pg_ctl -D "$SCRATCH" stop -m fast -t 10 || true
fi
rm -rf "$SCRATCH" "$BLOB" "${SCRATCH}.holo-pgbackrest"
mkdir -p "$SCRATCH" "$BLOB" "$WT/.tmp/D05-04" /tmp/pgbackrest
/opt/homebrew/bin/psql -d holocron -c "CHECKPOINT; SELECT pg_switch_wal();" >/dev/null 2>&1
sleep 2
TS=$(/opt/homebrew/bin/psql -d holocron -tAc "SELECT to_char((now() - interval '90 seconds') AT TIME ZONE 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"');")
echo "TARGET_TS=$TS" | tee "$WT/.tmp/D05-04/target-ts.txt"
/opt/homebrew/bin/psql -d holocron -c "SELECT pg_switch_wal();" >/dev/null 2>&1
sleep 3
export HOLO_BLOB_ROOT="$MAIN/.tmp/holocron-blobs"
export PATH="/opt/homebrew/bin:$PATH"
/Users/inference1/.bun/bin/bun services/platform/src/cli/holo.ts restore:fire-drill \
  --target-timestamp "$TS" \
  --scratch "$SCRATCH" \
  --blob-dir "$BLOB" \
  --report "$REPORT" \
  --source-blob-root "$MAIN/.tmp/holocron-blobs" \
  --json > "$WT/.tmp/D05-04/fire-drill-run.json" 2>"$WT/.tmp/D05-04/fire-drill-run.stderr"
EC=$?
echo "EXIT:$EC" | tee "$WT/.tmp/D05-04/fire-drill.exit"
exit 0
