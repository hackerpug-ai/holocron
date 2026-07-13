---
stability: CONSTITUTION
last_validated: 2026-07-12
prd_version: 1.0.0
---

# Technical Requirements — Fulcrum

Constitution layer for the Fulcrum autoresearch loop. Section index below.

## Section Index

| # | File | Topic | Stability |
|---|------|-------|-----------|
| 01 | [01-architecture-posture.md](./01-architecture-posture.md) | The six load-bearing stances (local-inference-first, deterministic/agentic seam, role map, evolve-not-fork, append-only Convex, human done-bit) | CONSTITUTION |
| 02 | [02-system-components.md](./02-system-components.md) | The 9 components + the worker↔Convex reachability boundary | CONSTITUTION |
| 03 | [03-data-schema.md](./03-data-schema.md) | The `fulcrum*` Convex tables (append-only ledger) + invariants | CONSTITUTION |
| 04 | [04-api-design.md](./04-api-design.md) | Convex function surface, worker dispatch contract, pure Gate module | CONSTITUTION |
| 05 | [05-architecture-diagram.md](./05-architecture-diagram.md) | Cycle data flow + the two defining seams | CONSTITUTION |
| 06 | [06-external-dependencies.md](./06-external-dependencies.md) | Reused holocron stack + local fleet + config surface | CONSTITUTION |
| 07 | [07-technical-risks.md](./07-technical-risks.md) | Risk register (R1 extraction quality + R2 reachability gate the initiative) | CONSTITUTION |
| 08 | [08-capability-chains.md](./08-capability-chains.md) | 5 boundary-crossing chains (dispatch, inference, evidence, publish, gate) | CONSTITUTION |
| 09 | [09-e2e-testing.md](./09-e2e-testing.md) | Harness constitution + the determinism seam + spike gate | CONSTITUTION |

**Routing & Views: N/A** — no navigable in-app UI is in scope (MVP surfaces are generated Markdown briefs/dossiers + stored `documents`). A rich in-app Fulcrum UI is a deferred, separate PRD; routing is specified there.

**UI Infrastructure: N/A** — same reason; no new design system, component library, or screens in this initiative.

## Reality Gate — e2e/integration infra per surface

| Surface | Framework | Status |
|---------|-----------|--------|
| Convex backend (Gate, ledger, selector, verdicts) | `convex-test` + Vitest | Present in holocron; extend |
| Fulcrum Worker (Bun, tailnet) | Bun test | **Provision** (new package/process) |
| Local inference (LiteLLM/`llama-server`) | live-endpoint lane, `fleet-start` gated | Present (fleet exists); wire the test lane |
| Full cycle | Convex dev + worker + real retrieval + local inference | **Provision** (the spike gate) |

The Worker and full-cycle surfaces have no e2e harness yet — a leading INFRA sprint provisions the Bun worker test rig and the proven-reference-flow spike before feature sprints depend on it.

## Version History (this folder)

| Version | Date | Changes | Trigger |
|---------|------|---------|---------|
| 1.0.0 | 2026-07-12 | Initial technical requirements | New initiative |

## Parent

[Fulcrum PRD README](../README.md)
