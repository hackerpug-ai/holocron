---
stability: CONSTITUTION
last_validated: 2026-08-20
prd_version: 3.0.0
---

# Technical Requirements — Fulcrum

> **v3.0.0 lock alignment (2026-08-20).** Sections 00–09 in this folder are **current**. They describe the live MK-VI platform (Mastra + Postgres + loopback fleet), not the v1.0.1 sidecar worker. Treat a banner that still says "re-platform pending" as a defect if you find one; this pass rewrote the bodies. **TR re-derive is a hard gate before `/kb-sprint-plan`.** Do not plan sprints against stale Convex / SQLite / Prospector-table pretenses.

Constitution layer for the Fulcrum autoresearch loop. Section index below.

## Four locks (non-negotiable)

1. **Ledger.** Fulcrum extends the live Postgres evidence graph (`sources`, `passages`, `claims`, `entities`, `relations`, `beliefs` in `services/platform/src/db/schema/evidence.ts`). It does **not** port Prospector as a second schema (`prospects`, `cycles`, `scores`, `fulcrumCycles`). New columns/tables are allowed for scoring, candidates, weight versions, cycle log, and touches — as named Drizzle extensions of that graph.
2. **Roles.** Fulcrum addresses the live `FLEET_ROLE_NAMES`: `divergent` (ASSAY/extract), `convergent` (SENSE-plan / GENERATE / CHALLENGE), `embed` (1024-dim). `fulcrum-assay` / `fulcrum-challenge` may exist only as `fleet.json` aliases of those roles, mapped 1:1. **`judge` is forbidden on the Fulcrum path**, the same way coder roles are forbidden.
3. **Cycle.** mk6 shipped `evidence-research`: `plan → retrieve → extract → assay → challenge → gate → commit` (`services/platform/src/mission/templates/evidence-research.ts`). `fulcrum` is an **alias** of that template, trigger on-demand, `toolGrants: []` today. Fulcrum still **builds** MAP/niche, work-item selector, scoring, perpetual schedule, briefs/dossiers. It does not inherit those.
4. **Operator surface (MVP).** Reads = generated Markdown (in-repo + `documents` via `publishDocumentForRun`). Writes = CLI over existing mission APIs (`POST /api/missions/:id/verdicts` already exists; `ack-brief` is a named touch mutation). Loop health = a **section of the daily brief**. No RN screens, no "navigates."

## Section Index

| # | File | Topic | Stability |
|---|------|-------|-----------|
| 00 | [00-architecture-decisions.md](./00-architecture-decisions.md) | ADRs — 001/002 SUPERSEDED (historical text retained); 003 AFFIRMED; 004–008 ACTIVE against the four locks | CONSTITUTION |
| 01 | [01-architecture-posture.md](./01-architecture-posture.md) | Six load-bearing stances (loopback fleet client, claims-not-judge, research roles, mine-design/re-implement, evidence-graph ledger, human done-bit) | CONSTITUTION |
| 02 | [02-system-components.md](./02-system-components.md) | Mission Engine template + pure Gate + evidence-graph extensions + scheduler job + Markdown generator | CONSTITUTION |
| 03 | [03-data-schema.md](./03-data-schema.md) | Drizzle against live evidence tables plus named Fulcrum extensions; publish = `publishDocumentForRun` | CONSTITUTION |
| 04 | [04-api-design.md](./04-api-design.md) | `holo fulcrum …` + `/api/missions` + `/api/missions/:id/verdicts` + named ack/touch | CONSTITUTION |
| 05 | [05-architecture-diagram.md](./05-architecture-diagram.md) | RN/Zero optional → Postgres → Mastra Mission Engine → loopback router → `inference1`/`inference2` | CONSTITUTION |
| 06 | [06-external-dependencies.md](./06-external-dependencies.md) | Live fleet + Mastra registry tools (corpus-only SENSE) + config surface | CONSTITUTION |
| 07 | [07-technical-risks.md](./07-technical-risks.md) | Risk register against the four locks (no dead Convex/Cohere/SQLite rows) | CONSTITUTION |
| 08 | [08-capability-chains.md](./08-capability-chains.md) | Boundary-crossing chains; owners = `mastra-*` | CONSTITUTION |
| 09 | [09-e2e-testing.md](./09-e2e-testing.md) | Harness = Mastra + real Postgres + live fleet; determinism seam kept | CONSTITUTION |

**Routing & Views: N/A** — no navigable in-app UI is in scope. MVP surfaces are generated Markdown briefs/dossiers (in-repo + stored `documents`) and named CLI writes. A rich in-app Fulcrum UI is a deferred, separate PRD; routing is specified there. It is **not** a Fulcrum AC.

**UI Infrastructure: N/A** — no new design system, component library, or screens in this initiative.

## Reality Gate — e2e/integration infra per surface

| Surface | Framework | Status |
|---------|-----------|--------|
| Mastra Mission Engine (Gate, ledger extensions, selector, verdicts) | Vitest against **real Postgres** + the live Mastra service | **Provision** — extend the mk6 rig for the Fulcrum alias |
| Fulcrum mission template (evidence-research + GENERATE + MAP) | Mastra workflow runner against a real compiled template | **Provision** |
| Local inference (packaged router on loopback → oMLX on `inference1`/`inference2`) | live-fleet lane, gated on the fleet's own `preflight` exit code | Present (router + minis exist); wire Fulcrum role-resolution (`divergent`/`convergent`/`embed`) + header-truthful telemetry |
| Full cycle | Mastra + real Postgres + live fleet + named registry tools | **Provision** (the spike gate — one green reference cycle) |

The mission-template and full-cycle surfaces have no e2e harness yet — a leading INFRA sprint provisions the Fulcrum mission test rig (on top of mk6's) and the proven-reference-flow spike before feature sprints depend on it.

## Version History (this folder)

| Version | Date | Changes | Trigger |
|---------|------|---------|---------|
| 1.0.0 | 2026-07-12 | Initial technical requirements | New initiative |
| 1.0.1 | 2026-07-13 | Added ADRs; conformed sections to local-ledger / publish-only-Convex reality (now historical). | Architecture verification |
| 2.0.0 | 2026-07-13 | Re-platform onto mk6: ADR-001/002 SUPERSEDED, ADR-004/005/006 added. Detail sections flagged re-derive pending. | Sequenced after mk6-migration |
| 3.0.0 | 2026-08-20 | Fleet alignment (ADR-007/008) **and lock alignment**: CONSTITUTION bodies rewritten against the live evidence graph, live `FLEET_ROLE_NAMES`, live evidence-research seven-stage cycle, and CLI+Markdown MVP. TR re-derive is the hard gate before `/kb-sprint-plan`. | Fleet alignment + lock rewrite |

## Parent

[Fulcrum PRD README](../README.md)
