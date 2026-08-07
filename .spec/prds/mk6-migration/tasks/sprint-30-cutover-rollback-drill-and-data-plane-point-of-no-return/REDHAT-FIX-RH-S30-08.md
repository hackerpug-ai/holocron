# REDHAT-FIX-RH-S30-08 — Gate-verification raw recompute must match verified:true

> **Task ID:** REDHAT-FIX-RH-S30-08
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** HIGH
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T074619Z-independent.md` (independent red-hat @ 0411fd27)
> Status: Backlog

## Finding

gate-verification.json.raw was no-gate-plan while .json claimed verified:true. Always run verify-gate-evidence.sh with gate-plan + evidence-dir; commit/store raw stdout; refuse pass if raw verified!=true.

## Scope (WRITE-ALLOWED)

gate runner, gate-verification.json, gate-verification.json.raw

## Acceptance Criteria

- [ ] **AC-1** After gate run, jq -e '.verified==true' gate-verification.json and identical recomputed in .raw
- [ ] **AC-2** assert-human-test-verdict + verify-gate-evidence both exit 0 against tip

## Anti-stub

- Real services / real Postgres / real Convex where the finding involves them.
- No forged gate-results; no hand-written verified:true without raw recompute.
- Do not weaken the finding into a docs-only change unless the finding is pure process (RH-S30-08 may include process + automation).

## Evidence

`.tmp/REDHAT-FIX-RH-S30-08/`

## Disposition

Sprint 30 must not be marked complete until this task is dual-lens APPROVED, landed on main, and a fresh tip-bound human gate passes.

AGENT: implementer=devops-engineer | technical-reviewer=code-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T07:56:27Z
