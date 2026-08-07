# Red-Hat Review — Sprint 30 Independent Closeout

**Report date:** 2026-08-07T09:22:37Z  
**Target:** Sprint 30 — Cutover Rollback Drill and Data-Plane Point of No Return  
**Reviewed commit:** `25db7f9e76ab7cdf8dd0133878cd035c03c1e414` (`main`)  
**Remediation source commit:** `09aae0dd2f5293b617a476fc8df585272f37b04a`  
**Evidence-package ancestor:** `5433b6a532f42311fb931885d9935e526773d064`  
**Scope:** independent post-remediation review of RH-S30-09..16, including landed run `20260807T091354Z`. `main` advanced from `5433b6a5` to the reviewed `25db7f9e` while review was in progress; the added delta contains only Sprint 30 handoff/status material, which is included below.  
**Reviewed by:** red-hat reviewer; `mastra-reviewer`; `security-reviewer`; `test-quality-reviewer`  
**Test-reality lens:** ran (implemented mode).

## Verdict

**NEEDS REVISION — 2 CRITICAL findings; do not approve, merge, push, or mark Sprint 30 complete.**

The stored gate recomputes cleanly and the assertion reports a complete 5/5 pass, but those are not substitutes for its required provenance binding or safe PONR protection. The current landing tip makes an explicit finalization claim that is contradicted by the tree and by the newly-added DDL probe.

## Contract Rechecks

| Prior finding / remediation | Verdict | Evidence |
|---|---|---|
| C-1 / RH-S30-09: post-fence-lift first-write window | PASS in source; test coverage gap noted below | Recovery is reached for non-201/body failure at `services/platform/src/cutover/ponr.ts:733-760`, missing reselect at `:789-811`, transport/parse error at `:824-848`, and PONR insert failure at `:876-935`. |
| C-2 / RH-S30-10: atomic, tip-bound evidence package | **FAIL — CRITICAL** | The run binds `git_sha` and `source_sha` to `09aae0dd…`, but `git show 09aae0dd:<sprint>/.gate-evidence/20260807T091354Z/gate-results.json` fails (path absent). The evidence first appears in `5433b6a5`; RH-S30-10 AC-3 requires the containing SHA or an ancestor that already carries the same evidence tree. |
| H-1 / RH-S30-11: `recordFenceArmed` authorization | PASS | `convex/migrationFence/audit.ts:40-70` requires a configured, matching `operatorSecret` before insert. |
| H-2 / RH-S30-12: irreversible CLI authorization | PASS | `ponr.ts:535-550` refuses before fence lift; `rollback-repoint.ts:445-483` refuses before control-plane work; CLI maps the stable code to non-zero exits at `holo.ts:3652-3665,3711-3723`. |
| H-3 / RH-S30-13: owner-DDL PONR immutability | **FAIL — subsumed by CRITICAL C-3** | The probe is not gate-invoked and is destructive before it proves the role is non-owner/non-superuser. |
| H-4 / RH-S30-14: invoked human-test verdict assertion | PASS | Runner invokes and captures it at `scripts/run-sprint30-human-gate.sh:361-371`; stored exit is `0`; independent assertion recomputed zero. |
| M-1 / RH-S30-15: durable terminal gate meta | PASS | Stored `meta.json` says `status:"completed"`, with verifier/assertion exit codes; finalization code is `run-sprint30-human-gate.sh:373-406`. |
| M-2 / RH-S30-16: verifier scope | PASS | Scope is explicitly limited to log/plan consistency at `run-sprint30-human-gate.sh:17-20` and `assert-human-test-verdict.sh:17-18`. |
| L-1 / RH-S30-16: pinned fallback identity | PASS | Gate step 3 emits non-null `commit_sha` and derived `short_sha` in `.gate-evidence/20260807T091354Z/step3.log`. |

## Critical Findings

- [ ] **C-2 re-opened — the claimed tip-bound gate is not bound to a commit that carries its evidence.** Severity: **CRITICAL**. Confidence: **HIGH**.

  The committed run results, metadata, and finalization all identify `09aae0dd2f5293b617a476fc8df585272f37b04a` as `git_sha`/`source_sha`: `.gate-evidence/20260807T091354Z/gate-results.json` and `meta.json`. That commit does not contain `.gate-evidence/20260807T091354Z`; the entire package first lands in `5433b6a5`, and the finalization record at `25db7f9e` acknowledges the split as `source_sha:09aae0dd` versus `evidence_sha:5433b6a5`.

  This violates RH-S30-10 AC-3's explicit containment rule: a claimed parent is valid only when it *still carries the same evidence tree*. It does not. `assert-human-test-verdict.sh` only checks for a 40-hex SHA (`scripts/assert-human-test-verdict.sh:50-62`), so it can return success for this invalid binding; `verify-gate-evidence.sh` likewise recomputes log/plan consistency, not Git-tree containment.

  **Required remediation:** produce a fresh gate run whose `git_sha` names an evidence-containing commit under a documented atomic protocol, or change the protocol so the committed package proves the exact source/evidence tree pair and verifier rejects a non-containing SHA. Re-run both assertion and verifier against that package; do not hand-edit the result.

- [ ] **C-3 — the RH-S30-13 “role-provenance probe” can destroy the PONR record before it validates the role.** Severity: **CRITICAL**. Confidence: **HIGH**.

  `scripts/probe-ponr-role-immutability.sh:18-26` reads the supplied `DATABASE_URL`, then immediately executes `ALTER TABLE data_plane_ponr DISABLE TRIGGER ALL`, `TRUNCATE data_plane_ponr`, and `UPDATE`. It checks whether the connection is superuser and whether those operations should fail only afterwards at `:47-54`; it has no transaction/rollback, owner/non-superuser preflight, or trigger re-enable. An owner/superuser or misconfigured operator URL therefore erases the irreversible PONR latch and leaves its protections disabled before the script exits non-zero.

  The `20260807T091354Z` plan has no invocation of this probe, so the gate does not establish the AC's required production-role SQLSTATE evidence. The target's own finalization nevertheless lists H-3 as closed: `.gate-evidence/20260807T091354Z/redhat-remediation-round2-completion.json:6-16`.

  **Required remediation:** replace the destructive sequence with a non-mutating, non-owner preflight (or an isolated disposable DB transaction that is guaranteed to roll back), require and verify the application role before issuing any DDL/DML, and make the role/SQLSTATE proof a gate-owned artifact. Never run the present script against a database holding a PONR record.

## Medium Finding

- [ ] **M-3 — RH-S30-09's newly widened failure branches lack a direct integration oracle.** Confidence: **MEDIUM**.

  `services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts:170-244` covers the older injected PONR-insert failure only. It does not simulate non-201-with-accepted-id, a response parse/transport failure, or reselect miss, despite RH-S30-09 AC-2/AC-3 requiring those real-path probes. Source inspection supports the recovery calls, but a future change can remove one branch without this suite going red.

  **Required remediation:** add real integration cases for all three post-lift branches with assertions on both the durable re-armed fence and durable rollback refusal.

## Gate Evidence Audit

Read-only reruns against the landed `20260807T091354Z` artifacts:

- `bash scripts/assert-human-test-verdict.sh <run>/gate-results.json <run>` → exit 0; 5 executed/passed steps; no assertion errors.
- `bash .../verify-gate-evidence.sh <run>/gate-results.json gate-plan.json <run>` → exit 0; `verified:true`, `recomputed_verdict:"pass"`, 5/5 steps.
- All four stored verifier copies have the same SHA-256: `17f86eaba721426cadff87fdb0362a9fca46bea243b21acb87f3bb7aecc7f886`.

Those checks prove artifact consistency only. They do not cure C-2's impossible source-tree binding or C-3's unsafe, uninvoked role probe.

## Agent Reports (Summary)

- `mastra-reviewer`: independently identified C-2's non-containing SHA and C-3's destructive probe path.
- `security-reviewer`: independently confirmed C-2 and audited the handoff/finalization claim.
- `test-quality-reviewer`: test-reality lens requested; its focused outcome is pending at report generation, so the M-3 coverage finding is retained as an independent review finding rather than treated as panel consensus.

## Disposition

Route **C-2** and **C-3** back to the live Sprint 30 remediation run. The current `main` tip remains `25db7f9e76ab7cdf8dd0133878cd035c03c1e414`; this review neither moves it nor changes any product, task, gate-result, gate-verification, or sprint-state file.
