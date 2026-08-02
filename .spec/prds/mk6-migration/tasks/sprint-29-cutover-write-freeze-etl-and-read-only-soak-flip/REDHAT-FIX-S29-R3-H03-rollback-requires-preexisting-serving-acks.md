# REDHAT-FIX-S29-R3-H03 — Rollback requires acknowledgements from pre-existing serving generations

> Status: Backlog
> Task ID: REDHAT-FIX-S29-R3-H03
> Assignee: devops-engineer
> Priority: P0
> Type: FEATURE

## What this does
Close red-hat CRITICAL (LOW conf): `runRollbackRepoint` must not count self-created/in-process handlers as deployment acks. Require acknowledgements from pre-existing serving processes (HTTP /health on already-listening base URL, or worker generation ack) after control-plane write.

## Why
Report: `.spec/reviews/red-hat-20260802T033909Z-sprint-29-main-sha-03bdaddb7b97903f1acde8fc82a1146cf92eb638.md` @ `03bdaddb7b97903f1acde8fc82a1146cf92eb638` lines 48-50.

## Scope
Writes: `services/platform/src/cutover/rollback-repoint.ts`, tests, `.tmp/REDHAT-FIX-S29-R3-H03/**`

## Done when
- Self-created createHonoApp-only ack is insufficient when HOLO_VERIFY_BASE_URL/deployed URL is required
- repointed:true only with ack from process that was up before repoint command
- PLATFORM_IT negatives green

AGENT: implementer=devops-engineer | reviewer=code-reviewer
