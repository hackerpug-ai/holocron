# REDHAT-FIX-RH-S30-03 — Production-bound post-export accepted-write oracle

> **Task ID:** REDHAT-FIX-RH-S30-03
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T074619Z-independent.md` (independent red-hat @ 0411fd27)
> Status: Gate-verified on main (remediation complete; awaiting independent dual-lens + fresh QA — not release-approved)

## Finding

Zero-loss oracle reads .tmp JSON with fail-open empty synthesis; no production writer. Make accepted post-export writes durable (Postgres table preferred) written from real production write paths (Hono POST /api/documents, MCP mutations, job/mission writes) when soak/export watermark is active. loadPostExportWriteAudit fail-closed if ledger missing/unreadable. Gate step 2 must recompute from that ledger.

## Scope (WRITE-ALLOWED)

migration for ledger table optional, soak-fence write hooks, rollback-repoint.ts audit load/write, gate-plan step2

## Acceptance Criteria

- [x] **AC-1** Real POST /api/documents after watermark increments ledger accepted count
- [x] **AC-2** Absent ledger => rollback-repoint refuse (not empty success)
- [x] **AC-3** Deleting .tmp file does not zero the oracle if DB-backed

## Anti-stub

- Real services / real Postgres / real Convex where the finding involves them.
- No forged gate-results; no hand-written verified:true without raw recompute.
- Do not weaken the finding into a docs-only change unless the finding is pure process (RH-S30-08 may include process + automation).

## Evidence

`.tmp/REDHAT-FIX-RH-S30-03/`

## Disposition

Sprint 30 must not be marked complete until this task is dual-lens APPROVED, landed on main, and a fresh tip-bound human gate passes.

AGENT: implementer=devops-engineer | technical-reviewer=code-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T07:56:27Z
