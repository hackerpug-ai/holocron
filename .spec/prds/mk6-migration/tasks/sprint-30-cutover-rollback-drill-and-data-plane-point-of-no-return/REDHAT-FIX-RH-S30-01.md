# REDHAT-FIX-RH-S30-01 — Block TRUNCATE on data_plane_ponr (PONR immutability)

> **Task ID:** REDHAT-FIX-RH-S30-01
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T074619Z-independent.md` (independent red-hat @ 0411fd27)
> Status: Gate-verified on main (remediation complete; awaiting independent dual-lens + fresh QA — not release-approved)

## Finding

PONR row is erasable via TRUNCATE; AFTER erase rollback-repoint re-opens. Add BEFORE TRUNCATE FOR EACH STATEMENT trigger (and keep UPDATE/DELETE row triggers). Prove truncate fails closed and post-truncate rollback still POST_PONR_INELIGIBLE when a row was recorded.

## Scope (WRITE-ALLOWED)

services/platform/src/db/migrations/0031_data_plane_ponr_truncate_guard.sql (or amend 0030 if not applied broadly), ponr/immutability tests, .tmp/REDHAT-FIX-RH-S30-01/**

## Acceptance Criteria

- [x] **AC-1** PLATFORM_IT=1: TRUNCATE data_plane_ponr raises PONR_IMMUTABLE / fails closed
- [x] **AC-2** After failed truncate, SELECT count=1 and cutover:rollback-repoint --json exits 2 with POST_PONR_INELIGIBLE

## Anti-stub

- Real services / real Postgres / real Convex where the finding involves them.
- No forged gate-results; no hand-written verified:true without raw recompute.
- Do not weaken the finding into a docs-only change unless the finding is pure process (RH-S30-08 may include process + automation).

## Evidence

`.tmp/REDHAT-FIX-RH-S30-01/`

## Disposition

Sprint 30 must not be marked complete until this task is dual-lens APPROVED, landed on main, and a fresh tip-bound human gate passes.

AGENT: implementer=devops-engineer | technical-reviewer=code-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T07:56:27Z
