---
stability: CONSTITUTION
last_validated: 2026-08-20
prd_version: 3.0.0
---

# Technical Requirements — Fulcrum

> **✅ v3.0.0 fleet alignment (2026-08-20) — these sections are now CURRENT:** `00-architecture-decisions.md` (ADR-007/008 added), `01-architecture-posture.md` (stance 3′ replaces stance 3; stance 1 fully dead), `06-external-dependencies.md` (**fully re-derived against the live fleet**, probed not recalled), `07-technical-risks.md` (R1 re-scoped, R5 downgraded, R14–R17 added), `09-e2e-testing.md` (header-truthful substitution rule + landmine ledger). **Still `⚠️ Re-platform pending`:** 02, 03, 04, 05, 08.

> **⚠️ v2.0.0 re-platform in progress (2026-07-13).** Fulcrum is now sequenced after [`mk6-migration`](../../mk6-migration/README.md) and re-platformed onto Mastra + Postgres + local fleet. The **ADRs** (`00-architecture-decisions.md`) are current — ADR-001/002 superseded, ADR-004/005/006 added. The **detail sections 01–09 still describe the v1.0.1 architecture** (tailnet sidecar worker, `bun:sqlite` ledger, Convex publish hop, Cohere embeddings) and each carries a `⚠️ Re-platform pending` banner. They are honest placeholders — to be re-derived against the live mk6 platform in a follow-on `--edit` pass before sprint planning consumes them. Treat any specific SQLite DDL, "worker↔Convex" boundary, or Cohere reference below as **stale** until that pass; the *invariants and seams* (deterministic gate, append-only idempotent ledger, two-model challenge, human done-bit) carry forward unchanged.

Constitution layer for the Fulcrum autoresearch loop. Section index below.

## Section Index

| # | File | Topic | Stability |
|---|------|-------|-----------|
| 00 | [00-architecture-decisions.md](./00-architecture-decisions.md) | **ADRs (CURRENT, v2.0.0)** — ADR-001/002 SUPERSEDED, ADR-003 AFFIRMED, ADR-004/005/006 added (Postgres ledger, local Qwen3 embedder, mission-template-not-sidecar) | CONSTITUTION |
| 01 | [01-architecture-posture.md](./01-architecture-posture.md) | ⚠️ *v1.0.1 — re-derive pending.* Six load-bearing stances (local-inference-first, deterministic/agentic seam, role map, evolve-not-fork, ~~local SQLite ledger~~ → Postgres (ADR-004), human done-bit) | CONSTITUTION |
| 02 | [02-system-components.md](./02-system-components.md) | ⚠️ *v1.0.1 — re-derive pending.* The 9 components + the ~~worker↔Convex reachability boundary~~ → mission-template-on-Mission-Engine boundary | CONSTITUTION |
| 03 | [03-data-schema.md](./03-data-schema.md) | ⚠️ *v1.0.1 — re-derive pending.* ~~Local `bun:sqlite` ledger~~ → **Postgres append-only tables on the mk6 substrate** (Prospector schema/logic reused) + invariants | CONSTITUTION |
| 04 | [04-api-design.md](./04-api-design.md) | ⚠️ *v1.0.1 — re-derive pending.* ~~Convex function surface, worker dispatch contract~~ → Mastra mission-template API + pure Gate module | CONSTITUTION |
| 05 | [05-architecture-diagram.md](./05-architecture-diagram.md) | ⚠️ *v1.0.1 — re-derive pending.* Cycle data flow + the two defining seams (redraw against mk6 topology) | CONSTITUTION |
| 06 | [06-external-dependencies.md](./06-external-dependencies.md) | ⚠️ *v1.0.1 — re-derive pending.* Reused stack (swap Convex→Mastra/Postgres, Cohere→Qwen3) + local fleet + config surface | CONSTITUTION |
| 07 | [07-technical-risks.md](./07-technical-risks.md) | ⚠️ *v1.0.1 — partially current.* Risk register — R2 (reachability) and R11 (1024-dim embedder) are **retired by mk6**; re-rank the rest | CONSTITUTION |
| 08 | [08-capability-chains.md](./08-capability-chains.md) | ⚠️ *v1.0.1 — re-derive pending.* 5 boundary-crossing chains (the dispatch/publish hops collapse onto the platform) | CONSTITUTION |
| 09 | [09-e2e-testing.md](./09-e2e-testing.md) | ⚠️ *v1.0.1 — re-derive pending.* Harness constitution + determinism seam + spike gate (Worker surface → mission-template surface; re-provision vs mk6 rig) | CONSTITUTION |

**Routing & Views: N/A** — no navigable in-app UI is in scope (MVP surfaces are generated Markdown briefs/dossiers + stored `documents`). A rich in-app Fulcrum UI is a deferred, separate PRD; routing is specified there.

**UI Infrastructure: N/A** — same reason; no new design system, component library, or screens in this initiative.

## Reality Gate — e2e/integration infra per surface

> ⚠️ *v2.0.0 — surfaces re-scoped against the mk6 platform.* Provisioning now keys off the mk6 test rig, not a standalone Bun worker.

| Surface | Framework | Status |
|---------|-----------|--------|
| Mastra Mission Engine (Gate, ledger, selector, verdicts) | Mastra test harness + Vitest against real Postgres | **Provision** — inherits mk6's test rig; extend for Fulcrum mission |
| Fulcrum mission template (Mastra workflow) | Mastra workflow test runner | **Provision** (was "Fulcrum Worker, Bun, tailnet" in v1.0.x — collapsed into the platform) |
| Local inference (packaged router on loopback → oMLX on `inference1`/`inference2`) | live-fleet lane, gated on the fleet's own `preflight` exit code | Present (router + minis exist); wire the Fulcrum role-resolution + header-truthful telemetry lane |
| Full cycle | mk6 platform + Fulcrum mission + real retrieval + local inference | **Provision** (the spike gate — proves one green reference cycle end-to-end) |

The mission-template and full-cycle surfaces have no e2e harness yet — a leading INFRA sprint provisions the Fulcrum mission test rig (on top of mk6's) and the proven-reference-flow spike before feature sprints depend on it.

## Version History (this folder)

| Version | Date | Changes | Trigger |
|---------|------|---------|---------|
| 1.0.0 | 2026-07-12 | Initial technical requirements | New initiative |
| 1.0.1 | 2026-07-13 | Added ADRs (00-architecture-decisions.md); conformed sections to local-ledger / publish-only-Convex reality. | Architecture verification |
| 2.0.0 | 2026-07-13 | **Re-platform onto mk6:** ADR-001/002 SUPERSEDED, ADR-004/005/006 added. Detail sections 01–09 flagged `⚠️ re-derive pending` (still v1.0.1 content); Reality Gate surfaces re-scoped (Worker → mission template; Convex → Mastra/Postgres). Invariants and seams unchanged. | Sequenced after mk6-migration |

## Parent

[Fulcrum PRD README](../README.md)
