# GATE-FIX-QA2 — In-window PITR metadata + listable restic-bound recovery baseline

> Status: ⬜ Pending  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer  
> Reviewer: code-reviewer + product-manager  
> Priority: P0  
> Proposed By: independent Terra High QA fail `20260729T053810Z` on main `4fc38697` (verified)  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes  

## Outcome

1. Operators/QA can discover **current live in-window** PITR bounds (and a recommended ISO timestamp) from real pgBackRest info — without weakening outside-WAL fail-closed semantics when a target is still outside the window.
2. The backup/baseline pipeline can **produce and upload** a parity-meaningful recovery baseline bound to an **actually listable** restic snapshot (exact-match verify), so fire-drill discovery is not stuck with only the ghost `resticc5ms5egca88d4616ab` object in R2.

Do **not** edit `gate-plan.json`, `gate-results.json`, `gate-verification.json`, `GATE-RESULTS.md`, or `.gate-evidence/**`.

## Evidence (immutable)

- Run: `20260729T053810Z` · verdict **fail** (verified, zero discrepancies)
- Step 1: `PITR_TIMESTAMP=2026-08-01T00:00:00Z` → outside available WAL (named fail-closed)
- Step 3: only candidate baseline `135135…` has restic id `resticc5ms5egca88d4616ab` → skip ghost → `no restic-verified recovery baseline among 1 candidates`
- Steps 4–5 depend on step 3 parity report

## MUST

- MUST expose real restore-window metadata (earliest/latest/recommended ISO, backup labels) via product CLI against live pgBackRest/R2
- MUST provide an operational path to emit/upload recovery baseline from live domain counts + verified listable restic snapshot + pgBackRest label
- MUST keep exact restic selection fail-closed (no re-introduction of ghost acceptance)
- MUST keep outside-WAL / empty-chain fail-closed language for out-of-window targets
- NEVER weaken gate-plan assertions or hand-edit gate verdicts
- NEVER commit `.tmp/**`

## ACs

### AC-1 [PRIMARY] — Real in-window PITR metadata surface
GIVEN live pgBackRest repo with at least one backup  
WHEN `holo restore:window` (or equivalent documented verb) runs  
THEN JSON/text reports `earliest`, `latest`, `recommended_pitr` (ISO-8601 within window), and non-empty labels from real `pgbackrest info` — not hardcoded 2026-08-01  

### AC-2 — Emit recovery baseline bound to listable restic
GIVEN restic repo with ≥1 real snapshot and live domain data  
WHEN `holo backup:emit-recovery-baseline` (or mirror/base hook path) runs  
THEN baseline uploads with `restic_snapshot_id` that `verifyResticSnapshotInRepo` accepts and domain total > 0  

### AC-3 — Ghost-only R2 set still fails closed until real baseline exists
GIVEN only ghost restic baseline in R2  
WHEN fire-drill discovery runs  
THEN refuse (no restic-verified baseline) — preserve S28R2 H2 fail-closed  

### AC-4 — Typecheck/lint clean on touched paths  

## VERIFY

```bash
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-gate-fix-qa2.test.ts
pnpm tsgo --noEmit
pnpm biome check services/platform/src/backup/ services/platform/src/cli/holo.ts services/platform/tests/integration/sprint28-gate-fix-qa2.test.ts
```

## WRITE-ALLOWED

- `services/platform/src/backup/restore.ts` (window helper export)
- `services/platform/src/backup/recovery-baseline.ts` (emit helpers if needed)
- `services/platform/src/backup/index.ts`
- `services/platform/src/cli/holo.ts` (`restore:window`, `backup:emit-recovery-baseline`)
- `services/platform/tests/integration/sprint28-gate-fix-qa2.test.ts` (NEW)
- task file / SPRINT row / review notes under sprint-28 + `.spec/reviews/`
- `.tmp/GATE-FIX-QA2/**` local only

## WRITE-PROHIBITED

- `gate-plan.json`, `gate-results.json`, `gate-verification.json`, `GATE-RESULTS.md`, `.gate-evidence/**`
- Hook bypass of any kind

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-QA2",
  "qa_run_id": "20260729T053810Z",
  "requirements": [
    {"id": "AC-1"},
    {"id": "AC-2"},
    {"id": "AC-3"},
    {"id": "AC-4"}
  ],
  "tdd_mode": "red_first",
  "write_prohibited": ["gate-plan.json", "gate-results.json", "gate-verification.json", "GATE-RESULTS.md", ".gate-evidence/"]
}
-->
