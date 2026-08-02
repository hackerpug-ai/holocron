# REDHAT-FIX-S29-R3-C01 — Bind human-gate evidence to HEAD and require 6/6 against deployed identity

> Status: Backlog
> Task ID: REDHAT-FIX-S29-R3-C01
> Assignee: devops-engineer
> Priority: P0
> Type: FEATURE

## What this does
Close independent red-hat CRITICAL (HIGH confidence): gate-results partial 2/6 is bound to ancestor `76ec02a…` and `local-process://holo-cli`. Require fresh gate-results with `git_sha == HEAD`, 6/6 pass (or honest fail), and service identity that is not self-minted localhost PID theatre for landing claims.

## Why
Report: `.spec/reviews/red-hat-20260802T033909Z-sprint-29-main-sha-03bdaddb7b97903f1acde8fc82a1146cf92eb638.md` @ `03bdaddb7b97903f1acde8fc82a1146cf92eb638` lines 16-18, 56-58.

## Scope
Writes: `scripts/run-sprint29-human-gate-rerun.sh`, `gate-plan.json` (identity binding), `services/platform/tests/integration/sprint29-human-gate-freshness.test.ts`, sprint `gate-results.json` + `.gate-evidence/` (fresh run only), `.tmp/REDHAT-FIX-S29-R3-C01/**`

## Done when
- Fresh run_id after HEAD; gate-results.sha matches `git rev-parse HEAD`
- freshness suite asserts equality with HEAD, not merely "looks like a SHA"
- Re-run all 6 steps with current gate-plan oracles; do not forge pass
- If 6/6 not achievable, leave honest partial and document blockers (not forge)

AGENT: implementer=devops-engineer | reviewer=code-reviewer
