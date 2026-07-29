# Red-Hat Review Report — Sprint 28 (post-redhat-fix)

**Reviewed commit:** `1cd41952578a22f2d4346536d7da4559dec43149` (`1cd41952`)  
**Target:** Sprint 28 — Point-in-Time Restore and Fresh-Hardware Fire Drill  
**Review date:** 2026-07-29T03:01:54Z  
**Prior review:** `.spec/reviews/red-hat-20260728T235155Z-sprint-28.md` (findings C1–C5, H1–H5)  
**Review mode:** read-only adversarial (no product edits)  
**Verdict:** **NEEDS_FIXES** — prior CRITICAL surface largely closed; **one material HIGH residual** reopens C-5 consumer path (fire-drill still MD5 + live-mini pre-failure oracle; does not load R2 recovery baseline).

## Review basis

- Diff / history since prior SHA `a9b5b6e7…`: D05-02…D05-06 landings + REDHAT-FIX-C1…C5 + H1…H5 merges on `main`.
- Live CLI smoke of `holo restore --pitr` / `restore:fire-drill` (no mocks).
- Source inspection of restore/fire-drill/recovery-baseline/config, isolation/creds scripts, mission template, D05 contracts, gate evidence.
- Stub greps on `services/platform/src/backup/` and sprint28 tests (no fake-success execute stubs; no `@mastra` mocks; no `z.any()` in backup path).

Per explicit review constraint: no task checkbox flips, no product/task edits.

## Executive summary

Sprint 28 is no longer a RED-only skeleton. At `1cd41952` the operator surface exists: `holo restore --pitr`, `restore:fire-drill`, fresh-target provisioners, multi-axis isolation, sacrificial RO credential negatives, exact restore ARNs, mission + runbook, and a SHA-256 recovery-baseline **emitter**.

Prior **C1–C4, H1–H5** are **RESOLVED** in code (with documented env residual DEPENDENCY-S28-R2-RO).

**C5 is only partially closed:** `recovery-baseline.ts` captures collision-resistant baselines into R2 and backup hooks emit them, but **`fire-drill.ts` never imports or loads that baseline**. The CAP-BAK-01 fire-drill path still:

1. snapshots the **live source mini DB** for pre-failure counts/checksum, and  
2. uses **MD5 (32-hex)** as the sole `LEDGER_CHECKSUM_MATCH` oracle (`parity-report.ts` hard-requires `ledger_checksum.length === 32`).

That contradicts the post-C5 D05-04 contract (“MUST load immutable recovery baseline from R2… NEVER use MD5 as the only ledger integrity mechanism”) and leaves R2-alone disaster recovery without a true baseline-bound parity path. **Ship is blocked on that HIGH residual.**

## Prior findings disposition

| ID | Prior title | Status | Evidence on `1cd41952` |
|---|---|---|---|
| **C-1** | Healthy control was synthetic text/WAL placeholder | **RESOLVED** | `services/platform/tests/integration/helpers/pgbackrest-seed.ts` runs real `pgbackrest` stanza-create + full backup into test-scoped prefix; `sprint28-restore-fails-closed.test.ts` imports `seedRealPgbackrestHealthyChain` and rejects production prefix reuse (`healthyPrefix` under `pgbackrest-d05-01-red/<runId>/healthy`). No `HEALTHY-WAL-PLACEHOLDER` seed path. |
| **C-2** | AC-4 false-green on unreachable DB / missing heartbeat | **RESOLVED** | `countFakeSuccessHeartbeats()` throws on ping failure, missing `backup_heartbeat`, or bad COUNT status (`sprint28-restore-fails-closed.test.ts` ~655–740); no soft-zero invention. |
| **C-3** | Promote + invented `pg_stat_recovery.last_applied_timestamp` + unequal `system_identifier` | **RESOLVED** | `restore.ts` documents real catalogs (`pg_last_wal_replay_lsn`, `recovery_target_time`); pause vs promote separate; D05-02 contract rewritten for equal `system_identifier` + sentinel cut; `sprint28-pitr-recovery-contract.test.ts` asserts contract text + pause/promote probes. |
| **C-4** | Mission schema/DSL mismatch (`schedule`, `mission_key`, uppercase statuses) | **RESOLVED** | `fire-drill-monthly.json` / `.ts`: `templateKey`, `trigger.kind=on-demand`, `typed_output_json` / lowercase `failed` language; monthly cadence external `holocron-fire-drill-monthly.plist` (not undeclared DSL schedule). Aligns with `mission/contract.ts` (`templateKey`, optional `schedule: monthly` in definition only). |
| **C-5** | No immutable collision-resistant recovery baseline for R2-alone parity | **OPEN (HIGH residual)** | **Emit side:** `recovery-baseline.ts` (SHA-256, content-addressed keys, bind label/restic/LSN/counts); hooks in `base-backup.ts` / `restic-mirror.ts`. **Consumer side FAIL:** `fire-drill.ts` does **not** import `recovery-baseline`; uses `computeLedgerChecksum` MD5 + live `sourceDatabaseUrl` pre-failure; `parity-report.ts:75-76` requires length **32**; live `.tmp/D05-04/parity-report.json` has `ledger_checksum=cdf21cb6…` (32-hex) and **no** `baseline_id`. D05-04 still requires R2 baseline SHA-256 as sole integrity oracle. |
| **H-1** | No D05-02…D05-06 capability beyond RED test | **RESOLVED** | Present: `backup/restore.ts`, `fire-drill.ts`, `parity-report.ts`, `evidence-ledger-verify.ts`, `recovery-baseline.ts`, `scripts/provision-fresh-restore-target.sh`, `prove-isolation.sh`, `verify-restore-*.sh`, `verify-postgres-exposure.sh`, `fire-drill.sh`, mission template + runbook, `security-review-D05-06.md`. CLI cases in `holo.ts` (`restore`, `restore:pitr`, `restore:status`, `restore:fire-drill`). |
| **H-2** | Human gate not executable (`unknown flag: --pitr`) | **RESOLVED** | Live: `bun …/holo.ts restore --pitr 2099-01-01T00:00:00Z --scratch …` → **exit 1**, named error `outside available WAL range (not in retention window)` — **not** `unknown flag: --pitr`. `restore:fire-drill` missing args → usage error exit 2. Gate step-1 log shows same named outside-WAL oracle. |
| **H-3** | Isolation only TCP/5432 + two mount strings | **RESOLVED** | `scripts/prove-isolation.sh`: axes network (IPv4/IPv6/tailnet/LAN/DNS), ipc_sockets, mounts (+ alternates), attested hardware/VM identity, control_plane (SSH), docker_runtime, r2_readonly. `verify-restore-isolation.sh` retained. Residual MEDIUM: documented SPRINT gate env (`MINI_SOCKET_DEFAULTS=0` without `MINI_UNIX_SOCKETS`, no RO keys) fails ipc + r2 axes on this host. |
| **H-4** | `aws s3 rm $R2_BUCKET/existing` can delete live recovery | **RESOLVED** | `prove-r2-readonly.sh` + `verify-restore-creds.sh`: denylist (`existing`, backup/, pgbackrest/, restic/, …); sacrificial only `drill-neg/<uuid>/…`; `--make-sacrificial-key` / `--assert-safe-key`. D05-03/security review text updated. |
| **H-5** | Wildcard restore ARN `holocron-backup-*` | **RESOLVED** | `buildRestoreCredentialPolicy` → exact `arn:aws:s3:::${bucket}` + `arn:aws:s3:::${bucket}/${prefix}/*`; rejects `*` in bucket/prefix (`config.ts`). Live policy-only: wildcard policy **exit 1**; exact policy **exit 0**. |

## New / residual findings

### HIGH (must fix before CAP-BAK-01 ship)

#### N-H1 / C-5 residual — Fire-drill parity still MD5 + live-mini; R2 recovery baseline unused

**Confidence:** HIGH (source + artifact)

**Evidence:**

| Path | Fact |
|---|---|
| `services/platform/src/backup/fire-drill.ts:1-14,504-545,782-786` | Flow captures pre-failure from **source** Postgres + local blob root; compares restored MD5 ledger (`length === 32`). Zero imports of `loadRecoveryBaselineFromR2` / `compareRestoredToBaseline`. |
| `services/platform/src/backup/evidence-ledger-verify.ts:54-56,241-287` | Ledger oracle is **md5** of ordered rows. |
| `services/platform/src/backup/parity-report.ts:75-76` | `ok` requires `ledger_checksum.length === 32` (MD5-shaped only). |
| `.tmp/D05-04/parity-report.json` | `ledger_checksum` / `pre_failure_ledger_checksum` = 32-hex; no `baseline_id` / `ledger_sha256`. |
| D05-04 contract (post-C5) | MUST load R2 recovery baseline; NEVER MD5-only sole oracle; MUST_OBSERVE 64-hex / `sha256:…` match to `baseline.ledger_sha256`. |

**Why it matters:** A compromised backup writer (or a drill run with live mini still reachable) can still manufacture MD5 parity without binding to the content-addressed R2 baseline that C5 introduced. True “mini is dead, restore from R2 alone” cannot use the fire-drill path as written without a live source DB for the oracle.

**Required fix direction (not implemented by this review):**

1. Fire-drill loads baseline via `loadRecoveryBaselineFromR2` (fail closed if missing/unverified).  
2. Row counts + ledger/blob digests compared with `compareRestoredToBaseline` (SHA-256).  
3. Drop MD5-as-sole-oracle; accept 64-hex in parity report; keep MD5 only as optional diagnostic if at all.  
4. Optional live-mini pre-failure snapshot must not be required for `ok` when baseline is present.

### MEDIUM (fix soon)

#### N-M1 — Documented multi-axis gate command fails closed on missing RO identity / empty socket set

`SPRINT.md` Human Testing Gate step 2 expects `RESULT: PASS` for:

```bash
MINI_HOST=203.0.113.1 TARGET_ATTESTED_IDENTITY=… MINI_ATTESTED_IDENTITY=… \
  REQUIRE_ATTESTED_IDENTITY=1 MINI_SOCKET_DEFAULTS=0 NC_TIMEOUT_SEC=1 \
  bash scripts/prove-isolation.sh
```

On this host (no RO keys, no `MINI_UNIX_SOCKETS`): **exit 1**, axes `ipc_sockets` + `r2_readonly` FAIL. Gate evidence step-2 used narrower `verify-restore-isolation.sh` and did not prove full multi-axis PASS.

#### N-M2 — DEPENDENCY-S28-R2-RO (documented residual)

`security-review-D05-06.md` + SPRINT status-note: live distinct object-read-only R2 identity not minted; RW reuse correctly **fails** `prove-r2-readonly`. Code path for exact RO policy exists; production positive RO proof still blocked on human mint.

#### N-M3 — Capability inventory CLI test flaky timeout

`pnpm vitest run services/platform/tests/integration/sprint28-capability-inventory.test.ts` failed one case (`restore CLI verbs…`) with 5000ms timeout at this review; path-presence cases passed. Raise timeout or stop spawning slow help paths under default IT timeout.

#### N-M4 — Human gate step-1 only proves outside-WAL fail-closed, not in-window exact PITR

`gate-results.json` marks step 1 pass via `2099-…` outside-WAL named error. In-window exact restore is covered by D05-02 IT / other `.tmp/D05-*` evidence, but the automated human-gate bundle does not re-prove green promote/pause PITR. Prefer an in-window step when `PITR_TIMESTAMP` is set.

### LOW (track)

- `sprint28-capability-inventory` / gate scripts should record `head_sha` at run time for provenance.
- Parity report schema version still `holo.fire-drill.parity-report.v1` without baseline fields — needs v2 when N-H1 lands.
- Residual backup-writer collusion without Object Lock / external signature remains theoretical after N-H1 (content-address detects silent body rewrite; RW dual-rewrite of backup+baseline is a separate control-plane issue).

## AC smoke (this review)

| Surface | Result | Notes |
|---|---|---|
| `restore --pitr` CLI | **PASS** | Flag accepted; outside-window fail-closed with named error; exit 1 |
| `restore:fire-drill` presence | **PASS** | Subcommand wired; missing args → usage error |
| Fire-drill module / scripts | **PASS** | `fire-drill.ts`, `scripts/fire-drill.sh` present |
| Isolation multi-axis | **PRESENT / gate env FAIL** | Script implements axes; documented env incomplete on this host |
| Sacrificial RO | **PASS** | drill-neg denylist + policy-only exact ARN probes |
| Exact ARNs | **PASS** | wildcard FAIL exit 1; exact PASS exit 0 |
| Recovery baseline emit | **PASS (module)** | `recovery-baseline.ts` + backup hooks |
| Recovery baseline in fire-drill | **FAIL** | not wired; MD5 sole ledger in drill path |
| Mission + runbook | **PASS** | `fire-drill-monthly.{json,ts}`, `runbooks/fire-drill-monthly.md`, launchd plist |
| `gate-results.json` 6/6 | **WEAK PASS** | executable surfaces improved; step1 outside-WAL only; steps 3–5 MD5 parity file |

## Stub / integrity greps

Checked under backup + sprint28 tests:

- No `execute: async … return { ok: true }` stub patterns in backup tools (N/A pure CLI/scripts domain).
- No `vi.mock('@mastra` / `jest.mock('@mastra` in sprint28 tests.
- No `z.any()` in `services/platform/src/backup/`.
- No `.skip` / `.todo` / `xit` in sprint28 integration tests (gate empty-chain run skipped 3 of 4 via env filter — expected for subset).
- Comments reference “no stub success” fail-closed paths in `restore.ts` / `fire-drill.ts` when binaries missing.

## Landing state

- Reviewed SHA: `1cd41952578a22f2d4346536d7da4559dec43149`.
- Sprint status file claims **Completed** / GATE-GOAL ACHIEVED — this review **does not certify** CAP-BAK-01 closed while N-H1/C-5 residual remains.
- No merge, push, checkout move, or product-code change by this review.
- This report is an audit artifact only.

## Verdict

**NEEDS_FIXES**

| Metric | Count |
|---|---|
| Open CRITICAL (new or unresolved prior) | **0** |
| Open HIGH | **1** (C-5 residual / N-H1) |
| Prior C1–C4, H1–H5 | **RESOLVED** |
| Prior C5 | **OPEN residual HIGH** |

**Do not treat Sprint 28 as severity-clean until fire-drill parity loads and enforces the R2 SHA-256 recovery baseline (no MD5-only sole oracle; no mandatory live-mini pre-failure for `ok`).**
