# REDHAT-FIX-RH-S30-05 — Crash-safe enable-writes: no half-open window after accepted write

> **Task ID:** REDHAT-FIX-RH-S30-05
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T074619Z-independent.md` (independent red-hat @ 0411fd27)
> Status: Backlog

## Finding

enable-writes lifts fence, then writes, then inserts PONR. Failure after 201 without PONR leaves writes open and rollback eligible. On any failure after accepted write: re-arm fence, record the accepted write in the production audit/ledger (RH-S30-03), return fail-closed. Prefer ordering that cannot leave accepted write without either PONR or audit refuse path.

## Scope (WRITE-ALLOWED)

services/platform/src/cutover/ponr.ts, tests

## Acceptance Criteria

- [ ] **AC-1** Injected PONR insert failure after 201 => HOLO_MIGRATION_READ_ONLY re-armed AND rollback-repoint refuses (POST_PONR_INELIGIBLE or POST_EXPORT_WRITE_ACCEPTED)
- [ ] **AC-2** Happy path still records PONR and idempotent re-run

## Anti-stub

- Real services / real Postgres / real Convex where the finding involves them.
- No forged gate-results; no hand-written verified:true without raw recompute.
- Do not weaken the finding into a docs-only change unless the finding is pure process (RH-S30-08 may include process + automation).

## Evidence

`.tmp/REDHAT-FIX-RH-S30-05/`

## Disposition

Sprint 30 must not be marked complete until this task is dual-lens APPROVED, landed on main, and a fresh tip-bound human gate passes.

AGENT: implementer=devops-engineer | technical-reviewer=code-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T07:56:27Z
