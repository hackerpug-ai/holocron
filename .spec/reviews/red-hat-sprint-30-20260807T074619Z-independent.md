# Independent Red-Hat Review — Sprint 30

**Review date:** 2026-08-07  
**Target:** Sprint 30 — Cutover Rollback Drill and Data-Plane Point of No Return  
**Reviewed commit:** `0411fd275ac0bcc583f4884674c91b17446db2d2` (`main`)  
**Reviewer:** Independent red-hat review (read-only)  
**Scope:** all five D07 deliverables, merged implementation, `gate-results.json`, `gate-verification.json`, and committed drill/PONR/security evidence.  
**Live-operation policy:** No rollback, write-enable, database mutation, deployment, branch movement, merge, or push was performed for this review.

## Verdict

**NEEDS REVISION — do not treat Sprint 30 as landing-approved.** The committed gate’s `pass` result does not establish the promised rollback safety. The PONR can be removed with `TRUNCATE`; the alleged data-plane repoint changes a durable label that only `/health` consumes; the zero-loss oracle is a manually written local JSON file rather than a production-write ledger; and the required fallback boot was not executed.

The task deliverables and gate artifacts exist, but their own committed evidence is materially contradictory: D07-05 says `NEEDS_FIXES` with four CRITICAL findings, while `SPRINT.md` and `gate-results.json` record completion/pass.

## Deliverable Assessment

| Deliverable | Verdict | Evidence |
|---|---|---|
| D07-01 — RED zero-loss/PONR oracles | **FAIL** | The supposed production-write audit is only `writeFileSync` to `.tmp/D06-05/post-export-write-audit.json`; no production source calls its writer outside `rollback-repoint.ts` itself ([rollback-repoint.ts:137-140, 231-237](/Users/inference1/Projects/holocron/services/platform/src/cutover/rollback-repoint.ts:137)). |
| D07-02 — live Convex + pinned fallback build | **FAIL** | The checked-in fallback boot report is `ok:false`, `BOOT_UNVERIFIED`, with no Release artifact or Maestro session ([fallback-boot-report.json](/Users/inference1/Projects/holocron/.tmp/D07-02/fallback-boot-report.json:1)). |
| D07-03 — rollback drill | **FAIL** | It proves a secrets-backed `/health` echo, not a Convex-backed read after the re-point ([rollback-drill.ts:730-738](/Users/inference1/Projects/holocron/services/platform/src/cutover/rollback-drill.ts:730); [health.ts:396-450](/Users/inference1/Projects/holocron/services/platform/src/http/health.ts:396)). |
| D07-04 — PONR ledger/latch | **FAIL** | The PONR record is not immutable: the committed probe successfully truncated the table to zero rows ([finding-ponr-truncate-bypass-probe.json](/Users/inference1/Projects/holocron/.tmp/D07-05/finding-ponr-truncate-bypass-probe.json:1)). |
| D07-05 — security review | **PASS as a review artifact; FAIL as a release gate** | It accurately concludes `NEEDS_FIXES`, with four CRITICAL findings, rather than authorizing completion ([completion-report.json](/Users/inference1/Projects/holocron/.tmp/D07-05/completion-report.json:1)). |

## CRITICAL Findings

- [ ] **RH-S30-01 — The PONR is mutable through `TRUNCATE`, reopening rollback after the claimed point of no return.**  
  **Confidence:** High. **Severity:** Critical.  
  The migration’s trigger is only `BEFORE UPDATE OR DELETE FOR EACH ROW`; PostgreSQL does not invoke it for `TRUNCATE` ([0030_data_plane_ponr.sql:59-77](/Users/inference1/Projects/holocron/services/platform/src/db/migrations/0030_data_plane_ponr.sql:59)). The committed D07-05 probe records `truncate_succeeded:true` and `post_truncate_count:0`. Once the row is gone, `runRollbackRepoint()` treats the PONR as absent and continues to the ordinary audit check ([rollback-repoint.ts:545-638](/Users/inference1/Projects/holocron/services/platform/src/cutover/rollback-repoint.ts:545)). This directly violates the immutable-PONR and post-PONR-rejection claims.

- [ ] **RH-S30-02 — “Rollback re-point” does not switch any serving read path to Convex.**  
  **Confidence:** High. **Severity:** Critical.  
  The re-point writes `HOLO_DATA_PLANE` and `HOLO_ROLLBACK_TARGET` to secrets ([soak-fence.ts:232-252](/Users/inference1/Projects/holocron/services/platform/src/cutover/soak-fence.ts:232)). In the merged platform source, the only production consumer found for `resolveObservedDataPlane` is the health handler, which merely echoes those values in its response ([health.ts:396-450](/Users/inference1/Projects/holocron/services/platform/src/http/health.ts:396)). The drill accepts precisely that `/health` echo as its post-repoint proof ([rollback-drill.ts:716-844](/Users/inference1/Projects/holocron/services/platform/src/cutover/rollback-drill.ts:716)). No request handler is shown routing a content read to Convex. Therefore a Postgres-serving process can report `data_plane:"convex"` while still serving Postgres; the escape hatch is unproven and likely nonfunctional.

- [ ] **RH-S30-03 — The zero-loss oracle is not connected to accepted production writes and can report zero after real loss.**  
  **Confidence:** High. **Severity:** Critical.  
  `loadPostExportWriteAudit()` reads a local `.tmp` JSON file and synthesizes an empty ledger when it is absent ([rollback-repoint.ts:184-218](/Users/inference1/Projects/holocron/services/platform/src/cutover/rollback-repoint.ts:184)). Its only writer is an operator/test helper using `writeFileSync` ([rollback-repoint.ts:231-237](/Users/inference1/Projects/holocron/services/platform/src/cutover/rollback-repoint.ts:231)); a source search finds no call from a production write path. Gate step 2 merely reads that file and asserts `count == 0` ([gate-plan.json](/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/gate-plan.json:39)). Re-parsing the same manually maintained file in the drill is not an independent data-loss oracle.

- [ ] **RH-S30-04 — D07-05 proves production writes remain possible while the soak fence is armed, yet the sprint declares the all-writes-blocked gate passed.**  
  **Confidence:** High. **Severity:** Critical.  
  The committed security review records unauthenticated `seedInFlightForDrainTest` inserting five rows and unauthenticated `disableAndDrain` mass-patching rows while `HOLO_MIGRATION_READ_ONLY=1`; it also records an unauthenticated forged `recordWriteAttempt` ([findings.json](/Users/inference1/Projects/holocron/.tmp/D07-05/findings.json:1)). Its summary labels all three CRITICAL and says the T-SYNC-012 all-production-writes claim is false ([completion-report.json](/Users/inference1/Projects/holocron/.tmp/D07-05/completion-report.json:1)). The gate’s five probe surfaces do not cover these exposed Convex mutations, so its zero-write premise is invalid.

- [ ] **RH-S30-05 — The first-write/PONR sequence has a crash/failure window with writes enabled and no durable latch.**  
  **Confidence:** High. **Severity:** Critical.  
  `cutover:enable-writes` lifts the durable fence first ([ponr.ts:593-621](/Users/inference1/Projects/holocron/services/platform/src/cutover/ponr.ts:593)), then accepts an HTTP document write ([ponr.ts:623-727](/Users/inference1/Projects/holocron/services/platform/src/cutover/ponr.ts:623)), and only then inserts the PONR row ([ponr.ts:729-787](/Users/inference1/Projects/holocron/services/platform/src/cutover/ponr.ts:729)). A process/database failure after the accepted write and before/at the insert returns `PONR_INSERT_FAILED` without restoring the fence or recording a fallback latch. Combined with RH-S30-03’s file-only audit, a later rollback can be allowed despite an accepted Postgres write. The task explicitly requires a crash-recoverable, never-half-open ordering, which this path does not provide.

## HIGH Findings

- [ ] **RH-S30-06 — The gate labels fallback boot verification as passed but never invokes `cutover:verify-fallback-boot`.**  
  **Confidence:** High. **Severity:** High.  
  Gate step 3 invokes only `cutover:pin-fallback-build`, then accepts a static manifest when `ok` is true or a worktree path exists ([gate-plan.json](/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/gate-plan.json:57)). It never runs the D07-02 AC-4 command. The committed boot report instead says `BOOT_UNVERIFIED` because no pinned Release app artifact exists ([fallback-boot-report.json](/Users/inference1/Projects/holocron/.tmp/D07-02/fallback-boot-report.json:1)). A source inspection confirms that a true boot pass requires a Release artifact and successful Maestro session ([pinned-fallback-build.ts:552-661](/Users/inference1/Projects/holocron/services/platform/src/cutover/pinned-fallback-build.ts:552)).

- [ ] **RH-S30-07 — Gate execution is not tied to the reviewed commit or a compatible deployed service.**  
  **Confidence:** High. **Severity:** High.  
  The reviewed commit is `0411fd27…`, but the final gate’s only live service identity reports `sourceRevision:"09319ead…"`, deployed on 2026-08-05 ([step1.log](/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260807T073351Z/step1.log:169)). The local CLI may be new while its HTTP target is not the reviewed Sprint 30 implementation. The gate never asserts the target revision, so the claimed end-to-end result cannot validate the merged tip.

- [ ] **RH-S30-08 — Gate-verification provenance is internally inconsistent.**  
  **Confidence:** High. **Severity:** High.  
  `gate-verification.json` claims `verified:true`, but the adjacent committed raw verifier output is `{"verified":false,"reason":"no-gate-plan"}` ([gate-verification.json](/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/gate-verification.json:1); [gate-verification.json.raw](/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/gate-verification.json.raw:1)). Without a raw successful recomputation bound to the stored plan and evidence, the verification claim is not auditable.

## MEDIUM Findings

- [ ] **RH-S30-09 — The completed sprint state contradicts the completed security review’s explicit `NEEDS_FIXES` verdict.**  
  **Confidence:** High. **Severity:** Medium (process integrity; the underlying defects are CRITICAL).  
  `SPRINT.md` says completed, 5/5 tasks, and “human gate 5/5 pass”; D07-05’s own result says `NEEDS_FIXES` and lists four CRITICAL defects. A security-review task can complete as a document, but the sprint should not be represented as approved while the documented blockers remain.

## Evidence Notes

- The original final gate records a working PONR row and a `POST_PONR_INELIGIBLE` refusal ([step4.log](/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260807T073351Z/step4.log:1); [step5.log](/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260807T073351Z/step5.log:1)). That demonstrates the happy-path latch lookup, but it does not clear the immutable-ledger, routing, zero-loss, or provenance findings above.
- Static hygiene check: `git diff --check 60503101..0411fd27` reports only two trailing blank-line warnings in committed evidence logs; no finding is assigned for those cosmetic issues.

## Required Disposition

Do not land Sprint 30 as approved until the CRITICAL and HIGH findings are remediated and a fresh, tip-bound gate demonstrates: a real Convex content read after re-point; a production-bound accepted-write oracle; a non-truncatable PONR; an atomic/recoverable first-write transition; a successful pinned Release/Maestro fallback boot; and matching raw gate-verifier output.
