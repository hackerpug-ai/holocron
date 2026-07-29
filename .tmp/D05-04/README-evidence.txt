D05-04 CAP-BAK-01 fire-drill evidence
=====================================
Live run: holo restore:fire-drill --target-timestamp 2026-07-29T00:01:02Z
  --scratch /tmp/d05-04-fire-scratch
  --blob-dir /tmp/d05-04-blob-restore
  --source-blob-root /Users/inference1/Projects/holocron/.tmp/holocron-blobs
  --report .tmp/D05-04/parity-report.json

Results (parity-report.json / SUMMARY.json):
  POSTGRES_PARITY_PASS=true
  LEDGER_CHECKSUM_MATCH=true
  BLOB_PARITY_PASS=true
  matched_objects=11
  ledger_checksum=cdf21cb6fc6b2177cb673dd3aa0e4b72
  row_counts: beliefs=8 sources=8 passages=19 claims=5 relations=11 file_objects=5 entities=0

Key artifacts:
  parity-report.json, pre-failure-snapshot.json, fire-drill-run.json, SUMMARY.json
  pitr-restore-status.json, typecheck-output.txt, lint-output.txt
