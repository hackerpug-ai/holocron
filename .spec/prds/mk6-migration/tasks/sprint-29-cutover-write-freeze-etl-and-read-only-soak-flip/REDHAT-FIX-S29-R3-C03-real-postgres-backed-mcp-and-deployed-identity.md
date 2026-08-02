# REDHAT-FIX-S29-R3-C03 — Real Postgres-backed MCP/article oracle and non-self-supplied deployed identity

> Status: Backlog
> Task ID: REDHAT-FIX-S29-R3-C03
> Assignee: devops-engineer
> Priority: P0
> Type: FEATURE

## What this does
Close red-hat CRITICAL (HIGH confidence): `postgres_backed` must prove selected Postgres row/content correspondence, not merely schema-valid non-null shape. `target_identity` must not be purely caller-minted; bind to process/service that was already listening before the verify command (or fail closed without deployment env).

## Why
Report: `.spec/reviews/red-hat-20260802T033909Z-sprint-29-main-sha-03bdaddb7b97903f1acde8fc82a1146cf92eb638.md` @ `03bdaddb7b97903f1acde8fc82a1146cf92eb638` lines 20-22.

## Scope
Writes: `services/platform/src/cutover/soak-fence.ts`, soak-flip tests, optional CLI flags, `.tmp/REDHAT-FIX-S29-R3-C03/**`

## Done when
- postgres_backed requires DB query match or content hash against known seed row
- identity requires env of pre-existing deploy (HOLO_VERIFY_BASE_URL of live stack) without test overwriting identity fields into report as sole proof
- Structural shape-only no longer sets postgres_backed true

AGENT: implementer=devops-engineer | reviewer=code-reviewer
