# Red-Hat Review — Sprint 30 Remediation

**Report date:** 2026-08-07T08:57:06Z  
**Target:** Sprint 30 — Cutover Rollback Drill and Data-Plane Point of No Return  
**Reviewed commit:** `2ff0e6c40e9ec49bcae821b45c1d7eff19a29925` (`fix(REDHAT-FIX-RH-S30-06): drop step3 expect_not_log_regex self-match`)  
**Scope:** Current `HEAD`; D07-01..05; REDHAT-FIX-RH-S30-01..08; gate run `20260807T084614Z`; raw evidence, PONR/accepted-write ledger, Convex read/fence, fallback boot, revision binding, and verifier fidelity.  
**Review mode:** Independent red-hat, read-only. No merge, push, checkout move, product-code change, or task-file edit was performed.

## Verdict

**NEEDS REVISION — do not approve or land this SHA as the Sprint 30 remediation.**

The stored gate can be mechanically recomputed: all five literal-command digests match, the raw verifier reports `verified:true`, and a fresh read-only recomputation also exited zero. The gate's happy path also records the reviewed and deployed revision as `2ff0e6c…`. Those facts do not clear the two critical defects below: an accepted first write can still leave the fence open with neither PONR nor recovery, and the gate/evidence that claims remediation completion is not contained in the SHA being reviewed.

## Evidence and revision binding

- Run `20260807T084614Z` claims `git_sha`, `source_sha`, and `/health` `sourceRevision` all equal `2ff0e6c40e9ec49bcae821b45c1d7eff19a29925`: `gate-results.json:15-23` and every `step*.log` `@@GATE-META` header.
- Step command SHA-256 values recompute to the `cmd_sha` in each raw log. The independent read-only invocation of `verify-gate-evidence.sh` returned exit 0 and `recomputed_verdict:"pass"` on the stored plan and evidence.
- The four verifier copies are byte-identical for this run (`gate-verification.json`, `.raw`, and the two evidence-dir copies); `verify-stdout.json` is the captured verifier stdout. That satisfies the *same-stdout* portion of RH-S30-08 AC-1.
- The binding is not land-auditable: at review time `gate-results.json`, both root verifier files, every RH-S30 remediation task/status update, and the entire `20260807T084614Z` evidence directory are dirty/untracked. `git ls-tree HEAD` contains only older `071128Z`–`073351Z` evidence. Landing `2ff0e6c…` therefore does not carry the asserted run, its raw logs, or the remediation acceptance changes.

## Remediation AC verdicts

| Fix | Acceptance criterion | Verdict | Evidence / reason |
|---|---|---|---|
| RH-S30-01 | AC-1: direct TRUNCATE fails closed | PASS (narrow DML/TRUNCATE claim) | `0031_data_plane_ponr_truncate_guard.sql:21-24`; run tests/logs record `PONR_IMMUTABLE`. See H-3 for owner-DDL limit. |
| RH-S30-01 | AC-2: row survives; repoint refuses | PASS | Gate step 5 returns exit 2 / `POST_PONR_INELIGIBLE`; `step5.log`. |
| RH-S30-02 | AC-1: Convex content GET | PASS | `hono-app.ts:381-403`, `data-plane-content.ts:49-97`; step 1 has a real Convex content probe. |
| RH-S30-02 | AC-2: drill requires content probe | PASS | `rollback-drill.ts:901-911`; `step1.log` reports `source:"convex"` and a document identity. |
| RH-S30-03 | AC-1: POST increments durable ledger | PASS (one surface) | `hono-app.ts:421-447`; `sprint30-redhat-rh-s30.test.ts:78-124`. |
| RH-S30-03 | AC-2: absent ledger refuses | PASS | `post-export-write-audit.ts:314-345`; `rollback-repoint.ts:608-625`. |
| RH-S30-03 | AC-3: deleting `.tmp` does not zero DB oracle | PASS | `post-export-write-audit.ts:348-399`; `sprint30-redhat-rh-s30.test.ts:127-167`. |
| RH-S30-04 | AC-1: unauthenticated drain/seed/audit rejects | **PARTIAL** | `disableAndDrain`, `seedInFlightForDrainTest`, and `recordWriteAttempt` are guarded, but `recordFenceArmed` remains an unauthenticated mutation; H-1. |
| RH-S30-04 | AC-2: authorized drain remains usable | PASS | `migrationFence/drain.ts:217-235`, `473-485`; operator-secret path exists. |
| RH-S30-05 | AC-1: any post-201/PONR-insert failure re-arms and refuses | **FAIL** | C-1: recovery is reached only after PONR insertion, not every post-commit first-write failure. |
| RH-S30-05 | AC-2: happy PONR/idempotency | PASS | `ponr.ts:525-557`, `791-826`; gate step 4 is a successful first record. |
| RH-S30-06 | AC-1: step 3 runs fallback boot verification | PASS | `gate-plan.json` step 3; `step3.log` executes `cutover:verify-fallback-boot`. |
| RH-S30-06 | AC-2: requires `ok:true`, rejects boot failure | PASS | `gate-plan.json` step 3 assertion and `pinned-fallback-build.ts:678-714`. |
| RH-S30-07 | AC-1: results bind `git_sha` to HEAD | PASS for the observed run | Gate root/evidence result has `git_sha == 2ff0e6c…`; C-2 prevents treating it as a landed proof. |
| RH-S30-07 | AC-2: logs bind deployed revision | PASS for the observed run | all five raw log headers have matching `sourceRevision`; runner fails mismatches at `run-sprint30-human-gate.sh:59-118`. |
| RH-S30-08 | AC-1: root raw and verified output agree | PASS | byte-identical captured verifier output; independently recomputed as pass. |
| RH-S30-08 | AC-2: `assert-human-test-verdict` and verifier exit 0 | **FAIL** | No such invocation/evidence exists. `run-sprint30-human-gate.sh:301-335` runs only `verify-gate-evidence.sh`; repository search finds no `assert-human-test-verdict` implementation or captured result. |

## Findings

### CRITICAL

- [ ] **C-1 — First-write failures before PONR insertion can leave writes enabled after a committed document.** Confidence: **HIGH**.

  `runEnableWrites` lifts the durable fence at `ponr.ts:642-670`, then calls the real document POST. A non-201 response (including Hono's explicit `post_export_write_audit_failed` response after its document INSERT) returns immediately at `ponr.ts:695-711`; fetch/JSON/reselect failures also return at `ponr.ts:740-775`. None calls `recoverEnableWritesCrashWindow`. The recovery is invoked solely from the later PONR INSERT catch at `ponr.ts:778-860`.

  The server makes this reachable: it INSERTs the document first (`hono-app.ts:421-426`), then records the audit; if that second operation fails it returns HTTP 500 with the accepted `documentId` (`hono-app.ts:427-445`). Thus an accepted write can receive a non-201 response that `runEnableWrites` treats as a simple failure while leaving `HOLO_MIGRATION_READ_ONLY=0`, without PONR or guaranteed recovery ledger record. The RH-S30-05 test only injects the later PONR-insert failure (`sprint30-redhat-rh-s30.test.ts:214-242`), so it cannot distinguish this regression.

- [ ] **C-2 — The claimed remediation gate and raw evidence are not part of the reviewed SHA.** Confidence: **HIGH**.

  The source code has no relevant dirty changes, but the status/AC files, `gate-results.json`, both root verifier files, and all `20260807T084614Z` step evidence are absent from `HEAD` and dirty/untracked in this checkout. `HEAD:gate-results.json` instead names the older `20260807T073351Z` run and `HEAD:gate-verification.json.raw` was the historical `no-gate-plan` failure. A merge of `2ff0e6c…` cannot reproduce or audit the new 5/5 claim. This contradicts RH-S30-07's purpose of binding evidence to the reviewed/landed revision and the landing contract's requirement for an auditable SHA.

### HIGH

- [ ] **H-1 — `recordFenceArmed` remains a public, unauthenticated way to forge the PONR prerequisite.** Confidence: **HIGH**.

  `convex/migrationFence/audit.ts:36-49` accepts a raw public mutation without an `operatorSecret`. `cutover:enable-writes` accepts any nonempty `latestFenceArmed` row (`ponr.ts:280-293`) and substitutes an armed value when it cannot observe the deployment environment (`ponr.ts:335-342`). The green fence scanner deliberately skips `migrationFence/**` (`convex-fence-client.ts:1351-1369`), so its empty result does not cover this surface. RH-S30-04 fixed three related paths, not this one.

- [ ] **H-2 — Neither irreversible data-plane CLI has an authorization boundary.** Confidence: **HIGH**.

  `runEnableWrites` accepts paths and operator metadata only (`ponr.ts:477-501`); `runRollbackRepoint` likewise has no credential/approval check (`rollback-repoint.ts:414-441`) before writing the durable control plane. This is an explicitly documented D07-05 AC-6 finding (`sprint30-security-review.test.ts:539-645`), not an inferred remote privilege escalation; local filesystem/CLI authority is required. It remains a release risk and is not remediated by RH-S30-01..08.

- [ ] **H-3 — PONR immutability does not withstand the owner-DDL escape that the test harness itself uses.** Confidence: **MEDIUM**.

  Normal app-role DML and bare owner TRUNCATE are defended by grants/triggers (`0030_data_plane_ponr.sql:45-77`, `0031_data_plane_ponr_truncate_guard.sql:21-24`). But the owner/test connection can disable both triggers, TRUNCATE, and re-enable them (`sprint30-cutover-harness.ts:539-563`); the migration openly documents this at `0031_data_plane_ponr_truncate_guard.sql:5`. D07-05 specifically requires determining whether that escape is reachable/auditable (`D07-05...md:472`), yet the supplied gate contains no probe or role-provenance evidence. The narrower two ACs pass; the broader “DB-immutable” release claim remains unproved.

- [ ] **H-4 — RH-S30-08 AC-2 is asserted checked but neither of its claimed provenance gate runs is captured.** Confidence: **HIGH**.

  The current runner performs verifier recomputation only (`run-sprint30-human-gate.sh:301-335`). It does not invoke an assertion command, does not save an assertion stdout/exit code, and there is no repository entrypoint or evidence bearing `assert-human-test-verdict`. Consequently the remediation's checked AC-2 is unsupported even though RH-S30-08 AC-1's same-stdout recompute is valid.

### MEDIUM

- [ ] **M-1 — Gate metadata permanently says `running`.** Confidence: **HIGH**.

  The runner writes `meta.json` with `status:"running"` at `run-sprint30-human-gate.sh:129-144` and never updates it. The cited run's `meta.json:9` still says `running` despite root results claiming a completed pass. Consumers that correctly privilege run metadata cannot distinguish a completed run from an interrupted one.

- [ ] **M-2 — The raw verifier proves log/plan consistency, not the underlying external state.** Confidence: **HIGH**.

  `verify-gate-evidence.sh` correctly checks command SHA, stored exit code, and regex matches; it has no external-state attestation for the Postgres row, Convex content body, installed Release artifact, or deployed runtime. This is why the verifier passes the stored data and is not itself a finding of forgery. Its scope must not be described as an independent production re-execution.

### LOW

- [ ] **L-1 — Step 3's summary loses the pinned commit identity.** Confidence: **HIGH**.

  `step3.log` first emits the verifier's `commit_sha`, but its final Python summary emits `short_sha:null` because it looks for `short_sha`/`commit`, not `commit_sha`. The step still has a real `ok:true` boot report; this is a traceability defect, not a boot failure.

## What held under review

- PONR's normal INSERT/UPDATE/DELETE/TRUNCATE checks and singleton index are real mechanisms, not stubs (`0030_data_plane_ponr.sql:35-77`; `0031...:21-24`).
- Post-PONR repoint is correctly DB-latch-backed and fails closed on an unreadable PONR ledger (`rollback-repoint.ts:478-527`); the observed step 5 emitted `POST_PONR_INELIGIBLE` with exit 2.
- The rollback drill's post-repoint content oracle is a real Convex query rather than a health-label echo (`data-plane-content.ts:177-229`, `rollback-drill.ts:901-911`).
- Step 3 ran the required Release/Maestro fallback boot command and its raw log contains a `maestro_session_log` result. `runVerifyFallbackBoot` itself fails closed when the release artifact, simulator, Maestro flow, or command is absent (`pinned-fallback-build.ts:500-714`).

## Required disposition

1. Keep Sprint 30 **In Progress** and do not land/approve `2ff0e6c…` as the remediation result.
2. Close the full post-fence-lift, post-commit failure window (including non-201 responses containing an accepted document and lost/invalid responses), with a real-state test proving re-arm plus durable refusal.
3. Address or explicitly accept the three authorization/immutability exposures: public `recordFenceArmed`, unauthenticated irreversible CLIs, and owner-trigger disable reachability/audit.
4. Commit the reviewed evidence and remediation status atomically with the source SHA that it attests; then run a new tip/deployed-bound gate. Capture the provenance assertion called by RH-S30-08 AC-2 in that run.

*Landing note: this report reviews `2ff0e6c40e9ec49bcae821b45c1d7eff19a29925` in place. It does not merge, push, move a checkout, or land work. The run stage remains responsible for any eventual merge after approval.*
