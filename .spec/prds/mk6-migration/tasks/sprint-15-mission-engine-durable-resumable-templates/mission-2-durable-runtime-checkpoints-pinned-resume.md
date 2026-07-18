# mission-2 — Durable run runtime, leases, checkpoints, pinned resume, SIGKILL recovery

> Status: Planned · Sprint: 15 · Agent: mastra-implementer · Proposed By: mastra-planner

## Outcome

Execute a compiled template through real Postgres-backed run/stage state. Every successful stage is a durable checkpoint; leases fence concurrent runners; resume uses the persisted compiled plan and pinned executor/schema versions after process death.

## Acceptance Criteria

### AC-1 — checkpointed execution
A valid run creates one authoritative `mission_runs` row and ordered `mission_stage_runs`; each successful stage atomically persists its typed output/checkpoint before advancing. A stage crash leaves the last committed checkpoint intact and never advances the cursor early.

### AC-2 — lease and fencing
Start/resume acquires a durable lease under row lock with token and expiry. A live competing token cannot execute or commit; expired leases can be recovered with incremented attempt number. Terminal commit clears the lease.

### AC-3 — pinned recovery
A subprocess killed after a deterministic checkpoint can be resumed by run ID. Resume executes the stored compiled plan, template hash, compiler, registry, executor, schema, and fleet/model revision—not the latest template—and produces no duplicate committed stage rows. Missing pinned executor/version fails closed with an explicit error.

## Test Criteria

- TC-1 RED: no run/checkpoint/resume/lease surfaces pass at the start state.
- TC-2 real subprocess: spawn `test.sigkill`, SIGKILL after stage checkpoint, resume, compare stage attempts and outputs.
- TC-3 fencing: two real processes contend for one run; exactly one lease holder can advance/commit.
- TC-4 pinned-version: mutate active template/registry after suspension; resumed output proves original pinned plan.

## Guardrails

Mastra workflow snapshots are substrate references only; Postgres mission rows are canonical. No in-memory-only progress, scheduler-only resume, or runtime-created DDL. The deterministic crash seam must be an explicit test harness boundary, never a production success branch.

<!-- REQUIREMENT-CONTRACT v1
{"requirements":[{"id":"AC-1","kind":"acceptance","tier":"integration","description":"checkpointed execution","verification":"real Postgres stage rows"},{"id":"AC-2","kind":"acceptance","tier":"integration","description":"lease fencing","verification":"two real processes"},{"id":"AC-3","kind":"acceptance","tier":"integration","description":"pinned SIGKILL recovery","verification":"subprocess kill/resume"},{"id":"TC-1","kind":"test","tier":"integration","description":"RED missing runtime","verification":"start-state failure"},{"id":"TC-2","kind":"test","tier":"integration","description":"SIGKILL resume","verification":"real subprocess"},{"id":"TC-3","kind":"test","tier":"integration","description":"lease contention","verification":"real process race"},{"id":"TC-4","kind":"test","tier":"integration","description":"pinned version","verification":"mutated registry proof"}]}
-->
