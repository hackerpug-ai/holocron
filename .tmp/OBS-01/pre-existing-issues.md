# Pre-existing issues (OBS-01 harvest)

Recorded during `pnpm test` suite harvest on 2026-08-20. These failures are outside OBS-01 write-allowed paths and were present without OBS-01 changes:

- Multiple Sprint 28 GATE-FIX integration suites fail without operator `.env` / PLATFORM_IT=1 (QA25/QA26/QA27/QA9/QA31/QA33) — refuse-soft-pass and credentialed fire-drill paths.
- Sprint 29 compose Docker-backed evidence and Sprint 31 MCP idempotent replay require PLATFORM_IT=1 / Docker artifacts not provisioned in this worktree harvest.
- Full-suite result captured in `test-output.txt`: 88 failed | 161 passed | 130 skipped files; EXIT_CODE:1.
- OBS-01 scoped verifies (AC-1..AC-4 / TC-1..TC-4) are independent of those suite failures and were re-run by harvest via verify-manifest.json.
