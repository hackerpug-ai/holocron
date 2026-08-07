# REDHAT-FIX-RH-S30-21 — Delete destructive marker-parse fallback; hard-fail parse miss with PONR preservation proof (C-3 residual)

> **Task ID:** REDHAT-FIX-RH-S30-21
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL
> **Source finding:** C-3 residual
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T094841Z-independent-final-closeout.md` (independent final closeout @ a0edfdd)
> **Proposed by:** `security-auditor`
> Status: Backlog — plan only (do not treat as fixed until dual-lens APPROVED + landed)

## Finding

**C-3 residual — missing transaction marker can still destroy the PONR record.** Confidence: HIGH.

At reviewed SHA `a0edfdd`, if the regex does not parse `PROBE_ROLLBACK_MARKER`, the `if not m` branch called `psql("TRUNCATE data_plane_ponr")` and `psql("UPDATE data_plane_ponr SET operator = operator")` on the original `DATABASE_URL`, outside the `SET LOCAL ROLE` transaction, with no rollback. With an owner/superuser URL this can erase the immutable PONR table before postflight detects it.

Stored `20260807T094143Z` artifacts showing `rows_preserved:true` cover the **success path only** and cannot establish the non-destructive guarantee on the parser-failure branch.

RH-S30-18 partially moved marker-miss to hard-fail at later tips; that is necessary but **not sufficient**. This residual still requires: (1) audit that no destructive fallback remains, (2) forced-miss negative test proving row/trigger preservation on a PONR-holding disposable DB, (3) gate/IT ownership of that branch.

**Required remediation:** delete residual destructive fallback statements; treat marker parse failure as a hard failure before any additional DDL/DML; every privilege-probe op in the same verified non-owner session and one always-rolled-back transaction; negative test that forces marker parsing to fail against a PONR-holding disposable DB and proves row/trigger preservation.

## Scope (WRITE-ALLOWED)

- `scripts/probe-ponr-role-immutability.sh` (hard-fail parse miss; force-miss hook; read-only preservation snapshots; delete any residual destructive fallback)
- `scripts/run-sprint30-human-gate.sh` (optional forced-miss fragment + artifact copy)
- `services/platform/tests/integration/sprint30-ponr-role-provenance.test.ts` (NEW or MODIFY — forced marker-miss oracle)
- `services/platform/tests/integration/sprint30-ponr-immutability.test.ts` (MODIFY only if sibling case preferred)
- `services/platform/tests/integration/sprint30-cutover-harness.ts` (only if disposable PONR seed/app-role helper needed)
- Cross-link `REDHAT-FIX-RH-S30-18.md` disposition
- `.tmp/REDHAT-FIX-RH-S30-21/**`
- Gate evidence under `.gate-evidence/{run_id}/ponr-role-provenance-marker-miss/` only as produced by a real run

## Acceptance Criteria

- [ ] **AC-1** Forced marker-parse miss hard-fails with zero extra DDL/DML and PONR preserved: against a disposable Postgres with ≥1 `data_plane_ponr` row and triggers enabled, arm `HOLO_PROBE_FORCE_MARKER_PARSE_FAIL=1` (or equivalent); probe exits non-zero; no bare TRUNCATE/UPDATE/DELETE/ALTER outside the always-rolled-back probe transaction; `ponr_row_count` unchanged; non-internal triggers still enabled (`tgenabled='O'`).
- [ ] **AC-2** Static audit: zero reviewed-SHA bare TRUNCATE/UPDATE parse-miss fallbacks remain in HEAD probe source; all privilege DML only inside `BEGIN…ROLLBACK` `DO $$` block; parse-miss path documents hard-fail exit non-zero.
- [ ] **AC-3** PLATFORM_IT (or equivalent) negative oracle forces parse failure end-to-end, fails closed if rows drop / triggers disable / probe exits 0, emits seeded evidence under `.tmp/REDHAT-FIX-RH-S30-21/`.
- [ ] **AC-4** Gate or PLATFORM_IT owns the parse-miss branch; success-path-only evidence (e.g. `20260807T094143Z` `rows_preserved:true`) cannot close C-3; wiring documented in `ac4-gate-or-it-wiring.md`.
- [ ] **AC-5** Success-path probe non-regression: without force-miss hook, probe still always-rolls-back under verified non-owner session; rows preserved; triggers enabled; RH-S30-18 production SQLSTATE path not regressed. NEVER reuse RH-S30-13 superuser `disable_denied=false` as pass.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Probe exit code non-zero when force-marker-parse-fail armed on PONR-holding disposable DB | AC-1 | force-miss run `test $? -ne 0` |
| TC-2 | `ponr_row_count_after == ponr_row_count_before` and before ≥ 1 after forced miss | AC-1 | postflight JSON |
| TC-3 | `triggers_enabled_after == true` after forced miss | AC-1 | postflight JSON |
| TC-4 | SQL-statement log shows zero bare TRUNCATE outside rolled-back DO block | AC-1 | sql-statement-log.txt |
| TC-5 | Static audit records zero bare parse-miss TRUNCATE/UPDATE fallbacks | AC-2 | `ac2-static-audit.md` |
| TC-6 | PLATFORM_IT/gate oracle for marker-parse-miss greens only when hard-fail + preservation hold | AC-3 | vitest `-t marker-parse-miss` |
| TC-7 | Gate runner or PLATFORM_IT contains forced-miss / marker-miss invocation | AC-4 | `rg` ownership |
| TC-8 | Success-path probe still reports rows_preserved true | AC-5 | success-path postflight |
| TC-9 | Disposition refuses RH-S30-13 superuser disable_denied=false as C-3 pass | AC-4 | disposition md |
| TC-10 | Disposition states marker-parse-failure negative test is required for C-3 closeout | AC-3 | disposition md |

## Anti-stub

- Do not claim coverage by only grepping for `sys.exit(2)` without running forced-miss against a PONR-holding DB.
- Do not hand-write `rows_preserved:true` without a real probe run.
- Do not mock `psql` or SQLSTATE.
- Do not treat success-path `20260807T094143Z` as parse-miss proof.
- Do not reuse `.tmp/REDHAT-FIX-RH-S30-13` `disable_denied=false` as pass.
- Do not run destructive sequences against production PONR-holding DBs — disposable only.
- Do not treat HEAD's partial hard-fail alone as C-3 closed without forced-miss preservation proof + gate/IT ownership.

## Critical Constraints

- **MUST** delete or prove absent any destructive fallback on PROBE_ROLLBACK_MARKER parse failure (reviewed-SHA `:172-190` pattern)
- **MUST** hard-fail parse miss before any additional DDL/DML beyond the always-rolled-back probe transaction and read-only snapshots
- **MUST** execute privilege probes in verified non-owner (`holocron_app`) session + one always-rolled-back transaction
- **MUST** add forced-miss negative test on PONR-holding disposable DB proving row count + triggers preserved
- **MUST** make gate and/or PLATFORM_IT own the marker-parse-failure branch
- **NEVER** reintroduce unscoped TRUNCATE/UPDATE outside BEGIN…ROLLBACK
- **NEVER** claim C-3 closed without forced-miss negative test artifacts under `.tmp/REDHAT-FIX-RH-S30-21/`
- **STRICTLY** fail closed if `rows_preserved` is false or triggers disabled after any probe path

## Evidence

`.tmp/REDHAT-FIX-RH-S30-21/`

| Artifact | Proves |
|----------|--------|
| `forced-miss/ac-marker-miss-postflight.json` | AC-1 row count + trigger preservation after forced parse miss |
| `forced-miss/ac-marker-miss-disposition.json` | AC-1 hard-fail + marker_parse_failed true |
| `forced-miss/sql-statement-log.txt` | AC-1/TC-4 zero bare TRUNCATE outside rolled-back tx |
| `ac2-static-audit.md` | AC-2 source absence of reviewed-SHA destructive fallback |
| `ac3-marker-miss-negative.json` | AC-3 PLATFORM_IT/oracle negative result |
| `ac3-disposition.md` | C-3 residual disposition; never close without forced-miss |
| `ac4-gate-or-it-wiring.md` | AC-4 ownership; success-path-only insufficient |
| `success-path/ac0-postflight.json` | AC-5 non-regression of always-rollback success path |
| `gate-or-it-transcript.log` | Real invocation transcript for forced-miss path |

## Reading List

- Closeout review C-3 section @ a0edfdd (`:35-41`)
- `REDHAT-FIX-RH-S30-18.md` — prior C-3 rewrite (success-path; residual re-opened)
- `scripts/probe-ponr-role-immutability.sh` — marker parse + always-rollback tx
- `git show a0edfdd:scripts/probe-ponr-role-immutability.sh` — known-bad bare TRUNCATE fallback
- Migrations `0030_data_plane_ponr.sql`, `0031_data_plane_ponr_truncate_guard.sql`
- `scripts/run-sprint30-human-gate.sh` — RH-S30-18 success-path probe invocation
- `services/platform/src/db/evidence/roles.ts` — `toAppRoleDatabaseUrl`
- `services/platform/tests/integration/sprint30-ponr-immutability.test.ts`

## Disposition

Release-blocking residual of RH-S30-18 / C-3. Delete any remaining destructive marker-parse fallback; hard-fail parse miss with zero extra DML; prove PONR row+trigger preservation via forced-miss negative test on disposable DB; gate/IT must own that branch. Success-path-only artifacts cannot close C-3. Out of scope: C-2 packaging, M-3 inject oracles, product enable-writes.

AGENT: implementer=devops-engineer | technical-reviewer=security-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T10:01:05Z
finding_ids: [C-3, REDHAT-FIX-RH-S30-21, REDHAT-FIX-RH-S30-18, H-3]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-RH-S30-21",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "proposed_by": "security-auditor",
  "touches_capabilities": ["CAP-CUT-01"],
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "Forced marker-parse miss hard-fails with zero extra DDL/DML and PONR rows+triggers preserved"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "Static audit: zero bare TRUNCATE/UPDATE parse-miss fallbacks outside always-rolled-back tx"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "PLATFORM_IT/oracle forces parse failure and asserts preservation"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "Gate or PLATFORM_IT owns parse-miss branch; success-path alone cannot close C-3"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "Success-path probe non-regression under verified non-owner session"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Non-zero exit on forced miss"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Row count preserved"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Triggers enabled after"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "No bare TRUNCATE outside rolled-back tx"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Static audit zero bare fallbacks"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "PLATFORM_IT marker-miss oracle"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "Gate/IT ownership of forced-miss"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "Success-path rows_preserved"},
    {"id": "TC-9", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "Refuse RH-S30-13 superuser pass"},
    {"id": "TC-10", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "Disposition requires forced-miss for closeout"}
  ]
}
-->
