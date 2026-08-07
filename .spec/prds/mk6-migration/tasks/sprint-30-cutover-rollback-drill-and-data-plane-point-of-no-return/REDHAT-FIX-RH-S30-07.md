# REDHAT-FIX-RH-S30-07 — Bind gate evidence to reviewed HEAD and deployed sourceRevision

> **Task ID:** REDHAT-FIX-RH-S30-07
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** HIGH
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T074619Z-independent.md` (independent red-hat @ 0411fd27)
> Status: Gate-verified on main (remediation complete; awaiting independent dual-lens + fresh QA — not release-approved)

## Finding

Gate must record git_sha=HEAD and require /health deployment.identity.sourceRevision matches HEAD (or redeploy tip first). Fail closed if live service is ancestor/stale (e.g. 09319ead vs tip).

## Scope (WRITE-ALLOWED)

gate-plan.json, gate runner scripts, step logs meta

## Acceptance Criteria

- [x] **AC-1** gate-results includes git_sha == git rev-parse HEAD
- [x] **AC-2** step logs include sourceRevision equal to HEAD or gate fails with DEPLOY_REVISION_MISMATCH

## Anti-stub

- Real services / real Postgres / real Convex where the finding involves them.
- No forged gate-results; no hand-written verified:true without raw recompute.
- Do not weaken the finding into a docs-only change unless the finding is pure process (RH-S30-08 may include process + automation).

## Evidence

`.tmp/REDHAT-FIX-RH-S30-07/`

## Disposition

Sprint 30 must not be marked complete until this task is dual-lens APPROVED, landed on main, and a fresh tip-bound human gate passes.

AGENT: implementer=devops-engineer | technical-reviewer=code-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T07:56:27Z
