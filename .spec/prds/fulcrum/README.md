---
title: Fulcrum — Autonomous Research Loop
version: 3.1.0
scope_posture: full
pr_sequencing: true
source: file
depends_on: mk6-migration, virtual-device-fleet
---

# Fulcrum — Autonomous Research Loop — PRD

A perpetual, evidence-gated research loop that runs as a **standing mission template on the MK-VI platform** (Mastra + Postgres + local fleet) and feeds the holocron knowledge base — turning holocron's on-demand research into a continuous engine that nominates high-conviction findings for a human gate. Scope: **only the autoresearch loop mission**.

## Dependencies & Sequencing

**Fulcrum is hard-sequenced AFTER [`mk6-migration`](../mk6-migration/README.md).** It cannot start until the MK-VI platform is live.

| Dependency | Delivered by mk6 | Fulcrum inherits (does not build) |
|---|---|---|
| **Platform runtime** | Mastra (Bun) + Postgres on the mini; Mission Engine + `evidence-research` template | The workflow runtime. Live cycle is `plan → retrieve → extract → assay → challenge → gate → commit` (`fulcrum` is an alias, trigger on-demand, `toolGrants: []` today). **Fulcrum still builds:** GENERATE + MAP stages, work-item selector, scoring, perpetual `fulcrum:cycle` job, briefs/dossiers |
| **Local inference** | Role router (`divergent` / `convergent` / `judge` / `embed` / `rerank`) → local fleet | The substrate. Fulcrum uses **`divergent` / `convergent` / `embed` only.** `judge` is forbidden on this path, the same way coder roles are forbidden. Optional `fleet.json` aliases `fulcrum-assay`→`divergent`, `fulcrum-challenge`→`convergent` (1:1, not a third vocabulary) |
| **Ledger store** | Live evidence graph: `sources`, `passages`, `claims`, `entities`, `relations`, `beliefs` | The durable store. Fulcrum **extends** it (candidates, `belief_scores`, weight versions, touches, probes). It does **not** port Prospector (`prospects`, `cycles`, `scores`, `fulcrumCycles`) |
| **Embeddings** | Local Qwen3-Embedding 1024-dim via the `embed` role; Cohere dropped | The publish/embed path (`publishDocumentForRun`) |
| **App sync** | Zero (Rocicorp) over Postgres | A platform capability. **In-app Fulcrum UI is a deferred separate PRD, not a Fulcrum AC.** MVP reads = Markdown; MVP writes = CLI |

**Net effect:** the v1.0.x sidecar tailnet worker, the `bun:sqlite` ledger, and the Cohere embed hop are all deleted from the design — Fulcrum is the `fulcrum` alias of `evidence-research` plus the additions listed above (see [ADR-006](./09-technical-requirements/00-architecture-decisions.md)). Internal PR order (post-mk6): **LED (ledger/gate) → CYC (loop engine) → GATE (missions/human gate)**, with LIS config alongside LED.

## Second dependency: the Virtual Device Fleet (v3.0.0)

**Fulcrum is also hard-sequenced after the [Virtual Device Fleet](file:///Users/justinrich/models/.spec/prds/virtual-device-fleet/README.md)** — specifically its config + launcher layers (roadmap Sprints 01–06) and the two deferred items *"every node answers a role with the same model"* and *"the client node can embed again."* The **Tart VM tier is NOT a dependency**; it is separately gated and cancellable, and Fulcrum is insulated from its outcome.

| Dependency | Delivered by the fleet | Fulcrum inherits (does not build) |
|---|---|---|
| **Inference endpoint** | Packaged LiteLLM router, **loopback-only** as a code invariant | One `127.0.0.1` endpoint per node. Fulcrum configures no base URL, host, port, or device |
| **Role semantics** | Fleet-wide role definitions; a node cannot redefine a role | `divergent`, `convergent`, `embed` mean the same thing everywhere. Optional aliases map 1:1. `judge` is never requested |
| **Device selection** | Backend pools derived from per-node capability | Pinned to `inference1` + `inference2` via the router's `node_set` — **never the laptop** |
| **Failover & health** | Mini-to-mini failover, cooldown, preflight | Per-role degradation only; Fulcrum observes, never orchestrates |

**Why the pin matters:** a perpetual loop cannot depend on a machine that sleeps. Routing only to the two always-on minis is what makes 24/7 operation real rather than aspirational.

**What changed for Fulcrum ([ADR-007](./09-technical-requirements/00-architecture-decisions.md) / [ADR-008](./09-technical-requirements/00-architecture-decisions.md)):** the coder models Fulcrum was drafted against (`reviewer`, `implementer`) are **out of its vocabulary entirely** — they were always a workaround for what the fleet happened to serve. Fulcrum now addresses live `FLEET_ROLE_NAMES` **`divergent` / `convergent` / `embed` only**. `judge` is forbidden on this path. Model binding is a `fleet.json` edit scored by a **deterministic oracle** the gate already produces (quote-check pass rate over a denominator floor; refuting-claim gate-pass rate; kill-question later yielding admitted disconfirm). Cross-model challenge survives intact, and no LLM ever grades an LLM.

## Repository layout (monorepo)

The repo is a pnpm workspace (`pnpm-workspace.yaml` = `packages/*`). **Every Fulcrum surface lives inside `packages/platform`** — the Mastra + Hono + Postgres backend — reached through that package's `holo` CLI. Fulcrum has no package, `package.json`, or build target of its own.

| Package | What it is | On the Fulcrum path? |
|---|---|---|
| `packages/platform` | Mastra + Hono + Postgres backend | **Yes — all of it.** `src/fulcrum/`, `src/mission/`, `src/db/`, `src/inference/`, `src/cli/`, `src/research/`, `src/fleet/`, `src/evals/`, plus `Dockerfile`, `drizzle.config.ts`, `deploy/compose/`, `config/`, `tests/integration/fulcrum-*.test.ts` |
| `packages/mcp` | `@holocron/mcp-unified` | No |
| `packages/docs-reader` | `holocron-docs-reader` — Cloudflare Worker proxying `docs.holocrnlib.com` to an Access-authenticated origin | No. An edge cache with no database, Node runtime, or inference; it cannot host the ledger, gate, mission runtime, router, or CLI |
| `packages/mobile` | `@holocron/mobile` — Expo client | No (in-app Fulcrum UI is a deferred separate PRD) |
| `packages/web` | `@holocron/web` | No — placeholder, no product code |

Every path in this PRD and in [`tasks/`](./tasks/) is repo-root-relative and already carries the `packages/platform/` prefix. Root `package.json` is a private orchestrator only — no Fulcrum deps or scripts belong there. Full rules and the implementer consequences: [Architecture Posture stance 7](./09-technical-requirements/01-architecture-posture.md).

## PR Sequencing

This initiative ships as sequential PRs. The downstream `ROADMAP.md` (generated by `/kb-sprint-plan`) carries Branch and PR columns per sprint. **Lifecycle rule**: PR cell is empty while a sprint is 🔵 Planned, populated with a draft URL when work begins (🟠 In flight / 🟣 In review), and **MUST contain a merged PR URL** when status reaches ✅ Completed.

**Many-to-one** (sprints share a PR): repeat the URL across rows. **One-to-many** (sprint subdivides): run `/kb-sprint-plan --delta-replan` to split it; each sub-sprint gets its own row.

Full convention: `~/Projects/brain/docs/PR-SEQUENCING.md`.

## PRD Metadata

| Field | Value |
|-------|-------|
| Version | 3.1.0 |
| Scope Posture | Full feature (default) |
| PR Sequencing | Enabled |
| Depends on | [`mk6-migration`](../mk6-migration/README.md) (platform) **and** [`virtual-device-fleet`](file:///Users/justinrich/models/.spec/prds/virtual-device-fleet/README.md) (inference fleet — config + launcher layers; **not** the VM tier) |
| Code home | `packages/platform` (monorepo; Fulcrum is in-process, not its own package) |
| Created | 2026-07-12 |
| Last Updated | 2026-08-29 |
| Home | idea-factory `ideas/autoresearch-loop/` (strategy + MVP); holocron is the build target |

## Document Index

| File | Section | Stability |
|------|---------|-----------|
| [00-overview.md](./00-overview.md) | Product description, problem, solution, local-inference mandate | PRODUCT_CONTEXT |
| [01-scope.md](./01-scope.md) | In scope / out of scope | FEATURE_SPEC |
| [02-roles.md](./02-roles.md) | Human + system actors | PRODUCT_CONTEXT |
| [03-functional-groups.md](./03-functional-groups.md) | Functional group overview + UC summary | FEATURE_SPEC |
| [04-uc-lis.md](./04-uc-lis.md) | UC-LIS-01..05 — Local Inference Substrate | FEATURE_SPEC |
| [05-uc-cyc.md](./05-uc-cyc.md) | UC-CYC-01..06 — Cycle Loop Engine | FEATURE_SPEC |
| [06-uc-led.md](./06-uc-led.md) | UC-LED-01..06 — Evidence Ledger & Gate | FEATURE_SPEC |
| [07-uc-gate.md](./07-uc-gate.md) | UC-GATE-01..05 — Missions & Human Gate | FEATURE_SPEC |
| [08-team-contributions.md](./08-team-contributions.md) | Phase contributions | - |
| [09-technical-requirements/00-architecture-decisions.md](./09-technical-requirements/00-architecture-decisions.md) | **ADRs** — v2.0.0 re-platform: ADR-001/002 SUPERSEDED, ADR-003 AFFIRMED, ADR-004/005/006 added (Postgres ledger, local Qwen3 embedder, mission-template-not-sidecar) | CONSTITUTION |
| [09-technical-requirements/](./09-technical-requirements/README.md) | Technical specifications (folder) | CONSTITUTION |
| [10-e2e-testing-criteria.md](./10-e2e-testing-criteria.md) | Per-UC test criteria | TEST_SPEC |

## Quick Stats

| Metric | Value |
|--------|-------|
| Functional Groups | 4 |
| Use Cases | 22 |
| Test Criteria | 102+ (across 22 UCs). AC *coverage* of rows is not readiness — coverage of stale Convex oracles is not a ship signal |
| System Components | 5 — Mission Engine template, pure Gate, evidence-graph extensions, scheduler job, Markdown generator |
| Data Entities | Live evidence graph (`sources`/`passages`/`claims`/`entities`/`relations`/`beliefs`) + `mission_runs`/`mission_verdicts`/`documents` + named Fulcrum extensions (`candidates`, `belief_scores`, weight/tier versions, `touches`, `probes`) |
| Fleet roles addressed | 3 live names — `divergent`, `convergent`, `embed` (1024-dim). Optional aliases `fulcrum-assay`/`fulcrum-challenge` map 1:1. **Zero coder roles. `judge` forbidden.** |
| Serving nodes | `inference1` + `inference2` only (never the laptop) |

## Version History

| Version | Date | Changes | Trigger |
|---------|------|---------|---------|
| 3.1.0 | 2026-08-29 | **Monorepo relocation.** Repo moved to a pnpm `packages/*` workspace; `services/platform/` was `git mv`'d to `packages/platform/` (commit `e9542970`, 1487 byte-identical renames). All 984 path references across 20 PRD/task files retargeted `services/platform/` → `packages/platform/`. New **Architecture Posture stance 7** records the package boundary: Fulcrum ships *inside* `packages/platform` with no package, `package.json`, or build target of its own; `packages/docs-reader` (a Cloudflare Worker edge cache) is explicitly **not** on the Fulcrum path. Relocation only — no module boundary, import graph, runtime topology, scope, UC, or AC changed. MINOR — CONSTITUTION content added, scope untouched. | Monorepo refactor |
| 1.0.0 | 2026-07-12 | Initial PRD | New initiative |
| 1.0.1 | 2026-07-13 | Added ADRs and conformed the technical requirements after a holocron-codebase mapping pass: **ledger of record is local `bun:sqlite`** (reusing the parked Prospector core), not Convex tables; Convex is publish/search only; flagged the **Cohere 1024-dim embedding** coupling; documented reuse of holocron's research *design* (not execution). Product scope (groups/UCs/ACs) unchanged. | Architecture verification |
| 3.0.0 | 2026-08-20 | **Fleet alignment + lock alignment.** Hard dependency on the **Virtual Device Fleet** (config + launcher layers; not the VM tier). **ADR-007** — loopback fleet client, pinned to `inference1` + `inference2`. **ADR-008** — live roles `divergent` / `convergent` / `embed`; optional 1:1 aliases; **`judge` forbidden**; coder roles gone; swap-and-measure oracle with a denominator floor + kill-question→admitted-disconfirm AC. CONSTITUTION bodies (not banners) rewritten: evidence graph + named extensions (not Prospector tables); `evidence-research` seven-stage cycle (Fulcrum *builds* MAP/selector/scoring/perpetual job/briefs); MVP surface = Markdown reads + `holo fulcrum` CLI writes over `POST /api/missions/:id/verdicts` + named `ackBrief`. TR re-derive is a **hard gate before `/kb-sprint-plan`**. In-app UI is a deferred PRD, not a Fulcrum AC. AC-row coverage of stale Convex oracles is not readiness. MAJOR — CONSTITUTION + scope. | Fleet alignment + four live-repo locks |
| 2.0.0 | 2026-07-13 | **Sequenced after `mk6-migration`** and re-platformed onto the Mastra + Postgres + local-fleet platform: **ADR-001 (SQLite ledger) SUPERSEDED → Postgres append-only tables (ADR-004)**; **ADR-002 (Cohere) SUPERSEDED → local Qwen3-Embedding (ADR-005)**; **ADR-003 AFFIRMED**; **ADR-006 added** (mission template, not sidecar worker). Overview/scope reframed to "standing mission template on the mk6 platform." TR detail sections 01–09 marked `⚠️ Re-platform pending` for a follow-on re-derive. **Product scope (groups/UCs/ACs/e2e criteria) unchanged.** MAJOR bump — CONSTITUTION-layer ADRs changed. | Sequencing after mk6-migration |

## Next Steps

- **Fleet-side prerequisites (F1–F4)** — four `fleet.json` edits Fulcrum requires, recorded in [`09-technical-requirements/06-external-dependencies.md`](./09-technical-requirements/06-external-dependencies.md). **F2 is time-sensitive**: both minis serve `qwen3-embedding` today but no config declares it, so the fleet cutover would silently remove a capability Fulcrum depends on. File these into the fleet roadmap's deferred list. Not Fulcrum code.
- **TR re-derive is a hard gate before `/kb-sprint-plan`.** This pass rewrote CONSTITUTION bodies against the four live-repo locks. Do not sprint-plan from a banner. If a CONSTITUTION sentence still pretends Convex / `bun:sqlite` / Prospector tables / Exa-via-`convex/research/tools.ts` are current, stop and fix it — do not plan around it.
- `/review-red-hat .spec/prds/fulcrum` — adversarial review of this lock-aligned PRD (out-of-band).
- `/kb-sprint-plan .spec/prds/fulcrum` — **only after** the TR gate above is green **and** both `mk6-migration` and the fleet's config + launcher layers are live. Every sprint's human testing gate draws `[human-gate]` criteria from [10-e2e-testing-criteria.md](./10-e2e-testing-criteria.md).

## Provenance

This PRD is the holocron-native realization of the design developed in `idea-factory`:
`ideas/autoresearch-loop/01-plan.md` (operating manual, v1.1), `02-strategy.md` (karpathy-anchored, red-teamed — narrowed to an evidence-**triage** engine), `03-mvp.md` (MVP process/technical strategy), and the `PROSPECTOR-SYSTEM_v1.md` daemon design + `.spec/prospector/` ledger blueprints. Holocron continuation doc in the knowledge base: `js7462j2km1p736jdvq0t7scss8aekcg`. The single most important carried constraint: **scores move only via cited, admitted evidence aggregated by deterministic code — never by an LLM judge** (holocron's current `runRalphLoop` terminates on LLM-confidence, the exact reward-hackable pattern Fulcrum replaces).
