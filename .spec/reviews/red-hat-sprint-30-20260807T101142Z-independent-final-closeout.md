# Red-Hat Review Report — Sprint 30 Final Closeout

**Report date:** 2026-08-07T10:11:42Z  
**Target:** Sprint 30 — Cutover Rollback Drill and Data-Plane Point of No Return  
**Reviewed commit:** `fe79d37bec6b9c876d60febe1aca38bcbdde1183` (`main`)  
**Fresh gate examined:** `20260807T095843Z` — source `324ce9045c0ced0ee39686cbec603afcf1116551`, evidence-tree commit `33f004d1524452b264dcc1a41b91d0c43fa8e6e9`  
**Prior review:** `.spec/reviews/red-hat-sprint-30-20260807T094841Z-independent-final-closeout.md`  
**Reviewed by:** independent code/evidence lens, security/rollback lens, test-reality lens (implemented mode)  
**Test-reality lens:** ran (implemented mode; mutation deliberately not performed under review-only scope)  
**Scope discipline:** Review-only. No product, task, sprint, gate-result, or gate-verification files were changed. No merge, push, or checkout movement was performed.

## Severity Verdict

**NEEDS REVISION — 2 CRITICAL findings remain. Do not approve Sprint 30.**

The shipped source removes the former bare marker-parse fallback and strengthens the M-3 cases beyond audit-count-only checks. Those are meaningful improvements, but the fresh package is still not auditable as an exact evidence-blob binding, and no owned forced-marker-miss preservation control proves the dangerous branch. The clean `5/5` gate and its verifier are evidence under audit, not a substitute for these missing controls.

## AC Verdict Table

| Control | Verdict | Evidence | Notes |
|---|---|---|---|
| C-2 / RH-S30-20: immutable named commit/blob binding | ❌ FAIL — CRITICAL | `scripts/assert-gate-evidence-containment.sh:59-86,99-127`; `scripts/assert-human-test-verdict.sh:102-145` | Both assertions accept different named and submitted blobs. |
| C-3 / RH-S30-21: marker-miss hard-fail implementation | ✅ PASS (source only) | `scripts/probe-ponr-role-immutability.sh:203-289` | DDL/DML is transaction-scoped; parse miss exits before an additional fallback statement. |
| C-3 / RH-S30-21: non-owner rolled-back preservation negative control | ❌ FAIL — CRITICAL | `scripts/run-sprint30-human-gate.sh:376-390`; `scripts/probe-ponr-role-immutability-negative-marker.sh:19-59` | The gate runs only the normal probe; the wrapper is unowned and can pass with zero PONR rows. |
| M-3 / RH-S30-22: accepted-write identity checks | ⚠️ PARTIAL — MEDIUM | `services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts:305-314,365-372,420-435`; `services/platform/src/cutover/ponr.ts:807-839` | ID equality replaced count-only checks, but reselect has no independently captured HTTP-201 ID and required round evidence is absent. |

## High-Confidence Findings (3 Independent Lenses Agree)

- [ ] **C-2 — C-2-atomic-v3 remains a false-green evidence binding.** Severity: **CRITICAL**. Confidence: **HIGH**.

  The fresh submitted/bound results blob is Git OID `f27c245f1843a78b967c9afab6fc46af75fbe203`; the blob at the commit it names (`33f004d1:<evidence path>/gate-results.json`) is `422643de577830480194ecab5f09a06d8700e614`. Their binding fields differ: the named blob says `git_sha=324ce904…` and has no `source_sha_at_run`, `package_sha`, or `gate_results_blob_sha256`; the later blob supplies all of them and names `33f004d1…`.

  This is the exact historical-versus-submitted mismatch the residual required the assertion to reject. Instead, `assert-gate-evidence-containment.sh` hashes the old named blob and compares it only to a hash field supplied by the later JSON (`:70-86`); its `HEAD` test compares the later JSON only to itself at `HEAD` (`:99-127`). `assert-human-test-verdict.sh` repeats the same split check (`:112-145`). Both fresh checks exit `0` with `ASSERT_PACKAGE_HEAD=1` even though the named and submitted blobs differ.

  The package script intentionally creates the two blobs: it computes the hash from E1 (`scripts/package-sprint30-gate-evidence.sh:71-75`), rewrites the result fields (`:89-110`), and commits the distinct bind-tip blob (`:118-128`). A content hash stored in a later mutable results file is not an assertion that the submitted results are the exact blob at the commit they name. The C-2 requirement calls for a separate immutable attestation naming the exact commit and blob OID(s), and verification must resolve that artifact and compare the claimed blob/required fields directly.

- [ ] **C-3 — the required marker-parse-failure preservation control is absent and its standalone wrapper is fakeable.** Severity: **CRITICAL**. Confidence: **HIGH**.

  The implementation improvement is real: all privilege probes occur in `BEGIN … DO … ROLLBACK` (`scripts/probe-ponr-role-immutability.sh:203-247`), and a missing marker exits at `:264-289` without the old bare fallback. However, the fresh gate invokes only `probe-ponr-role-immutability.sh` (`scripts/run-sprint30-human-gate.sh:376-390`); it neither calls `probe-ponr-role-immutability-negative-marker.sh` nor sets `PROBE_FORCE_MARKER_MISS=1`. No `PLATFORM_IT` test calls either hook, and package `20260807T095843Z` contains no forced-miss evidence.

  Moreover, the wrapper declares success when before/after counts are merely equal (`scripts/probe-ponr-role-immutability-negative-marker.sh:38-54`). It never requires `before_count >= 1` or initially enabled triggers, so an empty table passes the supposed PONR-preservation oracle. The ordinary fresh evidence is a rollback transaction with effective `current_user=holocron_app`, but its `session_user` is still the owner/superuser `holocron`; it is not a completed forced-miss preservation proof on a seeded PONR-holding database.

## Medium Finding

- [ ] **M-3 — source-level identity assertions are present, but the reselect identity oracle and remediation evidence are incomplete.** Severity: **MEDIUM**. Confidence: **HIGH**.

  The non-201 and transport cases use `allowFileFallback:false` and assert the injected ID exists in `accepted_writes` (`sprint30-redhat-rh-s30.test.ts:305-314`, `:365-372`). The reselect branch now retains the internal HTTP-201 ID for recovery (`ponr.ts:810-839`) and the test asserts it is not the synthetic probe ID and is in the ledger (`sprint30-redhat-rh-s30.test.ts:420-435`). This closes the prior count-only gap in source.

  But the test derives its asserted `acceptedWriteRowId` from `report.write_row_id`, which is set by the same implementation it is testing; it does not independently capture the actual HTTP-201 ID at the server boundary and compare that value to both report and durable ledger. In addition, the current tree has no `.tmp/REDHAT-FIX-RH-S30-22/` RED log, green transcript, per-branch identity artifact, or branch-oracle map required by RH-S30-22. The focused integration command was invoked during this review and emitted Vitest completion dots, but this execution channel did not return an exit summary, so it is not used as a substitute for the missing durable test evidence.

## Gate and Contract Checks

- `ASSERT_PACKAGE_HEAD=1 bash scripts/assert-gate-evidence-containment.sh <Sprint-30 gate-results>` exited `0`; its own JSON reports distinct `named_blob_sha256` (`b84649…`) and `head_blob_sha256` (`b269a4…`). That is evidence of the faulty oracle, not a pass for C-2.
- `ASSERT_EVIDENCE_CONTAINMENT=1 ASSERT_PACKAGE_HEAD=1 bash scripts/assert-human-test-verdict.sh <Sprint-30 gate-results> <20260807T095843Z>` exited `0` for the same mismatched pair.
- The historical non-containing control (`09aae0dd` / `20260807T091354Z`) still fails with the explicit C-2 containment error. This is retained coverage, but does not detect the path-present/different-blob class.
- The fresh package records `source_sha_at_run=324ce904…`, evidence commit `33f004d1…`, five non-empty step logs, and verifier `verified:true`. Those facts are internally consistent as a package history but insufficient to remedy C-2 or C-3.
- Scoped anti-stub scans found no additional explicit service stub in the remediation source. No new CRITICAL/HIGH correctness, rollback, data-loss, or security finding was established beyond C-2 and C-3.

## Agent Contradictions and Resolution

| Topic | Assessment |
|---|---|
| Does SHA-256 of the E1 blob establish C-2? | No. It establishes a later result file can name a historical blob hash; it does not establish the submitted result is that exact named blob or fields. All lenses found the checker accepts the real mismatch. |
| Is C-3 source safe after the parse miss? | Yes at source level: no bare fallback remains. It is nevertheless not closed because the required seeded forced-miss behavioral proof is neither gate- nor integration-owned and its standalone oracle permits an empty table. |
| Is M-3 count-only? | No: explicit ID equality assertions now exist. The residual is the self-correlated reselect observation and absent RH-S30-22 evidence, assessed Medium rather than a new release-blocking High. |

## Required Remediation Before Another Closeout

1. Replace the C-2 two-blob protocol with a committed, immutable sidecar/attestation that names the precise evidence-tree commit and Git blob OID(s), and make both assertions compare the exact claimed historical object and binding fields. Add a negative control for this present E1-versus-bind-tip substitution.
2. Add a gate- or `PLATFORM_IT`-owned forced marker-miss test against a disposable database seeded with at least one PONR row and enabled non-internal trigger. It must require non-zero probe exit, unchanged nonzero count, trigger preservation, and verified effective non-owner role in the always-rolled-back transaction.
3. Make reselect capture the real 201 document ID independently in the integration observable, compare it to report and durable ledger, and retain actual RED/GREEN per-branch RH-S30-22 evidence.

## Disposition

**Do not mark Sprint 30 complete and do not write a gate pass.** This report reviews exactly `fe79d37bec6b9c876d60febe1aca38bcbdde1183`; it does not merge, push, or move a checkout.

## Metadata

- **Panel:** `mastra-reviewer` implementation/evidence lens; `security-reviewer` rollback/security lens; `test-quality-reviewer` standing test-reality lens.
- **Confidence framework:** HIGH agreement = 3 independent lenses; severity is assessed independently of agreement.
- **Working tree note:** The checkout was materially dirty before review, including untracked RH-S30-20..22 task files and prior artifacts. The reviewed SHA does not contain those task files; no conclusion treats uncommitted worktree content as landed implementation.
