# Red-Hat Review Report — Sprint 30 Final Independent Closeout

**Report date:** 2026-08-07T10:51:14Z  
**Target:** Sprint 30 — Cutover Rollback Drill and Data-Plane Point of No Return  
**Reviewed commit:** `fda9b9daf1d27caab9c2387e87869ac6cea574cc` (`main`; handoff-only)  
**Fresh package audited:** `20260807T103459Z` — source `ed18edf7936145dc3d6b2a842193abc11f78bc60`, package `dd45328e6fc147a19295fcd2b798205306438c72`, attestation `8d1e9cdbb911dddc54ad375f763f043eec6a43c4`, lock `848f87cb68fc2c6ef589407e58f52f24594cb7e4`  
**Prior closeout:** `.spec/reviews/red-hat-sprint-30-20260807T102743Z-independent-final-closeout.md`  
**Panel:** independent evidence-binding review, security review, gate-predicate review, `test-quality-reviewer` standing test-reality lens  
**Test-reality lens:** implemented-mode source/package audit. No mutation probe or integration-suite rerun: those would write `.tmp` evidence and exercise the disposable database, contrary to this review-only contract.  
**Scope discipline:** No product, task, sprint, gate-result, or gate-verification artifact was edited; no merge, push, or checkout movement occurred.

## Severity Verdict

**NEEDS REVISION — 1 CRITICAL and 4 HIGH findings remain. Do not approve or mark Sprint 30 complete.**

The normal-path C-2 v5 chain is internally coherent, and the actual fresh package contains both C-3 trigger artifacts and the retained M-3 branch records. That is not sufficient to close the controls: the gate can mutate a non-disposable database, accepts one of the two mandatory PONR triggers, permits an environment-selected non-HEAD lock, and lacks meaningful v5 negative coverage. M-3 is retained more completely than the prior package, but still misses its required fail-closed package control and durable RED/mutation evidence.

## Residual Verdict Table

| Residual | Verdict | Evidence |
|---|---|---|
| C-2 Git-bound attestation lock, normal path | ✅ PASS (narrow) | `scripts/assert-gate-evidence-containment.sh:63-193`; lock/blob chain below; fresh assertions exit 0. |
| C-2 immutable HEAD lock requirement | ❌ FAIL — HIGH | `scripts/assert-gate-evidence-containment.sh:53-54,195-208`; arbitrary `ASSERT_LOCK_COMMIT` is not compared with the lock loaded from `HEAD`. |
| C-2 v5 E1-vs-bind negative | ❌ FAIL — HIGH | `scripts/assert-c2-e1-bind-mismatch-negative.sh:14-16,31-54,67-81`; it forges v4 worktree evidence with no v5 lock, so rejection occurs before v5 OID comparison. |
| C-3 forced-marker-miss / effective non-owner mandatory status and exit | ❌ FAIL — CRITICAL / HIGH | `scripts/run-sprint30-human-gate.sh:378-380,393-395,448-518`; `scripts/probe-ponr-role-immutability-negative-marker.sh:24-62,82-96,157-167`. |
| C-3 package verification | ❌ FAIL — HIGH | `scripts/package-sprint30-gate-evidence.sh:91-149,157-180`; C-3 paths are read from mutable worktree after package commit and their object IDs are not attested. |
| M-3 durable per-branch RED/GREEN identity evidence | ⚠️ PARTIAL — MEDIUM | The package has GREEN and branch records, but not the required fail-closed `m3-identity` control, real RED/mutation logs, manifest, or M-3 assertion. |

## Blocking Findings

- [ ] **C-3 marker-miss can permanently seed a non-disposable database.** Severity: **CRITICAL**. Confidence: **HIGH**.

  The runner requires only a non-empty `DATABASE_URL` (`run-sprint30-human-gate.sh:378-380`), uses that same URL when `HOLO_PROBE_MARKER_MISS_DATABASE_URL` is absent, and forces `HOLO_PROBE_SEED_PONR=1` (`:393-395`). On an empty target, the marker script disables the PONR triggers, inserts a row, then re-enables them (`probe-ponr-role-immutability-negative-marker.sh:24-62`). There is no disposable-target identity guard or production-target rejection. A run against an empty live/cutover database can therefore fabricate the irreversible PONR and deny a legitimate rollback.

  Require an explicitly distinct, validated disposable marker database; reject equality with the gate/cutover URL; leave seeding off by default; and prove the production target is untouched.

- [ ] **C-3 accepts one required trigger as sufficient for completed status, zero exit, and package pass.** Severity: **HIGH**. Confidence: **HIGH**.

  The contract requires both `data_plane_ponr_reject_mutation` and `data_plane_ponr_reject_truncate` enabled. Yet the producer rejects only a zero count (`probe-ponr-role-immutability-negative-marker.sh:82-96`) and defines preservation with counts `>= 1` (`:157-167`); its declared `REQUIRED_TRIGGERS` is unused (`:22`). The gate finalizer repeats `>=1` (`run-sprint30-human-gate.sh:448-453`), as do package and verifier predicates (`package-sprint30-gate-evidence.sh:136-144`; `assert-human-test-verdict.sh:121-129`). A missing truncate trigger can erase the PONR even as C-3 closes green.

  Compare exact required-name sets before and after, require each `tgenabled == 'O'`, and retain a real one-trigger-missing negative.

- [ ] **C-3 post-package check trusts mutable files, not the selected package object.** Severity: **HIGH**. Confidence: **HIGH**.

  The package commit is created at `package-sprint30-gate-evidence.sh:91-103`; only afterward, `:113-149` reads C-3 reports from the worktree. The v5 attestation written at `:157-180` binds only `gate-results.json` (and optionally verification), not C-3 report object IDs. A substituted worktree report can satisfy the post-package check without matching package `P1`.

  Resolve C-3 reports from `package_commit:path`, bind their blob IDs in the attestation, and make containment compare those committed bytes to any submitted verifier input.

- [ ] **C-2’s `ASSERT_PACKAGE_HEAD` can load a non-HEAD lock.** Severity: **HIGH**. Confidence: **HIGH**.

  `assert-gate-evidence-containment.sh:53-54` accepts an arbitrary `ASSERT_LOCK_COMMIT`. With `ASSERT_PACKAGE_HEAD=1`, lines `195-208` verify only that a lock path exists at `HEAD`; they never require that its blob OID equals the already-loaded lock. The package runner exports no safe reset or fixed value before asserting (`package-sprint30-gate-evidence.sh:221-227`). An inherited environment can therefore select a stale/foreign lock while the HEAD existence check still passes, defeating the stated HEAD-lock binding.

  When `ASSERT_PACKAGE_HEAD=1`, require `lock_commit == HEAD` or compare `HEAD:<lock path>` directly with `lock_oid`; isolate alternative commits to a test-only fixture command.

- [ ] **The retained E1-versus-bind negative does not reach the v5 blob-identity oracle.** Severity: **HIGH**. Confidence: **HIGH**.

  The negative script constructs a v4 worktree attestation (`assert-c2-e1-bind-mismatch-negative.sh:31-54`) for run `20260807T095843Z`; that run has no v5 lock. The v5 assertion consequently fails at the lock precondition (`assert-gate-evidence-containment.sh:63-69`) before it can compare `hist_oid` and `sub_oid` (`:161-177`). The script then requires blob-identity wording (`negative script:78-81`) and exits 2. It cannot detect regression of the actual v5 OID-equality control.

  Replace it with a disposable Git-backed v5 fixture: valid package → attestation → lock, then alter only the submitted result blob and assert the explicit `hist_oid != sub_oid` failure.

## M-3 Residual

The exact `dd45328e` package does contain all three current branch records, a six-test GREEN transcript, a branch map, and a prose RED baseline. The records cross-check `non_201_accepted_id` and `transport_error` IDs against their ledger arrays, and the `reselect_miss` record shows `independentHttp201Id == report_write_row_id`, is in database/ledger IDs, and differs from `reselectProbeId`.

Nevertheless, `REDHAT-FIX-RH-S30-28.md:49-55` requires a fail-closed `m3-identity` tree with a real RED log, GREEN log, three branch artifacts, mutation-failure evidence, manifest, and assertion. The implementation retains `m3-branch-identity` only if an ignored `.tmp` directory happens to exist and suppresses copy errors (`package-sprint30-gate-evidence.sh:52-58`). `assert-human-test-verdict.sh:130-146` skips M-3 entirely when that directory is absent and otherwise tests only four filenames. No `assert-m3-identity-evidence.sh`, real RED transcript, mutation log, manifest, or M-3 assertion result exists. This remains **MEDIUM**, but is not an auditable closeout of the specified M-3 remediation.

## Checks Re-run

- `ASSERT_EVIDENCE_CONTAINMENT=1 ASSERT_PACKAGE_HEAD=1 ASSERT_C3_PREDICATES=1 bash scripts/assert-human-test-verdict.sh <Sprint-30 gate-results> <20260807T103459Z>` → exit `0`; it reports C-3 predicates green and `m3_package_bound:true` for the incomplete four-file check.
- `ASSERT_PACKAGE_HEAD=1 bash scripts/assert-gate-evidence-containment.sh <Sprint-30 gate-results>` → exit `0`; lock `de3d26d6389c32b620e1b42a99d078b3b49fe173`, attestation `3adbbb7b5e2d61686a51469892723dc26e30d820`, and result `73d816a26b15b51856ab469acc081a8bdb41c278` resolve as expected.
- Direct Git-object audit confirms the lock/result/attestation OIDs are unchanged from `848f87cb`, `dd45328e`, and `8d1e9cdb` through `fda9b9da`, and ancestry is `ed18edf7 → dd45328e → 8d1e9cdb → 848f87cb → fda9b9da`.
- `bash -n` on the six modified scripts passed. `git fsck` found no object corruption; `git diff --check` reported only pre-existing/committed whitespace warnings outside the reviewed control logic.

## Disposition

Do not mark Sprint 30 complete, write a gate pass, merge, push, or move any checkout. This report covers exactly `fda9b9daf1d27caab9c2387e87869ac6cea574cc` and is a review verdict only.

The C-2 normal path is Git-object-integrity-bound under a trusted local `HEAD`, but these commits are unsigned and this local `main` is ahead of `origin/main`; no signer-authentication or remote-immutability assertion is made by this review.
