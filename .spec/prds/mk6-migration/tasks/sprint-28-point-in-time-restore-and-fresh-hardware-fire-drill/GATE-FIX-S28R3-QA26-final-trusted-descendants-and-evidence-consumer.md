# GATE-FIX-S28R3-QA26 — Final trusted descendants and immutable evidence consumer

> Status: ✅ Completed
> Commit: adf67adc43e3a108baf8aab117be43fa55773a93
> Reviewer: product+technical dual-lens APPROVED
> Completed: 2026-07-30T09:45:01Z

**Task id:** `GATE-FIX-S28R3-QA26`  
**Sprint:** sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill  
**Binding review:** `red-hat-20260730T065943Z-sprint-28-main-sha-4a38e6f27ac7e368d12d80076e7cb25797ec86ab.md`  
**Reviewed SHA:** `4a38e6f27ac7e368d12d80076e7cb25797ec86ab`  
**Starting main SHA:** `fd73cca520eecfaaf6b9567cd328d9f811eaeba6`

## Intent

Close all three CRITICAL and two HIGH findings from the binding independent Terra High review without weakening any credential, provenance, parity, lifecycle, or whitespace contract. The post-review `fd73cca5` validator change is not an approval and remains in scope: no validator or test code may be accepted as evidence-only after the sequence's bound code SHA.

## Acceptance criteria

- [x] Every credential-bearing `psql` and `pg_ctl` selection in `restore.ts`, `r2-provision.ts`, `recovery-baseline.ts`, and all reached descendants refuses any executable that is not fixed, absolute, regular, non-symlinked, root-owned, and not group/other-writable. No existing absolute override or Homebrew fallback bypasses root-trust validation, and refusal happens before credentials are constructed or made ambient.
- [x] Literal hostile executable tests reach the real TypeScript `psql` and `pg_ctl` selection paths, including absolute overrides and Homebrew candidates, and prove the candidate cannot execute or observe a credential-bearing environment.
- [x] The sequence proof uses a stable two-commit layout: a frozen code commit containing the final validator/tests/product code, followed only by an immutable evidence commit. The record binds to the frozen code commit; `git diff <record-sha>..HEAD` permits only an explicit minimal list of immutable evidence/task-status files. Validator code, tests, product code, whole directories, task-stem prefixes, and QA24 trees are never allowlisted.
- [x] From a clean detached checkout of the final evidence commit, the sequence validator recomputes both non-zero full-suite totals and the live R2 exit-zero proof from durable logs. Mutation tests reject non-ancestor SHAs and every post-bind validator/test/product change.
- [x] A production read-only D05-04 consumer validates the committed bundle without creating, copying, or rewriting the bundle it is judging. The bundle comes from a real current D05-04 execution and includes consistent non-zero pre-failure/restored database counts plus all 11 pre/restored object identities, with `blob_parity` and summary flags agreeing with those identities.
- [x] Negative controls operate on disposable copies and actually delete, replace, mismatch, and zero linked summary/attestation/parity/baseline/object artifacts. Each mutation must be rejected by the same production read-only consumer used for the positive control.
- [x] Every QA26 disposable container, retry container, network, volume, staging directory, test host, child PID, and retained log has unconditional `finally`/trap cleanup. A second run succeeds and leaves zero resources matching only the QA26 namespace; unrelated Docker resources are untouched.
- [x] The production-boundary proof is clean-detached and path-independent: it discovers checkout-local inputs, uses only explicitly supplied secret paths outside the archive when necessary, retains a durable argv/PID/child-log transcript with secrets redacted, and cannot accept provision exit 1 merely because `paths.txt` exists.
- [x] `git diff --check 4630c1b4aa6019507af13435862801777b11a93d..HEAD` exits 0 and the QA26 gate executes that exact range rather than a selected-file approximation.
- [x] The real D05-04 proof is rerun for any execution/evidence-shape change. No recorder, generated test bundle, synthetic identifier, summary-only substitute, skipped command, or weakened assertion can satisfy completion.
- [x] D05-01 through D05-06 scenario contracts, TypeScript, focused QA21–QA26 tests, shell/Python checks, the exact full Sprint 28 suite, live R2 proof, strengthened sequence validator, D05 consumer, lifecycle cleanup, and dual-lens independent review all pass.
- [x] Independent review is bound to the final stable branch/evidence commit with `CRITICAL=0` and `HIGH=0` before landing. The primary checkout remains on `main`; user WIP, `.env`, unrelated Sprint 27 artifacts, `.tmp` changes, hands-off surfaces, and `stash@{0}` remain untouched.

## Required durable outputs

- Final sequence record and all referenced logs, bound to the frozen code commit.
- Real D05-04 bundle with pre/restored row and object identity parity.
- Read-only consumer positive and destructive-mutation evidence.
- Disposable-resource before/after inventory showing zero QA26 leftovers.
- Exact whitespace, focused, full-suite, live R2, validator, and independent-review results.

