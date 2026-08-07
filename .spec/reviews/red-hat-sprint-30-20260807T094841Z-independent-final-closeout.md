# Red-Hat Review — Sprint 30 Final Independent Closeout

**Report date:** 2026-08-07T09:48:41Z  
**Target:** Sprint 30 — Cutover Rollback Drill and Data-Plane Point of No Return  
**Reviewed commit:** `a0edfdd58308eb90b2352bddfc2012dcb443f339` (`main`)  
**Gate examined:** `20260807T094143Z`  
**Prior closeout:** `.spec/reviews/red-hat-sprint-30-20260807T092237Z-independent-closeout.md`  
**Reviewed by:** independent red-hat review; code/evidence lens; security-correctness lens; test-reality lens (implemented mode).  
**Scope discipline:** Review-only. No product, task, sprint, gate-result, or gate-verification files were changed; no merge, push, or checkout movement was performed.

## Severity Verdict

**NEEDS REVISION — 2 CRITICAL findings remain. Do not approve Sprint 30 or treat the `20260807T094143Z` gate as an auditable closeout.**

The claimed source/package fields are present (`source_sha_at_run=a2db5b9d…`, `git_sha=52889af3…`) and the historical negative control correctly fails.  However, the new package protocol attests fields which are not present in the commit named by `git_sha`; its checker accepts that mismatch. Separately, the C-3 probe retains an unscoped destructive fallback capable of erasing the PONR row.

## Reopened-Finding Verdicts

| Finding | Verdict | Evidence |
|---|---|---|
| C-2 containment and C-2-atomic-v2 | **FAIL — CRITICAL** | `52889af3:<sprint>/.gate-evidence/20260807T094143Z/gate-results.json` exists, but that blob still says `git_sha=a2db5b9d…`; the bind only appears in child `998f5dbd`. `assert-human-test-verdict.sh:89-117` proves path existence, not that the checked gate-results blob is the bound evidence. |
| C-3 safe owner-DDL role provenance | **FAIL — CRITICAL** | The marker-parse fallback issues bare `TRUNCATE` and `UPDATE` through the original URL, outside a transaction and outside the `SET LOCAL ROLE` path: `scripts/probe-ponr-role-immutability.sh:172-190`. |
| M-3 post-lift first-write integration oracles | **PARTIAL — MEDIUM** | Three separate `PLATFORM_IT` cases invoke `runEnableWrites`, assert a durable fence and refusal: `services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts:273-443`; the focused suite completed green (six cases). But every new case asserts only audit count `>= 1` (`:306-312`, `:364-369`, `:422-427`), not the required accepted/write-row identity. The reselect injection replaces the actual 201 id with its supplied synthetic id before recording recovery (`services/platform/src/cutover/ponr.ts:810-824`), so this test does not prove the audit represents the accepted write. |

## Critical Findings

- [ ] **C-2 — the asserted package binding is a false-green, not a fixed point.** Severity: **CRITICAL**. Confidence: **HIGH**.

  The run package's claimed `git_sha` is `52889af3…`, and `git cat-file -e 52889af3:<evidence-path>/gate-results.json` succeeds. But the object at that exact path has `git_sha` and `source_sha` equal to `a2db5b9d…`, with no `source_sha_at_run` or `package_sha`. The blob containing the claimed `52889af3…` binding is first committed by child `998f5dbd…`; current `a0edfdd` retains that child blob. The implementation explicitly calls this a two-commit protocol at `scripts/package-sprint30-gate-evidence.sh:5-14` and even acknowledges at `:139-141` that the named tree's blob may still be pre-bind.

  `scripts/assert-human-test-verdict.sh:89-117` accepts solely because the path exists in `52889af3`; it never reads that historical blob and compares it with the submitted results. Consequently an arbitrary later results file can claim an ancestor as `git_sha` as long as that ancestor happens to contain a path for the run. The required source/evidence binding is therefore not auditable at the SHA it names. The `09aae0dd` negative control fails, and the current assertion/verifier return zero, but neither result detects this distinct blob-identity substitution.

  **Required remediation:** establish a non-self-referential evidence model with an immutable, separately hashed/committed attestation that names both the source tree and the exact evidence blob(s), then make the assertion load the named commit's blob and require byte/hash/field identity. A mere `cat-file -e` containment check is insufficient. Re-run the gate and package it under the corrected contract.

- [ ] **C-3 — missing transaction marker can still destroy the PONR record.** Severity: **CRITICAL**. Confidence: **HIGH**.

  The intended probe is transaction-wrapped at `scripts/probe-ponr-role-immutability.sh:121-171`. If its regex does not parse the `PROBE_ROLLBACK_MARKER`, the `if not m` branch calls `psql("TRUNCATE data_plane_ponr")` and `psql("UPDATE data_plane_ponr SET operator = operator")` directly at `:172-190`. Both use the original `DATABASE_URL`, not the prior `SET LOCAL ROLE` transaction, and neither has a rollback. With an owner/superuser URL this can truncate the immutable PONR table before the later postflight detects it.

  The stored `20260807T094143Z` artifacts showing `rows_preserved:true` do not cover this parser-failure branch, so they cannot establish the required non-destructive guarantee.

  **Required remediation:** delete the fallback destructive statements. Treat marker parse failure as a hard failure before any additional DDL/DML; execute every attempted operation in the same verified non-owner session and one always-rolled-back transaction. Add a negative test that forces marker parsing to fail against a PONR-holding disposable DB and proves row/trigger preservation.

## Contract Checks Performed

- Pinned tree audit: `git show a0edfdd…:<path>` was used for source findings. The active checkout developed unrelated uncommitted edits during review, so no conclusion relies on those edits.
- Fresh gate fields: the committed `20260807T094143Z` results contain the claimed `git_sha=52889af3…`, `source_sha_at_run=a2db5b9d…`, and `verdict:"pass"`.
- Historical negative control: `ASSERT_EVIDENCE_CONTAINMENT=1 bash scripts/assert-human-test-verdict.sh …/20260807T091354Z/gate-results.json …/20260807T091354Z` exited `1` with the explicit C-2 containment error.
- Fresh current-shape checks: the same assertion and `verify-gate-evidence.sh` against `20260807T094143Z` exited `0`; this report treats that as evidence of their present behavior, not proof of C-2 correctness.
- M-3 focused integration command: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts --reporter=dot` completed green (six cases).
- Anti-stub scan of the pinned changed TypeScript did not reveal a separate explicit service stub. The blocking defects are false-green provenance and a real destructive control-flow branch.

## Disposition

Do **not** mark Sprint 30 complete and do **not** write a gate pass. This review is pinned to `a0edfdd58308eb90b2352bddfc2012dcb443f339`; it does not merge, push, or move any checkout.
