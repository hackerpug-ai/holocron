# Red-Hat Review Report — Sprint 30 Final Independent Closeout

**Report date:** 2026-08-07T11:07:11Z  
**Target:** Sprint 30 — Cutover Rollback Drill and Data-Plane Point of No Return  
**Reviewed commit:** `1957190f66030b3afa7bedfd3524225b9bb931d0` (`main`; handoff-only)  
**Fresh package audited:** `20260807T105804Z` — source `c2a3ead77d2350c0fd4591669c591857ecf2957a`, package `f033bc8659b4039cc23c618975e6de513cbca874`, attestation `5abe46fce2467e3af45ae3fb88fcd50142bf0fc7`, lock `1256397b9bcd6d08b1a8b234dd4b4d0b7e0a62aa`  
**Prior closeout:** `.spec/reviews/red-hat-sprint-30-20260807T105114Z-independent-final-closeout.md`  
**Panel:** C-2 independent evidence-binding reviewer; C-3 security/data-integrity reviewer; M-3 test-quality standing lens; independent consolidation.  
**Test-reality lens:** implemented-mode audit. It inspected source and package objects, safely re-ran the read-only assertions, and made no success evidence. A focused `PLATFORM_IT` M-3 rerun did not reach the identity assertions (`CONVEX_SNAPSHOT_UNAVAILABLE`); this report does not treat that failure as a test result.

## Severity Verdict

**NEEDS REVISION — 1 CRITICAL and 3 HIGH findings remain. Do not approve, mark Sprint 30 complete, write a gate pass, merge, push, or move the checkout.**

The fresh C-2 chain is now auditable and its v5 negative reaches the intended OID oracle. C-3 positive-path evidence and its package OIDs also resolve. However, a normal gate run still silently chooses and then seeds a purported disposable database with bypassable same-target detection. Separately, M-3's asserted package pass is false-green: the assertion accepts a legacy substitute and narrative RED/mutation files, does not validate the manifest, and is not Git-object-bound.

## Residual AC Verdict Table

| Residual / AC | Verdict | Evidence |
|---|---|---|
| C-2 HEAD-lock OID binding and v5 negative reach | ✅ PASS | `scripts/assert-gate-evidence-containment.sh:56-65,206-228`; `scripts/assert-c2-e1-bind-mismatch-negative.sh:37-105`; fresh read-only assertion returned `hist_oid == sub_oid == b577ff2e…`. |
| C-3 explicit disposable marker DB, seed opt-in, target rejection | ❌ FAIL — CRITICAL | `scripts/run-sprint30-human-gate.sh:383-386,404-407` supplies a marker DB and defaults seed to `1`; target equivalence guard is bypassable at `scripts/probe-ponr-role-immutability-negative-marker.sh:28-35`. |
| C-3 exact dual-trigger preservation and package OIDs | ✅ PASS (narrow) | Exact-name / `tgenabled == 'O'` checks at `probe-ponr-role-immutability-negative-marker.sh:103-111,124-127,159-207`; attested `c3-*` OIDs resolve to `f033bc86`. |
| C-3 real one-trigger-missing mutation discrimination | ❌ FAIL — HIGH | The required retained negative/RED-GREEN artifacts are absent; neither the fresh package nor the recorded remediation evidence proves a missing mutation or truncate trigger fails this gate. |
| M-3 mandatory `m3-identity` fail-closed package tree | ❌ FAIL — HIGH | `scripts/assert-m3-identity-evidence.sh:24-29` accepts `m3-branch-identity` when `m3-identity` is absent; staging is optional at `scripts/package-sprint30-gate-evidence.sh:52-58`. |
| M-3 durable real RED/mutation, manifest integrity, package-bound assertion | ❌ FAIL — HIGH | `assert-m3-identity-evidence.sh:33-59,91-94` checks only non-empty files/list length. The committed RED/mutation files are prose, manifest self-digest is wrong, and the assertion uses mutable paths rather than `package_commit:path`. |

## Blocking Findings

- [ ] **C-3 marker-miss still permits irreversible seeding of the gate/cutover database.** Severity: **CRITICAL**. Confidence: **HIGH**.

  The runner silently defaults an unset `HOLO_PROBE_MARKER_MISS_DATABASE_URL` to `postgres://127.0.0.1:5432/holocron_nonprod` and invokes the marker probe with `HOLO_PROBE_SEED_PONR=${…:-1}` (`scripts/run-sprint30-human-gate.sh:383-386,402-407`). This violates the remediation's explicit URL and seed-opt-in contract. Worse, the probe's “normalization” retains the URI scheme and renders an omitted port differently from the default port (`scripts/probe-ponr-role-immutability-negative-marker.sh:28-35`): `postgres://host/db` vs `postgresql://host:5432/db` select the same PostgreSQL target but compare unequal. The raw-string runner comparison (`run-sprint30-human-gate.sh:387-390`) does not repair that. A supplied alias of the cutover DB can therefore pass the distinct-target check and receive a seeded PONR.

  Require an operator-supplied, canonicalized disposable-target identity, default seeding off, and reject all canonical equivalence with the gate target. Do not retain an override that permits production-like targets. Prove it with a real same-target URI-alias negative before another gate package.

- [ ] **M-3's fail-closed package assertion accepts a legacy tree and mutable evidence.** Severity: **HIGH**. Confidence: **HIGH**.

  `assert-m3-identity-evidence.sh` falls back from mandatory `m3-identity` to `m3-branch-identity` (`:24-29`), despite RH-S30-31 expressly ruling the legacy tree insufficient. It receives an arbitrary evidence directory (`:13-24`) rather than resolving paths and blob OIDs from the selected package. The package script continues copying from `.tmp` with `|| true` (`package-sprint30-gate-evidence.sh:52-58`), and its post-package M-3 result is not added in `:289-294`. Thus a mutable legacy-only tree can make both the M-3 assertion and `assert-human-test-verdict` pass after the package is made.

  Remove the fallback and optional staging; resolve every M-3 artifact and assertion result from `package_commit:path`, bind their OIDs in the authenticated attestation, and compare submitted bytes to those objects.

- [ ] **M-3's RED, mutation, and manifest checks are test theatre.** Severity: **HIGH**. Confidence: **HIGH**.

  The required `RED-identity-oracle-baseline.txt` and `mutation-failure.log` in package `f033bc86` are narrative claims, not Vitest failure transcripts with a command, exit status, and assertion failure. Yet the assertion accepts any non-empty file (`assert-m3-identity-evidence.sh:33-59`). It only requires a manifest list with five entries (`:91-94`); recomputing the fresh manifest found its listed SHA-256 for `manifest.json` does not equal its actual bytes, while `assert-m3-identity-evidence.sh` and `assert-human-test-verdict.sh` both return success. This cannot distinguish an executed mutation/RED from hand-written text.

  Require and parse concrete RED/mutation failure signatures and exit status, validate every manifest digest (or omit an impossible self-entry), and commit/bind the assertion output with the evidence tree.

- [ ] **C-3 lacks the retained one-trigger-missing negative required to prove the exact-set oracle.** Severity: **HIGH**. Confidence: **MEDIUM**.

  The code now checks both names in the normal and recorded-positive paths, but no retained `one-trigger-missing` negative, static oracle audit, or RED/GREEN false-green fixture was found for RH-S30-30. The package's valid two-trigger report proves only the happy path; it does not prove the gate rejects either trigger missing or disabled.

  Run and retain a real disposable-Postgres mutation that removes/disables each required trigger in turn; require a non-zero exit and `ok != true`, then package-bind it.

## Narrow Passes

- **C-2:** `ASSERT_PACKAGE_HEAD=1` rejects a foreign `ASSERT_LOCK_COMMIT`, and the package script unsets it before the production assertion. The package chain is `c2a3ead7 → f033bc86 → 5abe46fc → 1256397b → 1957190f`. The fresh normal assertion passed with lock OID `184a9174…`, attestation OID `a8bdfd57…`, and `hist_oid == sub_oid == b577ff2e…`.
- **C-2 negative reach:** the v5 harness creates a disposable Git P1→A1→L1 fixture and changes only submitted results before demanding the explicit blob-OID mismatch. It was inspected but not rerun because it intentionally writes/removes a fixture tree, which would create review-time evidence.
- **C-3 narrow mechanics:** the fresh marker report records a distinct target, one retained row, both named triggers enabled before/after, non-owner execution, and unchanged gate count. The C-3 `ac1`, `ac2`, and marker-report object IDs in `5abe46fc` match `f033bc86`; containment and human-verdict assertions pass for those recorded bytes.
- **M-3 source/package partial:** the package includes a credible 6/6 GREEN integration transcript and branch records; the reselect record asserts independent HTTP-201 ID equals the report write ID, is present in DB/ledger IDs, and differs from the probe ID. That does not cure the false-green proof controls above.

## Checks Re-run

- `ASSERT_EVIDENCE_CONTAINMENT=1 ASSERT_PACKAGE_HEAD=1 ASSERT_C3_PREDICATES=1 bash scripts/assert-human-test-verdict.sh <Sprint-30 gate-results> <20260807T105804Z>` → exit `0`; this is an audited artifact predicate, not independent proof of its mutable M-3 inputs.
- `ASSERT_PACKAGE_HEAD=1 ASSERT_LOCK_COMMIT=5abe46fc bash scripts/assert-gate-evidence-containment.sh <Sprint-30 gate-results>` → exit `1`, explicitly refusing the foreign lock selection.
- `bash scripts/assert-m3-identity-evidence.sh <20260807T105804Z>` → exit `0`; historic incomplete `20260807T103459Z` → exit `1`. The fresh green is false-positive for the semantic reasons above.
- Git object inspection confirmed the result blob remains `b577ff2e…` at P1, A1, L1, and reviewed HEAD; C-3 attestation OIDs resolve to P1 objects. `bash -n` passed for the seven reviewed scripts.

## Disposition

This is a review-only verdict on exactly `1957190f66030b3afa7bedfd3524225b9bb931d0`. No product code, task file, `SPRINT.md`, `gate-results.json`, `gate-verification.json`, package evidence, merge state, branch, or remote was changed. The checkout was already dirty with unrelated artifacts; this report is the sole review output.

Sprint 30 remains **not approved**. Resolve the CRITICAL C-3 target/seed flaw and the HIGH M-3 false-green controls, produce real bounded negative evidence, then create a new immutable package and request another independent closeout review.
