# REDHAT-FIX-S29-R3-H01 — Drain every claimed surface or fail closed / honest inventory

> Status: Backlog
> Task ID: REDHAT-FIX-S29-R3-H01
> Assignee: devops-engineer
> Priority: P0
> Type: FEATURE

## What this does
Close red-hat HIGH (MEDIUM confidence): `drain.ts` claims crons/queues/outbox/scheduled_jobs but only measures tasks + subscriptionContent. Either implement real drain/re-sample for each claimed surface (incl. Postgres queue/outbox/mission if claimed) OR stop claiming unmeasured surfaces and fail closed if residual inventory is unknown.

## Why
Report: `.spec/reviews/red-hat-20260802T033909Z-sprint-29-main-sha-03bdaddb7b97903f1acde8fc82a1146cf92eb638.md` @ `03bdaddb7b97903f1acde8fc82a1146cf92eb638` lines 30-32.

## Scope
Writes: `convex/migrationFence/drain.ts`, `convex-fence-client.ts`, quiet-drain tests, `.tmp/REDHAT-FIX-S29-R3-H01/**`

## Done when
- Report surfaces[] only names actually drained+re-sampled to residual 0
- Unknown residual fails closed
- PLATFORM_IT residual multi-surface tests green

AGENT: implementer=devops-engineer | reviewer=code-reviewer
