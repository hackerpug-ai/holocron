# etl-1 — ETL pipeline: export, stage, whole-graph _id→UUIDv7 map, FK load, status normalization

> Status: Planned · Sprint: 14 · Agent: mastra-implementer · Proposed By: mastra-planner

## Outcome

A production `holo etl:run --export <dir>` command reads an immutable Convex export, validates its manifest and source catalog, stages raw records as JSONB, builds a complete stable `_id`→UUIDv7 map before loading any FK, then loads in dependency order with canonical status values and `legacy_convex_id` retained through soak.

## Scope

Own `services/platform/src/etl/`, CLI wiring, staging/load migrations and fixtures. Use real Postgres in integration tests. Do not own vector regeneration, BlobStore, upload routes, cutover, or mission templates.

## Acceptance Criteria

### AC-1 — immutable export validation
Given a real immutable Convex export archive and catalog, when `etl:run` starts, then manifest/hash/schema checks run before writes and a missing/modified archive fails closed without partial target rows.
**VERIFY:** `DATABASE_URL=... bun services/platform/src/cli/holo.ts etl:run --export ./tests/fixtures/etl/export --json` and tamper negative control exit nonzero.

### AC-2 — complete map before load
Given rows with cross-table references, when the run executes, then every source `_id` has exactly one UUIDv7 in `convex_id_map` before any domain insert and mappings are derived deterministically from `_creationTime`/stable tie-breaker.
**VERIFY:** inspect map count against catalog and kill/failure before load; no NULL mapping is accepted.

### AC-3 — FK-ordered canonical load
Given the full export, then parent relations load before children, real FK constraints remain enabled, all references resolve, `legacy_convex_id` is retained/indexed through soak, and `in-progress`/other source statuses map to documented canonical enums.
**VERIFY:** real nonprod run plus `holo etl:fk-audit --json`.

### AC-4 — rerunnable checkpointed execution
Given an interrupted or repeated run from the same immutable archive, then checkpoints resume/replay idempotently without duplicate rows and the final mapping is byte-stable.
**VERIFY:** kill-9 boundary fixture, rerun, compare row counts/map checksum.

## Test Criteria

- **TC-1 RED:** missing export manifest and tampered archive fail before target mutation.
- **TC-2 integration:** real Postgres load of a catalog-backed export yields expected UUIDv7 map, FK order, and retained legacy IDs.
- **TC-3 integration:** interruption/replay preserves idempotency and stable `convex_id_map`.

## Guardrails

Never disable constraints, silently drop an unknown field, accept an unapproved disposition, use random UUIDs, or mutate the source archive. Every run records source archive hash, catalog revision, run ID, checkpoint, and error reason.

<!-- REQUIREMENT-CONTRACT v1
{"requirements":[{"id":"AC-1","kind":"acceptance","tier":"integration","description":"immutable export validation","verification":"real CLI + tamper negative control"},{"id":"AC-2","kind":"acceptance","tier":"integration","description":"complete stable map before load","verification":"Postgres map/count/checksum"},{"id":"AC-3","kind":"acceptance","tier":"integration","description":"FK-ordered canonical load","verification":"real load + fk-audit"},{"id":"AC-4","kind":"acceptance","tier":"integration","description":"checkpointed idempotent replay","verification":"kill boundary + rerun"},{"id":"TC-1","kind":"test","tier":"integration","description":"tampered archive fails closed"},{"id":"TC-2","kind":"test","tier":"integration","description":"real catalog-backed load"},{"id":"TC-3","kind":"test","tier":"integration","description":"interruption replay stable"}]}
-->
