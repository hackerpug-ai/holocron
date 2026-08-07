# REDHAT-FIX-RH-S30-18 — Non-destructive PONR role-provenance probe + gate-owned SQLSTATE (C-3)

> **Task ID:** REDHAT-FIX-RH-S30-18
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL
> **Source finding:** C-3
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T092237Z-independent-closeout.md` (independent closeout @ 25db7f9e)
> **Proposed by:** `security-auditor`
> Status: Backlog — plan only (do not treat as fixed until dual-lens APPROVED + landed)

## Finding

**C-3 — the RH-S30-13 “role-provenance probe” can destroy the PONR record before it validates the role.** Confidence: HIGH.

`scripts/probe-ponr-role-immutability.sh` reads `DATABASE_URL`, then immediately executes `ALTER TABLE data_plane_ponr DISABLE TRIGGER ALL`, `TRUNCATE data_plane_ponr`, and `UPDATE`. It checks superuser / expected failures only afterwards. There is no transaction/rollback, no owner/non-superuser preflight, and no trigger re-enable. An owner/superuser or misconfigured operator URL therefore erases the irreversible PONR latch and can leave protections disabled.

The `20260807T091354Z` plan has **no** invocation of this probe, so production-role SQLSTATE evidence is not gate-owned; finalization still listed H-3 closed. RH-S30-13 ACs marked done while the probe itself is the critical defect. Retained bad evidence under `.tmp/REDHAT-FIX-RH-S30-13/` (role `holocron`, `is_superuser=on`, `disable_denied=false`) must not be reused as pass.

## Scope (WRITE-ALLOWED)

- `scripts/probe-ponr-role-immutability.sh` (full rewrite; destroy-and-check sequence forbidden)
- `scripts/run-sprint30-human-gate.sh` (optional pre/post step or post-step-4 probe + artifact copy into `.gate-evidence/{run_id}/`)
- `gate-plan.json` notes/oracles if gate-owned
- `services/platform/tests/integration/sprint30-ponr-immutability.test.ts` and/or new `sprint30-ponr-role-provenance.test.ts`
- `services/platform/tests/integration/sprint30-cutover-harness.ts` only if app-role URL helper needed (do not conflate harness owner cleanup with production claim)
- `services/platform/src/db/evidence/roles.ts` (read/use `toAppRoleDatabaseUrl` / `HOLOCRON_APP_ROLE`)
- Cross-link `REDHAT-FIX-RH-S30-13.md` disposition; this task file
- `.tmp/REDHAT-FIX-RH-S30-18/**`
- Gate evidence under `.gate-evidence/{new_run_id}/` only as produced by a real run

## Acceptance Criteria

- [ ] **AC-1** Preflight before any mutating SQL: probe MUST connect read-only first and record `current_user`, `is_superuser`, table owner of `public.data_plane_ponr`, `is_table_owner`, `ponr_row_count`, and `triggers_enabled`. It MUST refuse to issue ALTER/TRUNCATE/UPDATE/DELETE unless the session is proven non-superuser AND non-owner (or is an explicit `holocron_app` session via product-role URL rewrite — not privileged SET ROLE that still holds ownership). Superuser/owner URL alone is insufficient for production SQLSTATE claims.
- [ ] **AC-2** Probe is non-destructive for any DB that may hold a PONR latch: either only privilege/trigger denial attempts under the verified app role, or all attempted DDL/DML inside a single session transaction that ALWAYS ROLLBACKs (including success paths), with postflight asserting `ponr_row_count` unchanged and non-internal triggers re-enabled (`tgenabled='O'`). MUST NOT leave `DISABLE TRIGGER ALL` in effect. MUST NOT use bare TRUNCATE/UPDATE outside a rolled-back transaction. MUST NOT run the pre-C-3 destroy-then-check sequence against a DB with `count(data_plane_ponr)>0`.
- [ ] **AC-3** Production-role SQLSTATE evidence is required and must be gate-owned or PLATFORM_IT-owned. Under `holocron_app` (or real production product role), capture exact SQLSTATE/error for: (1) `ALTER TABLE data_plane_ponr DISABLE TRIGGER ALL` → denied; (2) `TRUNCATE` → fail closed (`PONR_IMMUTABLE` P0001 and/or 42501); (3) UPDATE (and preferably DELETE) → fail closed. Owner/superuser residual may be documented separately but MUST NOT substitute for app-role SQLSTATE when claiming H-3 closed.
- [ ] **AC-4** Gate or PLATFORM_IT path must invoke the safe probe (or equivalent integration test) so H-3 cannot be marked closed without evidence. Wire runner artifact copy into `.gate-evidence/{run_id}/ponr-role-provenance/` and/or PLATFORM_IT suite using `toAppRoleDatabaseUrl`. Finalization MUST NOT list H-3 closed unless AC-3 artifacts exist for this tip.
- [ ] **AC-5** Explicit hard guard: never run the old destructive probe sequence against any database holding a PONR record. Script header + runtime guard refuse if `ponr_row_count>0` AND (`is_superuser` OR `is_table_owner`) without app-role rebind; refuse any path that would DISABLE TRIGGER without guaranteed rollback. Prior RH-S30-13 ACs remain conceptually valid but their probe implementation and evidence are superseded by this task for C-3 closeout.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Preflight records role/superuser/owner/count/triggers before any ALTER/TRUNCATE/UPDATE/DELETE | AC-1 | `ac0-preflight.json` first |
| TC-2 | Under holocron_app, DISABLE TRIGGER is denied (`disable_denied=true` + SQLSTATE) | AC-3 | `ac1-prod-role-disable-trigger.json` |
| TC-3 | Under holocron_app, TRUNCATE and UPDATE fail closed; row remains | AC-3 | `ac2-prod-role-dml-truncate.json` |
| TC-4 | After probe with existing PONR row(s), count unchanged and triggers enabled | AC-2 | `ac0-postflight.json` |
| TC-5 | Privileged superuser/owner URL does not unscoped DISABLE+TRUNCATE+UPDATE against PONR-holding DB | AC-1 | blocked preflight or app-role rebind only |
| TC-6 | Gate runner and/or PLATFORM_IT invokes safe probe; missing SQLSTATE fails closed for H-3 | AC-4 | `rg` invocation + evidence path |
| TC-7 | No bare non-transactional TRUNCATE/UPDATE fallback remains | AC-2 | code audit of probe script |
| TC-8 | Explicit NEVER-run-old-probe-against-PONR-holding-DB guard enforced | AC-5 | header + runtime branch |

## Anti-stub

- Do not mark H-3 / RH-S30-13 / C-3 closed by reusing `.tmp/REDHAT-FIX-RH-S30-13` artifacts that show role=`holocron`, `is_superuser=on`, `disable_denied=false`.
- Do not claim safety solely via comments while leaving mutate-then-check or bare TRUNCATE fallback.
- Do not treat owner/superuser residual documentation as production-role SQLSTATE proof.
- Do not conflate harness owner DISABLE TRIGGER cleanup with the production app-role claim.
- Do not hand-edit gate/finalization JSON to list H-3 closed without a real probe/integration run.
- Do not run any destructive probe sequence against a live cutover or production-like DB that holds a PONR row.
- Do not skip gate/PLATFORM_IT wiring — uninvoked probe repeats the `20260807T091354Z` gap.
- Real Postgres roles; no mocked SQLSTATE.

## Critical Constraints

- **MUST** prove non-superuser + non-owner (or verified `holocron_app`) BEFORE any DDL/DML
- **MUST** preserve existing PONR rows and trigger-enabled state after every probe run
- **MUST** emit production-role SQLSTATE for DISABLE TRIGGER, TRUNCATE, and UPDATE
- **MUST** wire safe probe into gate and/or PLATFORM_IT so H-3 cannot close without artifacts
- **NEVER** run present destructive probe against DB holding PONR
- **NEVER** leave triggers disabled on exit
- **STRICTLY** fail closed if `rows_preserved` is false or triggers disabled after probe
- **STRICTLY** prefer product URL rewrite (`toAppRoleDatabaseUrl`) over SET ROLE from superuser

## Evidence

`.tmp/REDHAT-FIX-RH-S30-18/`

Required artifacts (minimum):

| Artifact | Proves |
|----------|--------|
| `ac0-preflight.json` | Role/owner/count/triggers before mutating SQL |
| `ac0-postflight.json` | Count unchanged; triggers still enabled |
| `ac1-prod-role-disable-trigger.json` | App role cannot DISABLE TRIGGER + SQLSTATE |
| `ac2-prod-role-dml-truncate.json` | App role TRUNCATE/UPDATE fail closed |
| `ac3-disposition.md` | Closed vs residual; supersedes unsafe RH-S30-13 probe |
| `ac4-role-map.md` | Production vs harness/owner roles labeled |
| `ac5-guard-and-gate-wiring.md` | NEVER-run-old-probe guard + invocation path |
| `gate-or-it-transcript.(log\|json)` | Safe probe actually invoked |

## Reading List

- Closeout review C-3 section
- `scripts/probe-ponr-role-immutability.sh` (rewrite target)
- `.tmp/REDHAT-FIX-RH-S30-13/*` (bad evidence anti-pattern)
- `REDHAT-FIX-RH-S30-13.md`, `gate-plan.json`, `run-sprint30-human-gate.sh`
- Migrations `0030_data_plane_ponr.sql`, `0031_data_plane_ponr_truncate_guard.sql`
- `services/platform/src/db/evidence/roles.ts`
- `services/platform/tests/integration/sprint30-ponr-immutability.test.ts`

## Disposition

Route CRITICAL C-3 as REDHAT-FIX-RH-S30-18 to `devops-engineer` with `security-reviewer` technical review. Treat H-3 / RH-S30-13 as **re-opened** until the safe probe is shipped, production-role SQLSTATE is gate- or PLATFORM_IT-owned, and no destructive sequence can run against a PONR-holding database. Coordinate with RH-S30-17 so a fresh gate run can consume the new probe path.

AGENT: implementer=devops-engineer | technical-reviewer=security-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T09:30:27Z
finding_ids: [C-3, REDHAT-FIX-RH-S30-18, REDHAT-FIX-RH-S30-13, H-3]
