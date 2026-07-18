# Sprint 13 Human Gate Results

## VERIFIED — PASS

Run: `2026-07-18T06-52-00Z`  
Main head: `bbcf8a2e4620acdd87ca48b9f16721c2e30b0834`  
Execution surface: `tmux:sprint13-gate`  
Evidence: `.gate-evidence/2026-07-18T06-52-00Z/`

All six mapped gate steps executed and passed. `gate-verification.json` independently recomputes the verdict from the raw logs, exits, command-fidelity hashes, and assertion specs: `verified=true`, `recomputed_verdict=pass`, zero discrepancies.

| Step | Result | Evidence |
|---:|:---:|---|
| 1 | PASS | Real TCP connection to nonprod Postgres and HTTP 2xx from real fleet `/v1/models`; supporting `pnpm test:integration` passed 2 files / 4 tests. |
| 2 | PASS | Closed Postgres and fleet dependency probes failed closed; supporting `pnpm test:integration` exited 1 with zero passed tests. |
| 3 | PASS | Two real `holo db seed --reset` invocations succeeded with identical fingerprint `92a604f5d7824fa2216f9a5902f5d171`, 70 tables, and three fixture IDs. |
| 4 | PASS | `PR_PATH_CONTRACT=PASS`: tests path selects the fast lane; push/PR fast trigger and pre-merge self-hosted integration wiring are present. |
| 5 | PASS | `holo prd:consistency --json`: `ok=true`, 60 tables, 44 tools, 26 unique UCs, no broken links/future claims. |
| 6 | PASS | `actionlint` exit 0 and `check-action-pins.sh` exit 0. |

## Supporting negative controls

The exact documented `pnpm test:integration` invocations are preserved as supporting evidence because the gate verifier rejects wholesale test-runner commands as a substitute for MAP+DRIVE+MONITOR. The positive run exited 0 with 4/4 tests passed; both dependencies unreachable exited 1 and reported 0 passed tests. The gate's verified steps use direct real-service probes, not a test-suite proxy.

## Review and remediation

Parent-controlled adversarial review found and remediated:

1. The original fast lane accidentally ran fail-closed integration tests; `test:unit` now excludes integration globs.
2. Runner status now receives a step-scoped GitHub token and `actions: read` permission.
3. Fork PRs fail closed and never execute on the persistent self-hosted runner.
4. Fleet probes require a successful HTTP response, not merely a TCP connection.

Review report: `.tmp/sprint-13-independent-review-final.md`  
Remediation commits: `a3c3936`, `bbcf8a2`  
Independent evidence review found no unresolved CRITICAL/HIGH findings.
