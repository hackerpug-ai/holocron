---
sprint: 15
title: Mission Engine — Durable Resumable Templates
sequence: 15
timeline: Phase 3 — Migration Engine and Services
status: Completed
prd: ../../README.md
planned_from_roadmap_sha: 5c705e9cc6fe5ed81092f8da57a68c80f0166fa0
planned_from_source_sha: 5c705e9cc6fe5ed81092f8da57a68c80f0166fa0
source_kind: git-head
planned_at: 2026-07-18T09:40:00Z
---

# Sprint 15: Mission Engine — Durable Resumable Templates

**Sequence:** 15  
**Timeline:** Phase 3 — Migration Engine and Services  
**Status:** Completed  
**Proposed by:** mastra-planner + convex-planner, consolidated after red-hat review  
**Branch:** `mk6-mission-engine`

## Scope

Introduce the canonical Postgres-backed Mission Engine. Templates are immutable declarative contracts compiled through a code-owned registry of stage, executor, and schema references. Runs persist pinned template/compiler/registry/executor/schema/fleet provenance, stage checkpoints, leases, budgets, typed terminal output, and idempotent commit results. A deterministic built-in test template proves real execution, SIGKILL recovery, commit rollback, and budget termination. The existing Sprint 12 `mission run research` compatibility path remains unchanged; Sprint 17 owns research-template migration.

## Human Testing Gate

**Gate:** Against real Postgres, the real service runtime, and a real fleet role probe, register a closed declarative template, run it through `holo mission run <template> --goal '…'`, observe typed output with exact template/compiler/registry/executor/schema/fleet provenance, kill and resume from its last committed stage, replay its idempotency key without re-execution, prove an over-budget run terminates as `budget_exceeded`, and exercise authenticated RN status/steer/verdict control events.

## Test Steps

1. Register the committed `test.echo` declarative template and run it with a unique idempotency key — real Postgres stores typed output and template/compiler/registry/executor/schema/fleet provenance.
2. Submit an unknown stage, executable/code-bearing config, serialized Zod/function field, or incompatible schema reference — rejected before `mission_runs` creation.
3. Spawn a real mission subprocess using the deterministic SIGKILL template, kill it after a committed checkpoint, then run `holo mission resume <id>` — the pinned plan resumes from the first uncommitted stage without duplicate committed stage rows.
4. Spawn a real child CLI with `HOLO_TEST_CRASH_AT=mission-commit/<named-boundary>` and SIGKILL it at each commit boundary — no partial rows; replay after removing the hook commits exactly once. A thrown error alone is not proof.
5. Replay the completed idempotency key — returns the stored result with `replay: true` and does not execute a stage again.
6. Run a template whose effective wall/token/step budget is exceeded — terminal status is `budget_exceeded`, with persisted usage and no silent non-commit.
7. Use the RN API key on mission status, steer, and verdict routes — status, provenance, checkpoints, typed output, and control events are real persisted values; unkeyed/wrong-scope requests fail 401/403; no placeholder/canned response.

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| mission-1 | Versioned mission contracts, closed DSL compiler, registry, schema/migration | mastra-implementer | 300 min |
| mission-2 | Durable run runtime, leases, checkpoints, pinned resume, SIGKILL recovery | mastra-implementer | 300 min |
| mission-3 | Atomic commit, idempotent replay, budgets, telemetry/provenance | mastra-implementer | 240 min |
| mission-4 | CLI/HTTP control surface and deterministic test templates | mastra-implementer | 180 min |
| mission-5 | RED tests for contracts/runtime/commit and real-service failure controls | red-test-generator | 180 min |
| mission-6 | Full real gate, adversarial durability review, and closure evidence | mastra-reviewer | 120 min |

## Dependency order

`mission-5 RED → mission-1 → mission-2 → mission-3 → mission-4`; `mission-1..4 + mission-5 → mission-6`.

## Task Detail Files

- `mission-1-contracts-closed-dsl-registry-schema.md`
- `mission-2-durable-runtime-checkpoints-pinned-resume.md`
- `mission-3-atomic-commit-idempotency-budgets-provenance.md`
- `mission-4-cli-http-control-surface-test-templates.md`
- `mission-5-red-tests-real-service-failure-controls.md`
- `mission-6-real-gate-adversarial-review-closure.md`

## Source Coverage

- UC-SVC-01
- T-SVC-001, T-SVC-002, T-SVC-003, T-SVC-004
- `10-technical-requirements/04-api-design.md` mission contract and CLI/API shape
- `10-technical-requirements/09-capability-chains.md` mission execution boundaries
- `10-technical-requirements/11-runtime-contracts.md` declarative-only and provenance requirements
- Sprint 08 degraded-mode/real fleet contracts, including role resolution and no-cloud-fallback failure
- Sprint 12 exact fleet/model manifest and revision provenance
- Sprint 11 queue lease, outbox/inbox, idempotency, and crash-rollback patterns
- Sprint 12 telemetry, budget, trace, and versioned-eval patterns

## Dependencies and Boundaries

Depends on Sprints 04, 05, 08, 11, and 12. Blocks Sprints 17, 22, 23, and 25. Sprint 15 persists authenticated verdict/steer events but does not implement full deterministic Fulcrum verdict enforcement; Sprint 23 owns WIP/cited-kill/probe-gated policy. Sprint 15 does not migrate the research mission (Sprint 17), does not execute arbitrary Mastra workflows from database JSON, and does not use runtime-created hidden DDL. The canonical ledger is Postgres; Mastra snapshots are an execution substrate only. Real Postgres and real subprocess crash tests are mandatory; mocks may only exercise pure compiler/parser rejection cases.

<!-- PLANNING-REVIEW: specialist proposals are .tmp/sprint-15-plan/mastra-planner-proposal.md and convex-planner-proposal.md; red-hat findings are .tmp/sprint-15-plan/sprint15-redhat-review.md. -->
