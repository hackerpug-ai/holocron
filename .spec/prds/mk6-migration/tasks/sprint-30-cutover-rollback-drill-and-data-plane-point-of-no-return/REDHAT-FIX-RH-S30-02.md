# REDHAT-FIX-RH-S30-02 — Route content reads to Convex when HOLO_DATA_PLANE=convex

> **Task ID:** REDHAT-FIX-RH-S30-02
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T074619Z-independent.md` (independent red-hat @ 0411fd27)
> Status: Gate-verified on main (remediation complete; awaiting independent dual-lens + fresh QA — not release-approved)

## Finding

rollback-repoint only writes secrets labels; only /health echoes them. Wire at least one real content-read path (e.g. GET /api/documents/:id or catalog read used by the drill) to Convex when resolveObservedDataPlane().data_plane=='convex'. Drill post-repoint oracle MUST prove a Convex-backed content read (not /health echo alone).

## Scope (WRITE-ALLOWED)

services/platform/src/http/**, soak-fence or document handlers, rollback-drill.ts post-repoint probe, tests

## Acceptance Criteria

- [x] **AC-1** With HOLO_DATA_PLANE=convex, a content GET returns Convex document payload (identity-bound)
- [x] **AC-2** Drill report includes content_probe with source convex and matching body field; health-only is insufficient

## Anti-stub

- Real services / real Postgres / real Convex where the finding involves them.
- No forged gate-results; no hand-written verified:true without raw recompute.
- Do not weaken the finding into a docs-only change unless the finding is pure process (RH-S30-08 may include process + automation).

## Evidence

`.tmp/REDHAT-FIX-RH-S30-02/`

## Disposition

Sprint 30 must not be marked complete until this task is dual-lens APPROVED, landed on main, and a fresh tip-bound human gate passes.

AGENT: implementer=devops-engineer | technical-reviewer=code-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T07:56:27Z
