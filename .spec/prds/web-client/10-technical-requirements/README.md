# Technical Requirements

**Stability:** CONSTITUTION · **PRD version:** 1.0.0 · **Last validated:** 2026-08-28

## Section index

| # | File | Topic | Stability |
|---|---|---|---|
| 1 | [`01-architecture-posture.md`](./01-architecture-posture.md) | Seven architectural stances everything else follows from | CONSTITUTION |
| 2 | [`02-system-components.md`](./02-system-components.md) | System components across edge, app and device layers | CONSTITUTION |
| 3 | [`03-data-schema.md`](./03-data-schema.md) | Entities, wire shapes and the one genuinely new persistence | CONSTITUTION |
| 4 | [`04-api-design.md`](./04-api-design.md) | Public HTTP, the tRPC BFF surface, and device calls | CONSTITUTION |
| 5 | [`05-architecture-diagram.md`](./05-architecture-diagram.md) | ASCII topology with the auth and tunnel boundaries | CONSTITUTION |
| 6 | [`06-external-dependencies.md`](./06-external-dependencies.md) | Dependencies with docs URLs, versions and risks | CONSTITUTION |
| 7 | [`07-ui-infrastructure.md`](./07-ui-infrastructure.md) | Tokens, reading column, figures, motion, enforcement, registry | CONSTITUTION |
| 8 | [`08-technical-risks.md`](./08-technical-risks.md) | Risk register, blocking prerequisites first | CONSTITUTION |
| 9 | [`09-capability-chains.md`](./09-capability-chains.md) | Boundary-crossing chains with real-service proof | CONSTITUTION |
| 10 | [`10-routing.md`](./10-routing.md) | Route map, discriminator, guards, Route Delta | CONSTITUTION |
| 11 | [`11-e2e-testing.md`](./11-e2e-testing.md) | E2E harness constitution and the Reality Gate | CONSTITUTION |

## Cross-references

- Scope — [`../01-scope.md`](../01-scope.md)
- Roles — [`../02-roles.md`](../02-roles.md)
- Functional groups — [`../03-functional-groups.md`](../03-functional-groups.md)
- Use cases — `../04-uc-chat.md` · `../05-uc-lib.md` · `../06-uc-read.md` · `../07-uc-share.md` · `../08-uc-shell.md`
- Test criteria — [`../11-e2e-testing-criteria.md`](../11-e2e-testing-criteria.md)
- Design brief (pre-PRD, verified defects) — `../../../docs/plans/webclient-design-brief.md`
- Design mock prompt — `../../../docs/plans/webclient-design-mock-prompt.md`

## Routing

Present — this is a navigable-UI product. See [`10-routing.md`](./10-routing.md): 9 routes,
19 UI-facing use cases, all mapped.

## Version history

| Version | Date | Changes | Trigger |
|---|---|---|---|
| 1.0.0 | 2026-08-28 | Initial technical requirements — 11 sections merged from five architecture lenses, two UI lenses and the harness constitution | New initiative |

## Parent

[`../README.md`](../README.md)
