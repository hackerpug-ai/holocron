# mission-1 — Versioned mission contracts, closed DSL compiler, registry, schema/migration

> Status: Planned · Sprint: 15 · Agent: mastra-implementer · Proposed By: mastra-planner + convex-planner

## Outcome

Create the canonical mission contract and Postgres schema. Declarative templates resolve only code-owned stage/executor/schema references; no database value can encode executable JavaScript, a function, raw SQL, serialized Zod, or arbitrary model/provider behavior.

## Acceptance Criteria

### AC-1 — immutable versioned template records
Given a template definition, `template:register` validates the Zod contract, computes a stable definition hash, and inserts an immutable version row with `dsl_version`, compiler version, registry snapshot hash, output schema ref/version, budget policy, exact `fleet_manifest_version`, model revision(s), role-resolution snapshot, and no-cloud-fallback policy. Duplicate `(template_key, version)` is idempotent; differing content is rejected.

### AC-2 — closed registry compilation
Given a linear stage list, the compiler accepts only registered `stage_kind@version`, executor, input-schema, and output-schema references. At least one gate template stage must resolve a real model role through `resolveModel(role)` with an explicit fleet manifest/revision snapshot. Unknown role/unreachable fleet/no-cloud-fallback, incompatible, cyclic, extra executable/code-bearing, inline-Zod, raw SQL, or unregistered tool/model references fail before any `mission_runs` row is created.

### AC-3 — durable schema is migration-owned
Add Drizzle schema and SQL migration for `mission_templates`, immutable template versions, `mission_runs`, `mission_stage_runs`, checkpoints, commits, ordered events, steering, verdicts, and required indexes/constraints. No mission engine truth is created by runtime DDL. `zero_pub` exposure is explicit and minimal.

## Test Criteria

- TC-1 RED: missing registry/schema/migration/compiler surfaces fail against the start state.
- TC-2 integration: valid, unknown-stage, executable-field, schema-version, duplicate, and hash-conflict cases run against real Postgres.
- TC-3 provenance: persisted rows contain complete version/hash/fleet provenance and no executable payload.

## Guardrails

Use schema refs, never serialized Zod. Keep the v1 graph linear and deterministic; branching/loops/research are out of scope. `MissionTemplateSchema` is code-owned validation terminology only; Postgres stores schema IDs/versions, never a Zod value. Preserve migrated Convex workflow tables as history only. Do not alter the Sprint 12 research compatibility runner.

<!-- REQUIREMENT-CONTRACT v1
{"requirements":[{"id":"AC-1","kind":"acceptance","tier":"integration","description":"immutable versioned template records","verification":"real Postgres register/replay/hash"},{"id":"AC-2","kind":"acceptance","tier":"integration","description":"closed registry compilation","verification":"real rejection before run row"},{"id":"AC-3","kind":"acceptance","tier":"integration","description":"migration-owned mission schema","verification":"migration/schema/provenance inspection"},{"id":"TC-1","kind":"test","tier":"integration","description":"RED missing surfaces","verification":"start-state failure"},{"id":"TC-2","kind":"test","tier":"integration","description":"contract acceptance/rejection","verification":"real Postgres cases"},{"id":"TC-3","kind":"test","tier":"integration","description":"provenance purity","verification":"persisted rows and executable-payload scan"}]}
-->
