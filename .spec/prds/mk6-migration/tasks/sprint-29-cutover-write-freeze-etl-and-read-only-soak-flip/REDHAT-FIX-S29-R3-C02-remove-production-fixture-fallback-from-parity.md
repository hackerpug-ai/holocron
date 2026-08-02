# REDHAT-FIX-S29-R3-C02 — Remove production fixture fallback from cutover:verify-reads parity

> Status: Backlog
> Task ID: REDHAT-FIX-S29-R3-C02
> Assignee: devops-engineer
> Priority: P0
> Type: FEATURE

## What this does
Close red-hat CRITICAL (MEDIUM confidence, still blocking for CAP): production `runVerifyReads` must NOT fall back to committed test fixtures (`immutable-export-catalog` / watermark fixtures). Require operator-supplied immutable export+catalog paths; fail closed if missing. Fixture paths only allowed under explicit test-only flag, never default production CLI.

## Why
Report: `.spec/reviews/red-hat-20260802T033909Z-sprint-29-main-sha-03bdaddb7b97903f1acde8fc82a1146cf92eb638.md` @ `03bdaddb7b97903f1acde8fc82a1146cf92eb638` lines 34-36.

## Scope
Writes: `services/platform/src/cutover/soak-fence.ts`, `services/platform/src/cli/holo.ts`, tests under `sprint29-soak-flip` / `redhat-fix-s29-r2-c03*`, `.tmp/REDHAT-FIX-S29-R3-C02/**`

## Done when
- CLI without export/catalog paths fails closed (no fixture default)
- Tests use explicit test flag or inject paths; production path rejects fixture dir
- Full inventory threshold not silently `>=4` for operator path when catalog lists N tables

AGENT: implementer=devops-engineer | reviewer=code-reviewer
