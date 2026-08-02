# REDHAT-FIX-S29-R3-H02 — Fence mission admission/publish and already-running worker irreversible effects

> Status: Backlog
> Task ID: REDHAT-FIX-S29-R3-H02
> Assignee: devops-engineer
> Priority: P0
> Type: FEATURE

## What this does
Close red-hat CRITICAL (LOW conf mission) + HIGH (MEDIUM conf worker): add `isMigrationReadOnly` to mission create/commit/publish paths; re-check durable fence at irreversible job effects; prove already-running worker (not only in-process `runJob`) blocks under fence.

## Why
Report: `.spec/reviews/red-hat-20260802T033909Z-sprint-29-main-sha-03bdaddb7b97903f1acde8fc82a1146cf92eb638.md` @ `03bdaddb7b97903f1acde8fc82a1146cf92eb638` lines 38-40, 44-46.

## Scope
Writes: `services/platform/src/mission/runtime.ts`, `document-publish.ts`, `jobs-runner.ts`, tests, `.tmp/REDHAT-FIX-S29-R3-H02/**`

## Done when
- Mission write/publish returns migration_read_only when fenced
- Already-running or leased job path fails closed under fence
- PLATFORM_IT negatives green

AGENT: implementer=devops-engineer | reviewer=code-reviewer
