# Red-Hat Review Report — Sprint 30 Eighth Independent Final Closeout

**Report date:** 2026-08-07T11:40:32Z  
**Target:** Sprint 30 — Cutover Rollback Drill and Data-Plane Point of No Return; `REDHAT-FIX-RH-S30-32`  
**Reviewed commit:** `9151324aad6787a4382dda15d10aaf6e28aad788` (`main`)  
**Fresh package claimed by the handoff:** `20260807T113518Z` — source `74c3846c3f0ca335ec4bd8ebdf8691f4d0517bc8`, P1 `47dffa317f1490a1850f1750d5f02f04f47f9217`, A1 `3ab45b0b513dbe3cd6698ad3f841c2d01f7a8b1c`, lock `ec0d354c9b5c106bddb7eae9773425e7c4572cd2`, post-package `7d6ac3b0d850333bb72ceb3392f52ff6a6029956`  
**Panel:** independent C-2 evidence-binding review; C-3 security/data-integrity review; M-3 test-quality review; independent consolidation.  
**Test-reality lens:** implemented-mode audit. It used Git objects, committed evidence, safe fail-closed probes, and an isolated disposable worktree for the M-3 mutation-control check. No product code, package evidence, task file, branch, remote, or checkout was modified by this review.

## Severity Verdict

**NEEDS REVISION — 1 CRITICAL and 2 HIGH blockers. Do not approve, mark Sprint 30 complete, write a release/pass claim, merge, push, or move the checkout on the basis of this review.**

The actual `20260807T113518Z` C-3 evidence is better than the preceding package: its two raw cases show the precise complementary trigger states, and the operator-supplied marker target and canonical-alias rejection work. Its gate assertion, however, reduces that evidence to `len(cases) == 2`, so a duplicated trigger case can certify the package. M-3's fail-closed tree, manifest, and object binding are structurally sound, but the supposed real RED/mutation control accepts `vitest: command not found` and never exercises production M-3 code. Finally, the current tip contains runtime gate/control-plane changes after the last gate source revision; the C-2 verifier checks only object retention, not that the current executable source was gated.

## Residual AC Verdict Table

| Residual / AC | Verdict | Evidence |
|---|---|---|
| C-3: marker target must be operator-supplied, disposable, distinct, with seed opt-in off | PASS | `scripts/run-sprint30-human-gate.sh:384-399`; `scripts/probe-ponr-role-immutability-negative-marker.sh:19-64`; safe missing-variable probe exited before DB work; `canonical-pg-url.py:22-70` treats scheme/default-port aliases as equal. |
| C-3: actual package records each required trigger missing separately | PASS (evidence only) | P1 records both literals and exit `2`; raw package files `…/113518Z/ponr-one-trigger-missing/disable-data_plane_ponr_reject_mutation/stderr.txt:1-2` and `…reject_truncate/stderr.txt:1-2` show respectively `D/O` and `O/D`. |
| C-3: gate/package assertion proves the exact two-trigger condition | FAIL — HIGH | `scripts/run-sprint30-human-gate.sh:522-531`, `scripts/assert-human-test-verdict.sh:147-153`, and `scripts/package-sprint30-gate-evidence.sh:214-218` require only two refused/nonzero cases, not the exact `disabled_trigger` set. |
| M-3: mandatory package-bound `m3-identity`, no legacy fallback, valid non-self manifest | PASS (structural) | `scripts/assert-m3-identity-evidence.sh:34-60,158-239`; replay against P1 returned `ok:true`, 15 matching object IDs; the prior malformed package fails this assertion. |
| M-3: real RED and mutation signatures discriminate a broken production M-3 path | FAIL — CRITICAL | `scripts/capture-m3-identity-red-mutation.sh:20-59` synthesizes an untracked test with no production import; `:65-73` accepts any nonzero exit. Isolated replay accepted a `vitest: command not found` (`exit_code=127`) transcript. |
| C-2: package/object P1→A1→lock binding for `113518Z` | PASS (historical package) | Current read-only replay returned `hist_oid == sub_oid == 0c7316c8…`, `attestation_git_bound:true`; lock and package artifacts are present at the named Git objects. |
| C-2: current executable HEAD is truthfully covered by the gate/package | FAIL — HIGH | Gate records `source_sha_at_run=74c3846c…`; current reviewed tip `9151324a…` adds runtime scripts after the package. `assert-gate-evidence-containment.sh:197-204` accepts ancestor-only source binding; `:206-228` checks only lock/results object retention. |
| Human-gate verifier and release state | PARTIAL | The committed `113518Z` verifier recomputes `pass` 5/5 with no discrepancies and uses real CLI steps. `SPRINT.md` remains In Progress with no release claim, but its verifier can certify an ungated current source as above. |

## Blocking Findings

- [ ] **HIGH — C-3 accepts duplicated trigger cases, so its exact-trigger proof is fakeable.**

  The producer loop is correctly literal (`scripts/probe-ponr-one-trigger-missing-negative.sh:85-149`), and the committed package contains the right two cases. But all release-relevant consumers test only `len(cases) == 2` plus `refused`/nonzero exit (`scripts/run-sprint30-human-gate.sh:522-531`; `scripts/assert-human-test-verdict.sh:147-153`; `scripts/package-sprint30-gate-evidence.sh:214-218`). A report containing mutation twice with `{refused:true, probe_rc:2}` satisfies that predicate while omitting truncate; an exact-set predicate rejects it. This violates the requested proof of each missing required trigger, not merely a count.

  **Remediation:** Require the exact set `{data_plane_ponr_reject_mutation, data_plane_ponr_reject_truncate}` with no duplicates or extras in producer, gate, package, and assertion. Bind and inspect each raw `disable-<trigger>/exit.code` and `stderr.txt`, requiring that trigger `D` and the other `O`; create a fresh package and a negative duplicate-case assertion.

- [ ] **CRITICAL — M-3's RED/mutation control can pass when Vitest never ran and is disconnected from production M-3 behavior.**

  The capture script writes a temporary local fixture containing only synthetic IDs and `expect()` calls (`scripts/capture-m3-identity-red-mutation.sh:20-39`), captures any command exit (`:42-44`), then prepends text containing the assertion and mutation labels (`:47-59`). It rejects only exit `0` (`:65-73`). In an isolated target-SHA worktree, the capture script returned success with inner `exit_code=127` and `vitest: command not found`; after placing that transcript in a temporary evidence copy and regenerating a valid manifest, `assert-m3-identity-evidence.sh` returned `ok:true`. Its signature matcher accepts the script-authored `expect(`/`vitest` labels (`scripts/assert-m3-identity-evidence.sh:77-119`). The real M-3 integration oracle exists separately at `services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts:408-483`, but the capture never imports or mutates it.

  **Remediation:** Require `command -v vitest` and the expected Vitest failure code before capture succeeds; validate raw framework output before adding metadata and reject command-not-found/non-Vitest failures. Replace the self-contained fixture with a controlled mutation of the actual `runEnableWrites` / independent HTTP-201 identity path, preserving a RED transcript whose failure could not be generated by a non-executed test.

- [ ] **HIGH — C-2's HEAD predicate treats old gate evidence as current after runtime changes.**

  The claimed package ran source `74c3846c…`; `8b681dcc…` subsequently introduced the durable control-plane re-arm scripts and the reviewed current tip `9151324a…` introduced the gate-ledger reset and modified `run-sprint30-human-gate.sh`. Neither is in the source revision recorded by the `113518Z` gate. The C-2 assertion passes because it only demands that the source be an ancestor of P1 (`scripts/assert-gate-evidence-containment.sh:197-204`) and that the old lock/results blobs remain at HEAD (`:206-228`). This is an object-integrity check, not executable-HEAD coverage.

  **Remediation:** Commit the runtime change first and execute/package a new gate whose `git_sha`, `source_sha_at_run`, and deployed `sourceRevision` equal that committed source. Make the C-2 assertion reject non-evidence/runtime changes after the gate source, or explicitly constrain and verify an allowed post-package delta.

## Checks Re-run

- `python3 scripts/lib/canonical-pg-url.py equal postgres://…/holocron postgresql://…:5432/holocron` returned `equal` with exit `1`; direct marker-probe tests also refused missing marker input and a same-target alias before DB use.
- `ASSERT_EVIDENCE_CONTAINMENT=1 ASSERT_PACKAGE_HEAD=1 ASSERT_C3_PREDICATES=1 bash scripts/assert-human-test-verdict.sh <gate-results> <113518Z-evidence>` returned `0`, correctly proving the historical P1/A1/lock chain but exposing the source-HEAD gap described above.
- `ASSERT_PACKAGE_COMMIT=47dffa31… ASSERT_M3_RUN_ID=20260807T113518Z bash scripts/assert-m3-identity-evidence.sh <113518Z-evidence>` returned `0` with 15 package object matches. The same assertion rejected the historic malformed package.
- The committed verifier evidence reports `verified:true`, five planned/recomputed steps, and no discrepancies. The step logs name real CLI invocations rather than a wholesale test-suite command.

## Agent Reports (Summary)

- **C-3 security/data-integrity lens:** marker target, seed default, canonical rejection, and actual raw evidence pass; exact-set consumer oracle fails.
- **M-3 test-quality lens:** package structure passes; RED/mutation transcript is test theatre and accepts a missing Vitest binary.
- **C-2 evidence-binding lens:** P1/A1/lock bytes are sound; current source is not gate-covered.

## Disposition

This is a review-only verdict on `9151324aad6787a4382dda15d10aaf6e28aad788`. The package now cited in the task is internally object-bound, but it is not sufficient to approve the current tip. Sprint 30 remains **In Progress** and must remain unapproved until all three high findings are remediated and a fresh source-matching package is independently reviewed.
