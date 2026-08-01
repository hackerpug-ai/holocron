# D06-03 harvest notes

Automated harvest `verify` shell snippets are not executable one-liners
(`jq .acceptedWriteCount == 0`, `call documents.create`, etc.). Real proof:

| AC/TC | Evidence file | Result |
|-------|---------------|--------|
| AC-1 / TC-1 | freeze-report.json, tc1-env.json | HOLO_MIGRATION_READ_ONLY=1, fence_armed_at>0 |
| AC-1 / TC-2 | tc2-create-fenced.json | migration_read_only: prefix |
| AC-2 / TC-3 | tc3-surface-sweep.json | mutation+action surfaces rejected |
| AC-3 / TC-4,5 | quiet-check-report.json | accepted=0 rejected=2 |
| AC-4 / TC-6 | coverage.json | matches=[] files_scanned=243 |
| AC-5 / TC-7,8,9 | article-baseline.json, tc8-*.json | sha256 64-hex, FENCE_NOT_ARMED, capturedAtMs>fence_armed_at |
| Suite | green-suite-run.txt | 8/8 PLATFORM_IT integration pass |

Hono/MCP/jobs fence is intentionally D06-05 (WRITE-PROHIBITED on this task).
D06-01 Convex TC-12/13 GREEN via message extraction helper.
