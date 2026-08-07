# REDHAT-FIX-RH-S30-06 — Gate step 3 must run cutover:verify-fallback-boot

> **Task ID:** REDHAT-FIX-RH-S30-06
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** HIGH
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T074619Z-independent.md` (independent red-hat @ 0411fd27)
> Status: Backlog

## Finding

Gate step 3 only pins; accepts worktree path without boot. Require cutover:verify-fallback-boot --json with ok:true (Release artifact + Maestro session). Fail closed if BOOT_UNVERIFIED.

## Scope (WRITE-ALLOWED)

gate-plan.json, human gate runner, pinned-fallback-build.ts if needed

## Acceptance Criteria

- [ ] **AC-1** gate-plan step3 literal_cmd includes cutover:verify-fallback-boot
- [ ] **AC-2** assertion requires "ok": true and rejects BOOT_UNVERIFIED

## Anti-stub

- Real services / real Postgres / real Convex where the finding involves them.
- No forged gate-results; no hand-written verified:true without raw recompute.
- Do not weaken the finding into a docs-only change unless the finding is pure process (RH-S30-08 may include process + automation).

## Evidence

`.tmp/REDHAT-FIX-RH-S30-06/`

## Disposition

Sprint 30 must not be marked complete until this task is dual-lens APPROVED, landed on main, and a fresh tip-bound human gate passes.

AGENT: implementer=devops-engineer | technical-reviewer=code-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T07:56:27Z
