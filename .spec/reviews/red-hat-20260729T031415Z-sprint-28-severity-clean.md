# Red-Hat Severity Re-Check — Sprint 28

**Reviewed commit:** `d7e2ea560bdb688c1c09e5c181e5caf763656e4f` (`d7e2ea56`)  
**Branch:** `main`  
**Review date:** 2026-07-29T03:14:15Z  
**Mode:** read-only adversarial re-check (no product edits)  
**Prior residual HIGH:** N-H1 / C-5 residual — fire-drill did not consume R2 recovery baseline  
**Prior review:** `.spec/reviews/red-hat-20260729T030154Z-sprint-28-post-redhat-fix.md` (`1cd41952`)

## Verdict

**severity-clean** for prior findings **C1–C5** and **H1–H5**.

| Metric | Count |
|---|---|
| Open CRITICAL (C1–C5) | **0** |
| Open HIGH (C1–C5 residual + H1–H5) | **0** |
| Residual MEDIUM/LOW from prior post-fix | unchanged (out of this gate; not re-opened as HIGH) |

Landing evidence: `d7e2ea56 Merge task/REDHAT-FIX-C5-consume-s28 into main` (parent fix `78fe5bbe`).

---

## Verification checklist (this re-check)

### 1. `fire-drill.ts` imports and consumes recovery baseline — **PASS**

| Check | Evidence |
|---|---|
| Import | `services/platform/src/backup/fire-drill.ts:53-61` imports `compareRestoredToBaseline`, `computeBlobManifestSha256`, `computeLedgerSha256`, `listRecoveryBaselines`, `loadRecoveryBaselineFromR2`, `normalizeSha256Digest`, `RecoveryBaseline` from `./recovery-baseline.ts` |
| Flow contract | Header `fire-drill.ts:5-18`: step 1 load R2 baseline; MD5 never sole oracle |
| Resolve path | `resolveFireDrillBaseline` (`:134+`) loads by key/id/label or discovers under R2 `recovery-baselines/` |
| Require default | `requireRecoveryBaseline !== false` (`:708`); missing baseline → refuse (`:711-718`, `:1200-1204`) |
| Compare | Restored rows + ledger via `compareRestoredToBaseline` when baseline loaded (`:1089-1112`); blob re-check (`:1171-1190`) |
| Expected oracle | Row counts / `ledger_sha256` / `blob_manifest_sha256` prefer R2 baseline over live mini (`:765-774`) |
| MD5-only refuse | Without baseline + MD5-only pre-failure → explicit error (`:790-793`) |

### 2. `parity-report` baseline fields / `ledger_sha256` — **PASS**

| Check | Evidence |
|---|---|
| Schema | `holo.fire-drill.parity-report.v2` (`parity-report.ts:22`, emitted `:132`) |
| Fields | `ledger_sha256`, `pre_failure_ledger_sha256`, `baseline_loaded`, `baseline_id`, `baseline_sha256`, `baseline_key`, `baseline_blob_manifest_sha256`, `blob_manifest_sha256` (`:56-88`) |
| ok oracle | `isCollisionResistantDigest` requires 64-hex; MD5-only (32-hex) cannot alone pass `ok` (`:12-17`, `:104-128`) |
| Text coverage | `sprint28-fire-drill-baseline-consume.test.ts`: import wiring; MD5-only `ok=false`; SHA-256 `ok=true`; `runFireDrill` fails closed without R2 baseline |

### 3. Prior C1–C5 / H1–H5 disposition at `d7e2ea56`

| ID | Status | Notes |
|---|---|---|
| **C-1** | **RESOLVED** | Real pgBackRest seed + test-scoped prefix (prior post-fix; still on main) |
| **C-2** | **RESOLVED** | Fail-closed heartbeat / no soft-zero on unreachable DB |
| **C-3** | **RESOLVED** | Real recovery catalogs; pause vs promote; equal `system_identifier` contract |
| **C-4** | **RESOLVED** | Mission DSL / templateKey / lowercase statuses + external launchd cadence |
| **C-5** | **RESOLVED** (consumer landed) | Emit already on main; **consume** landed in `78fe5bbe` / merge `d7e2ea56` |
| **H-1** | **RESOLVED** | Full D05-02…D05-06 surface present |
| **H-2** | **RESOLVED** | `restore --pitr` executable (not unknown flag) |
| **H-3** | **RESOLVED** | Multi-axis `prove-isolation.sh` |
| **H-4** | **RESOLVED** | Sacrificial drill-neg keys; no live `s3 rm` |
| **H-5** | **RESOLVED** | Exact bucket/prefix ARNs; wildcard rejected |

---

## What closed the residual HIGH

At `1cd41952`, C-5 was emit-only: fire-drill never imported `recovery-baseline`, and parity `ok` hard-required 32-hex MD5. At `d7e2ea56`:

1. Fire-drill **loads** R2 baseline (fail-closed by default).  
2. Parity compares against **`baseline.ledger_sha256`** / row counts / blob manifest.  
3. Report schema **v2** carries `baseline_*` + `ledger_sha256`.  
4. **MD5-only** cannot satisfy `ok` without collision-resistant digest / verified baseline bind.  
5. Integration test asserts import, MD5 rejection, and fail-closed without baseline.

---

## Out of scope (not elevated to HIGH here)

Prior post-fix MEDIUMs remain informational (not part of C1–C5 / H1–H5 open set):

- N-M1 — documented multi-axis gate env may fail on host missing RO keys / sockets  
- N-M2 — DEPENDENCY-S28-R2-RO (live RO identity mint)  
- N-M3 — capability inventory timeout (addressed in same C5-consume commit per stat; not re-litigated)  
- N-M4 — human gate step-1 outside-WAL-only smoke  

These do **not** re-open C1–C5 or H1–H5 as CRITICAL/HIGH.

---

## Stub / integrity spot-check

- Backup path: real R2 load + compare helpers; no fake-success `ok: true` stub for baseline parity.  
- Consume test exercises fail-closed path (no baseline → non-zero exit).  
- No re-introduction of MD5-as-sole-oracle in `buildParityReport`.

---

## Landing state

- Reviewed SHA: `d7e2ea560bdb688c1c09e5c181e5caf763656e4f`  
- No merge, push, checkout move, or product-code change by this review.  
- This report is an audit artifact only.

## Final gate

**severity-clean** — open_critical=0, open_high=0 for Sprint 28 findings C1–C5 and H1–H5 at HEAD `d7e2ea56`.
