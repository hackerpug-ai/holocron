# mission-3 — Atomic commit, idempotent replay, budgets, telemetry/provenance

> Status: Completed · Sprint: 15 · Agent: mastra-implementer · Proposed By: mastra-planner

## Outcome

Make terminal mission output an all-or-nothing typed commit with exactly-once replay semantics and explicit budget outcomes, reusing Sprint 11 queue/idempotency and Sprint 12 telemetry/budget patterns.

## Acceptance Criteria

### AC-1 — atomic typed commit
One transaction validates final output through the registered schema, inserts exactly one `mission_commits` row, updates the run terminal state/output/usage, and appends the terminal event. A real child-process `SIGKILL` at each named boundary (`before_commit_insert`, `after_commit_insert_before_run_update`, `after_run_update_before_terminal_event`) rolls back all mission commit and terminal-state writes; no partial result is observable. A thrown error alone is not accepted as proof.

### AC-2 — idempotent replay
The same `(template_key, idempotency_key)` returns the stored terminal result with `replay: true` and does not execute a stage or duplicate telemetry. Concurrent starts/commits converge on one run and one commit. Conflicting inputs for an existing key fail closed.

### AC-3 — budgeted termination
Effective wall-ms, token, cost, and max-step budgets are copied to the run. Enforcement occurs before/after stages using real telemetry/ledger values; a breach persists `budget_exceeded`, usage, error code, and terminal commit, never silent abandonment or an apparently successful partial output.

### AC-4 — provenance and observability
Run/stage/commit rows and mission events persist template/compiler/registry/executor/schema plus fleet/model manifest/revision provenance, trace IDs, attempts, budget deltas, and checkpoint references. Values are queryable and stable across replay.

## Test Criteria

- TC-1 RED: atomic commit/idempotency/budget surfaces fail at start state.
- TC-2 crash boundary: spawn a real child CLI process with `HOLO_TEST_CRASH_AT=mission-commit/<named-boundary>`, SIGKILL it, inspect real Postgres for zero partial rows, then remove the hook and replay successfully exactly once.
- TC-3 replay: repeated/concurrent real starts prove no stage re-execution or duplicate commit/telemetry.
- TC-4 budget: wall/token/step fixtures produce explicit `budget_exceeded` with persisted usage.

## Guardrails

Use the existing budget ledger and inference telemetry; do not invent a second global cost ledger. Keep external side effects behind the existing outbox contract. No “catch error and return success” path.

<!-- REQUIREMENT-CONTRACT v1
{"requirements":[{"id":"AC-1","kind":"acceptance","tier":"integration","description":"atomic typed commit","verification":"real crash boundary and DB inspection"},{"id":"AC-2","kind":"acceptance","tier":"integration","description":"idempotent replay","verification":"concurrent real starts"},{"id":"AC-3","kind":"acceptance","tier":"integration","description":"explicit budget outcome","verification":"real usage and terminal row"},{"id":"AC-4","kind":"acceptance","tier":"integration","description":"provenance observability","verification":"DB/event inspection"},{"id":"TC-1","kind":"test","tier":"integration","description":"RED missing commit surfaces","verification":"start-state failure"},{"id":"TC-2","kind":"test","tier":"integration","description":"rollback proof","verification":"real transaction inspection"},{"id":"TC-3","kind":"test","tier":"integration","description":"replay exactly once","verification":"concurrent subprocesses"},{"id":"TC-4","kind":"test","tier":"integration","description":"budget exceeded","verification":"terminal persisted status"}]}
-->
