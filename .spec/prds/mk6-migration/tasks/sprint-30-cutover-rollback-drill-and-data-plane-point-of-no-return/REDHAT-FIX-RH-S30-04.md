# REDHAT-FIX-RH-S30-04 — Fence Convex drain/seed/audit mutations under soak

> **Task ID:** REDHAT-FIX-RH-S30-04
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T074619Z-independent.md` (independent red-hat @ 0411fd27)
> Status: Backlog

## Finding

seedInFlightForDrainTest, disableAndDrain, and unauthenticated recordWriteAttempt accept production-side mutations while HOLO_MIGRATION_READ_ONLY=1. Fail-closed fence or auth-gate these paths so soak 'all production writes blocked' is true. Tests from D07-05 that expected unauth success must flip to expect rejection when fence armed.

## Scope (WRITE-ALLOWED)

convex/migrationFence/drain.ts, audit.ts, related clients, sprint30-security-review tests

## Acceptance Criteria

- [ ] **AC-1** With fence armed, unauthenticated seedInFlightForDrainTest / disableAndDrain / recordWriteAttempt reject without side effects
- [ ] **AC-2** Authorized cutover operator path for legitimate drain still works when explicitly invoked from cutover:quiet-check/freeze tooling

## Anti-stub

- Real services / real Postgres / real Convex where the finding involves them.
- No forged gate-results; no hand-written verified:true without raw recompute.
- Do not weaken the finding into a docs-only change unless the finding is pure process (RH-S30-08 may include process + automation).

## Evidence

`.tmp/REDHAT-FIX-RH-S30-04/`

## Disposition

Sprint 30 must not be marked complete until this task is dual-lens APPROVED, landed on main, and a fresh tip-bound human gate passes.

AGENT: implementer=devops-engineer | technical-reviewer=code-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T07:56:27Z
