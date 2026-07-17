---
sprint: 11
title: Scheduler and Durable Queue
sequence: 11
timeline: Phase 2 — Inference and Data
status: Completed
prd: ../../README.md
capability_coverage: N/A
planned_from_roadmap_sha: 3c0ce5ae204245fce00e39a80dd730a41cde98bf4c5b79940307a8478f0f74ee
planned_from_source_sha: 45ace69dbda221d74265c5b056815e9e10fce267
planned_at: 2026-07-17T18:46:47Z
---

# Sprint 11: Scheduler and Durable Queue

**Sequence:** 11
**Timeline:** Phase 2 — Inference and Data
**Status:** Completed
> Progress: 5/5 tasks completed · updated 2026-07-17T21:51:28Z
> Status-Note: QA gate PASS 8/8 verified; all tasks completed; trunk consolidated on main
**Proposed by:** mastra-planner
**Branch:** `mk6-scheduler-queue`
**Opened:** 2026-07-17 — generated JIT by /kb-sprint-tasks-plan

## Overview

A complete, decisive migration of holocron off Convex — cloud database and all services — onto a Mastra (Bun) + Postgres platform on the tailnet mini, with the RN app resyncing via Zero and all reasoning on the local inference fleet. This sprint replaces the 16 Convex crons and `scheduler.runAfter` chaining with Mastra-native scheduling and a Postgres-backed leased queue whose observable effects remain exactly once across process death.

## Human Test Deliverable

An operator can seed a durable effect and exercise the scheduler against real Postgres: all 16 jobs fire, kill-9 at commit/dispatch/ack boundaries still yields exactly one observable side-effect plus one auditable outbox/inbox dedupe record, interactive work wins priority, and poison work reaches the dead-letter path.

## Human Testing Gate

**Gate:** With the durable queue running, a kill-9 at each commit/dispatch/ack boundary of a seeded job yields exactly one observable side-effect plus one auditable outbox/inbox dedupe record — never zero and never two.

## Test Deliverable

Each step is a real documented `holo` operator invocation (no test suite). Run with
`DATABASE_URL=postgres://127.0.0.1:5432/holocron`.

1. Run `holo jobs:run-all` — observe `jobs_fired: 16/16` and `side_effect_rows >= 16` (all 16 migrated jobs fire; each former Convex side-effect observed in Postgres).
2. Kill-9 before commit + recovery: run `holo queue:effect effect-kill9-1 --boundary before-commit` — observe `effect_count: 1`, `outbox_count: 1`, `inbox_dedupe_count: 1`, `fencing_token` set, `exactly_once: true`.
3. Kill-9 after commit/before enqueue: run `holo queue:effect effect-kill9-2 --boundary after-commit-before-enqueue` — same exactly-once trail.
4. Kill-9 after dispatch/before ack: run `holo queue:effect effect-kill9-3 --boundary after-dispatch-before-ack` — same exactly-once trail.
5. Run `holo queue:audit effect-kill9-1` — observe `outbox_count: 1`, `inbox_dedupe_count: 1`, `fencing_token` set.
6. Interactive priority: run `holo queue:enqueue bg-mission --lane background`, then `holo queue:enqueue ix-chat --lane interactive`, then `holo queue:dequeue` — observe the first dequeued `lane=interactive` (priority 100 before background priority 10).
7. Poison to DLQ: run `holo queue:poison poison-1 --max-attempts 3` — observe `status: dead_letter`, `attempts: 3/3`, `dlq_count: 1` (never silently dropped).
8. Run `holo jobs:list` — observe `total: 16` split `janitor=7 workflow=4 consumer=1 backfill=3 digest=1`.

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| queue-1 | Mastra native schedule + pg-boss (graphile-worker fallback) leased queue — retries/backoff/DLQ/priority | mastra-implementer | 240 min |
| queue-2 | Transactional outbox/inbox + idempotency keys + fencing consumer (exactly-once observable effects) | mastra-implementer | 240 min |
| queue-3 | Migrate all 16 crons to the new scheduler/queue with observable side-effects + priority lanes | mastra-implementer | 300 min |
| queue-4 | RED tests: kill-9 at commit/dispatch/ack → exactly-once + dedupe, all-16-fire, priority, DLQ | red-test-generator | 210 min |
| queue-5 | Review durable-effect contract | mastra-reviewer | 90 min |
| GATE-FIX-001 | Add documented production CLI coverage for seeded-effect kill/recovery at the before-commit boundary | mastra-implementer | 90 min |
| GATE-FIX-002 | Add documented production CLI coverage for after-commit/before-enqueue and after-dispatch/before-ack recovery | mastra-implementer | 90 min |
| GATE-FIX-003 | Add documented production CLI coverage for interactive-over-background dequeue priority | mastra-implementer | 60 min |
| GATE-FIX-004 | Add documented production CLI coverage for poison retry exhaustion and dead-letter inspection | mastra-implementer | 60 min |
| GATE-FIX-005 | Make queue audit output satisfy the one-outbox/one-inbox/fencing-token gate evidence contract | mastra-implementer | 45 min |
| REDHAT-FIX-H1 | Preserve the failed job error in JobRunResult and surface it through the jobs runner/CLI instead of silently swallowing it | mastra-implementer | 45 min |

## Source Coverage

- UC-PLAT-03 — Scheduler & durable queue.
- T-PLAT-009 — all 16 jobs run with observable side-effects.
- T-PLAT-010 — exactly-once observable effects survive kill-9 with auditable outbox/inbox dedupe and fencing.
- T-PLAT-011 — interactive priority over background work.
- `10-technical-requirements/11-runtime-contracts.md` — durable work and observable-effects contract.
- `10-technical-requirements/03-data-schema.md` — Postgres schema/index substrate.
- `10-technical-requirements/04-api-design.md` — idempotency and reconciliation surface.
- `10-technical-requirements/09-capability-chains.md` — migration and durable-effect boundary context.
- Existing platform stack: Sprints 01/04/05 outputs, `services/platform/src/stack/`, `services/platform/src/cli/holo.ts`, and the scheduler launchd plist.

## Capability Coverage

N/A — the outbox/inbox exactly-once contract underpins CAP-MIG-01/CAP-CUT-01 effects but owns no boundary-crossing chain itself.

## Blocks

- Sprint 15: Mission Engine — Durable Resumable Templates.

## Dependencies

- Depends on: Sprint 01, Sprint 04, Sprint 05.
- The task graph is queue-4 (RED) → queue-1 (queue runtime) → queue-2 (durable effects) → queue-3 (16-job migration) → queue-5 (review).

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-07-17T18:46:47Z.

- queue-1-mastra-native-schedule-pg-boss-graphile-worker-fallback-leased-queue-retries-backoff-dlq-priority.md
- queue-2-transactional-outbox-inbox-idempotency-keys-fencing-consumer-exactly-once-observable-effects.md
- queue-3-migrate-all-16-crons-to-the-new-scheduler-queue-with-observable-side-effects-priority-lanes.md
- queue-4-red-tests-kill-9-at-commit-dispatch-ack-to-exactly-once-dedupe-all-16-fire-priority-dlq.md
- queue-5-review-durable-effect-contract.md
