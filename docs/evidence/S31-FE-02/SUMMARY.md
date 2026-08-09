# S31-FE-02 E2E Remediation Evidence

**Date**: 2026-08-09  
**Land tip (rebased onto main)**:   
**Pre-rebase dual-APPROVED tip**: `ed06517f746f3b93494a64dc90e3b3e69e9391e6`  
**Evidence commit (pre-rebase)**: `82c6475fa1f7de9156838e023f2fd1072a258b0b`  
**Base implementation (pre-rebase)**: `e0d8c1315897c91a4514729754eca21ca0b90ea1`

## Land conflict resolution
Rebased onto `main` (includes S31-FE-05). Conflict in `.maestro/research/session-loads.yml`
resolved by preserving **both**:
- **FE-05 AC-5**: `research-detail-view`, topic `E2E Active Research: Native resilience`, `research-progress-bar`
- **FE-02 AC-3 R39**: non-optional `Research session not found` absent; `research-detail-error` must not appear on healthy path

Post-rebase session-loads smoke: **PASS** (52s, stack available).

## Stack
- Metro :8081 (S31-FE-02 worktree, `--dev-client --clear`)
- zero-cache :4848 (scripts/run-zero-cache.sh; LAN sim via host 127.0.0.1)
- Platform/Mastra :4111
- Postgres holocron_nonprod
- iPhone 17 sim `C79BF38C-D353-46A2-A1ED-CCA6D68E1B04`
- Device Metro URL: `http://192.168.1.160:8081`

## Harness fixes
1. **PONR-safe seed**: `seed:e2e --reset` blocked by `PONR_IMMUTABLE` truncate guard → upsert fallback `seedE2eDatabase({reset:false})`.
2. **Port-holder**: after zero bootout, occupy :4848 so zero cannot rebind mid-run (was loading offline SQLite rows).
3. **Cold cache wipe**: delete on-device `Documents/SQLite` Zero replica before Maestro.
4. **Dev Client connect**: FE-05 LAN Metro + Open dialog pattern; non-optional loading asserts on zero-down path.
5. **Watchdog timer**: survive effect re-runs without resetting deadline while still pending.

## Maestro results (junit failures=0)
| AC | Flow | Result | Time | Evidence |
|----|------|--------|------|----------|
| AC-1/AC-2 | `.maestro/reactive/zero-down-terminal-error.yml` via `run-zero-down-terminal-error.sh` | PASS | 103s | maestro-zero-down-junit.xml, S31-FE-02-AC-1/AC-2 png |
| AC-3 R39 | `.maestro/research/session-loads.yml` | PASS | 49s | maestro-session-loads-junit.xml, S31-FE-02-AC-3-session-loads-r39.png |
| AC-6 | `.maestro/chat/thread-loads.yml` | PASS | 48s | maestro-thread-loads-junit.xml, S31-FE-02-AC-6-thread-loads.png |

## Oracles observed
- **AC-1**: `Loading research session...` then `Research session not found` + `research-detail-go-back`; loading gone. Zero keepalive failed for full run.
- **AC-2**: `chat-degraded-banner` + `chat-degraded-message`; `chat-loading-inline` not visible.
- **AC-3**: topic `E2E Active Research: Native resilience` with healthy zero; `Research session not found` never shown.
- **AC-6**: seeded chat text `Hello from E2E Conversation Alpha` / title; `chat-degraded-banner` not visible.
- **AC-4**: integration contracts + e2e single banner on zero-down chat path.
- **AC-5**: unit suite 4/4 pass.

## Unit / integration
- `pnpm test:unit -t useZeroRowWatchdog` → 4 passed
- `PLATFORM_IT=1 pnpm test:integration tests/integration/s31-fe-02-zero-error-representable.test.ts` → 4 passed
