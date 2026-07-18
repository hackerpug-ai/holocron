# Invalidated — do not use for gate decisions

- Any verification-summary with commit_sha=4de1909 (unreferenced)
- green_commit_sha=461ee82 alone as post-merge bound without raw exit proof
- Seeded JSON (ac*-seeded-*.json) as exit proof (no raw process status)
- tee / && masked EXIT:$? smokes
- review-verdict.json / APPROVED claims
- Pre-correction status completed / green handoff

Only `.tmp/obs-4/raw-exit-evidence/` + hash-bound verification-summary after corrective commit are admissible.
