---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 1.0.0
---

# Technical Requirements — MK-VI Platform Migration

Backend platform migration off Convex to Mastra (Bun) + Postgres on the tailnet mini. No new UI.

## Section Index

| # | File | Topic | Stability |
|---|------|-------|-----------|
| 01 | [01-architecture-posture.md](./01-architecture-posture.md) | Load-bearing stances (Postgres-only/no-SQLite, Mastra-on-mini, deterministic seam, local-first, one engine, big-bang, tailnet security) | CONSTITUTION |
| 02 | [02-system-components.md](./02-system-components.md) | The Mastra/Postgres/fleet component set | CONSTITUTION |
| 03 | [03-data-schema.md](./03-data-schema.md) | Postgres schema, merges, evidence graph, vectors, Zero split, ETL invariants | CONSTITUTION |
| 04 | [04-api-design.md](./04-api-design.md) | Hono routes, MCP gateway, the mission contract | CONSTITUTION |
| 05 | [05-architecture-diagram.md](./05-architecture-diagram.md) | Tailnet topology diagram | CONSTITUTION |
| 06 | [06-external-dependencies.md](./06-external-dependencies.md) | Added / kept / removed dependencies + docs URLs | CONSTITUTION |
| 07 | [07-ui-infrastructure.md](./07-ui-infrastructure.md) | Client data-layer swap (Convex hooks → Zero); no new UI | CONSTITUTION |
| 08 | [08-technical-risks.md](./08-technical-risks.md) | Consolidated risk register (R1–R18) | CONSTITUTION |
| 09 | [09-capability-chains.md](./09-capability-chains.md) | Boundary-crossing chains (ETL, cutover, embed, inference, sync, public egress) | CONSTITUTION |
| 10 | [10-e2e-testing.md](./10-e2e-testing.md) | E2E harness constitution (real Postgres + Mastra + fleet; determinism seam; spike gate) | CONSTITUTION |

**Routing & Views:** N/A — no new navigable UI. The RN app's existing expo-router routes are unchanged; only their data layer swaps from Convex hooks to Zero (see 07-ui-infrastructure).

## Cross-references

- Scope: [`../01-scope.md`](../01-scope.md) · Roles: [`../02-roles.md`](../02-roles.md) · Functional groups: [`../03-functional-groups.md`](../03-functional-groups.md)
- Use cases: [PLAT](../04-uc-plat.md) · [DATA](../05-uc-data.md) · [SVC](../06-uc-svc.md) · [INFER](../07-uc-infer.md) · [SYNC](../08-uc-sync.md)
- E2E criteria: [`../11-e2e-testing-criteria.md`](../11-e2e-testing-criteria.md)
- Contained initiative: [`../../fulcrum/`](../../fulcrum/) (built as a mission template on this platform; its ADR-001/ADR-002 are retired here)

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-13 | Initial technical requirements. |
