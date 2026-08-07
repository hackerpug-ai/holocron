# REDHAT-FIX-RH-S30-19 — PLATFORM_IT oracles for all three injectFirstWriteFailure post-lift branches (M-3)

> **Task ID:** REDHAT-FIX-RH-S30-19
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `mastra-implementer`
> **Priority:** P1
> **Type:** FIX
> **Severity:** MEDIUM
> **Source finding:** M-3
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T092237Z-independent-closeout.md` (independent closeout @ 25db7f9e)
> **Proposed by:** `mastra-planner`
> Status: Backlog — plan only (do not treat as fixed until dual-lens APPROVED + landed)

## Finding

**M-3 — RH-S30-09's newly widened failure branches lack a direct integration oracle.** Confidence: MEDIUM.

RH-S30-09 closed the full post-fence-lift first-write failure window in product code and exposed `injectFirstWriteFailure` kinds (`non_201_accepted_id` | `transport_error` | `reselect_miss`). Independent closeout M-3 finds the integration suite still only exercises the older `injectPonrInsertFailure` path (`sprint30-redhat-rh-s30.test.ts:170-244`). There is no direct PLATFORM_IT oracle that drives each of the three post-lift inject kinds end-to-end and asserts **both** durable fence re-arm (`HOLO_MIGRATION_READ_ONLY` 1/true) **and** durable rollback-repoint refusal (`POST_EXPORT_WRITE_ACCEPTED` or `POST_PONR_INELIGIBLE`). A future regression can delete a recovery branch without the suite going red.

This task is primarily a **test-oracle** remediation; product inject hooks already exist on main and should not be reinvented unless a live case proves a gap.

## Scope (WRITE-ALLOWED)

- `services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts`
- `services/platform/tests/integration/sprint30-cutover-harness.ts` (only if helper needed)
- `services/platform/src/cutover/ponr.ts` (only if a live oracle proves a real recovery bug)
- `.tmp/REDHAT-FIX-RH-S30-19/**`
- This task file / status notes

## Acceptance Criteria

- [ ] **AC-1** PLATFORM_IT case drives `runEnableWrites` with `injectFirstWriteFailure.kind='non_201_accepted_id'` (real Postgres + disposable secrets + pre-existing serving health). Result is `ok:false`; durable fence is re-armed (`readDurableMigrationReadOnly` is `1` or `true`); durable post-export accepted-write audit exists for the claimed `documentId`; subsequent `runRollbackRepoint` refuses with `POST_EXPORT_WRITE_ACCEPTED` or `POST_PONR_INELIGIBLE` (`repointed:false`). Evidence under `.tmp/REDHAT-FIX-RH-S30-19/`.
- [ ] **AC-2** PLATFORM_IT case drives `injectFirstWriteFailure.kind='transport_error'`. Result is `ok:false`; durable fence re-armed; durable audit/refusal latch exists; subsequent `runRollbackRepoint` refuses with `POST_EXPORT_WRITE_ACCEPTED` or `POST_PONR_INELIGIBLE`.
- [ ] **AC-3** PLATFORM_IT case drives `injectFirstWriteFailure.kind='reselect_miss'` (must complete real POST `/api/documents` 201 then force the reselect-miss recovery path). Result is `ok:false`; durable fence re-armed; durable audit records the accepted `write_row_id`; subsequent `runRollbackRepoint` refuses with `POST_EXPORT_WRITE_ACCEPTED` or `POST_PONR_INELIGIBLE`.
- [ ] **AC-4** Existing RH-S30-05 `injectPonrInsertFailure` crash-window case remains green. Happy-path enable-writes / PONR latch coverage remains green. Product recovery call sites for the three inject kinds remain reachable (no deletion of `recoverEnableWritesCrashWindow` on those branches).
- [ ] **AC-5** Evidence package under `.tmp/REDHAT-FIX-RH-S30-19/` contains per-branch enable-writes reports, fence snapshots, ledger/audit snapshots, rollback-refuse reports, suite log, and a branch-oracle map.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | `non_201_accepted_id` inject yields `report.ok===false` + first-write failure code | AC-1 | evidence JSON |
| TC-2 | After non_201 path, fence is 1/true and audit durable | AC-1 | fence+ledger JSON |
| TC-3 | After non_201 path, rollback refuses with POST_EXPORT_WRITE_ACCEPTED or POST_PONR_INELIGIBLE | AC-1 | refuse JSON |
| TC-4 | `transport_error` inject: ok:false + fence re-arm + refuse codes | AC-2 | transport-* artifacts |
| TC-5 | `reselect_miss` after real 201: ok:false + fence + accepted audit + refuse | AC-3 | reselect-* artifacts |
| TC-6 | RH-S30-05 injectPonrInsertFailure case still passes in same file | AC-4 | suite green / green txt |
| TC-7 | Happy-path / PONR success path not regressed | AC-4 | regression note |
| TC-8 | Cases serialize via withCutoverSharedLock; PLATFORM_IT=1; truncate/seed per case | AC-5 | code review + suite log |

## Anti-stub

- Do not claim coverage by only grepping `recoverEnableWritesCrashWindow` call sites — each inject kind must execute under PLATFORM_IT with real Postgres + real secrets fence re-arm + real rollback-repoint refuse.
- Do not mock away `recoverEnableWritesCrashWindow` or `runRollbackRepoint`.
- Do not invent a second inject API if `injectFirstWriteFailure` already covers the three kinds; only touch `ponr.ts` if a live oracle proves a product gap.
- Do not assert only `report.ok===false` without durable fence + durable rollback refuse (both required).
- Do not hand-write evidence JSON as a substitute for test-generated artifacts.
- Do not delete or weaken the RH-S30-05 case.
- Do not use production soak secrets or prod `DATABASE_URL`.
- Do not expand into C-2 gate rebinding or C-3 role probe.

## Critical Constraints

- **MUST** add three distinct PLATFORM_IT cases (one per inject kind) asserting ok:false + fence re-armed + rollback refuse codes
- **MUST** use existing `injectFirstWriteFailure` on `runEnableWrites`; pattern after RH-S30-05 case
- **MUST** serialize with `withCutoverSharedLock`; truncate PONR + seed watermark/audit per case
- **NEVER** leave `HOLO_MIGRATION_READ_ONLY` lifted without a durable latch after a post-lift failure under test
- **NEVER** replace integration oracles with unit-only stubs that call `recoverEnableWritesCrashWindow` directly without going through `runEnableWrites` inject kinds
- **STRICTLY** refuse codes must be `POST_EXPORT_WRITE_ACCEPTED` or `POST_PONR_INELIGIBLE` — not soft freeform message matching alone
- **STRICTLY** each inject kind has its own `it()` so a removed branch fails only that oracle

## Evidence

`.tmp/REDHAT-FIX-RH-S30-19/`

Required artifacts (minimum):

| Artifact | Proves |
|----------|--------|
| `non-201-accepted-id-enable-writes.json` | AC-1 inject path fail-closed |
| `non-201-accepted-id-fence-ledger.json` | fence re-armed + audit durable |
| `non-201-accepted-id-rollback-refuse.json` | refuse codes |
| `transport-error-enable-writes.json` | AC-2 |
| `transport-error-fence-ledger.json` | AC-2 fence/audit |
| `transport-error-rollback-refuse.json` | AC-2 refuse |
| `reselect-miss-enable-writes.json` | AC-3 |
| `reselect-miss-fence-ledger.json` | AC-3 fence/audit |
| `reselect-miss-rollback-refuse.json` | AC-3 refuse |
| `rh-s30-05-still-green.txt` | AC-4 regression |
| `happy-or-ponr-insert-regression.txt` | AC-4 happy path |
| `suite-vitest.log` | full PLATFORM_IT file green |
| `branch-oracle-map.md` | inject kind → ponr.ts site → test → evidence |

## Reading List

- Closeout review M-3 section
- `REDHAT-FIX-RH-S30-09.md`
- `services/platform/src/cutover/ponr.ts` — inject + recovery sites
- `services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts` — RH-S30-05 template
- `services/platform/tests/integration/sprint30-cutover-harness.ts`
- `rollback-repoint.ts` refuse codes; `soak-fence.ts`; `post-export-write-audit.ts`

## Disposition

TEST-ORACLE FIX. Product recovery for the three post-lift branches already landed under RH-S30-09; M-3 is the missing direct integration oracle. Expand `sprint30-redhat-rh-s30.test.ts` with three PLATFORM_IT cases; keep RH-S30-05 green; emit evidence under `.tmp/REDHAT-FIX-RH-S30-19/`. Out of scope: C-2 tip-bound gate rebind, C-3 destructive role probe.

AGENT: implementer=mastra-implementer | technical-reviewer=mastra-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T09:30:27Z
finding_ids: [M-3, REDHAT-FIX-RH-S30-19, REDHAT-FIX-RH-S30-09]
