---
stability: FEATURE_SPEC
last_validated: 2026-08-20
prd_version: 3.0.0
scope_posture: full
---

# Scope

**Scope Posture:** Full feature. Fulcrum is scoped as a complete, polished autoresearch-loop subsystem inside holocron — **the loops only**. Everything the MK-VI platform provides (the Postgres evidence graph, the Mastra workflow runtime, the named registry tools, `documents` storage, `POST /api/missions/:id/verdicts`, `publishDocumentForRun`) and everything the Virtual Device Fleet provides (the packaged router, fleet-wide role definitions, derived backend pools, the loopback invariant, model serving on the minis) is inherited, not rebuilt.

**Hard dependencies:** Fulcrum is sequenced after **both**

1. [`mk6-migration`](../mk6-migration/README.md) — the Mastra + Postgres platform must be live; and
2. **Virtual Device Fleet** ([`~/models/.spec/prds/virtual-device-fleet/`](file:///Users/justinrich/models/.spec/prds/virtual-device-fleet/README.md)) — specifically its config + launcher layers (roadmap Sprints 01–06) plus the two deferred items *"every node answers a role with the same model"* and *"the client node can embed again."* Until those land, a Fulcrum node can silently receive a different model than it asked for — the exact defect the fleet exists to close. The **Tart VM tier is not a dependency**; it is separately gated and cancellable, and Fulcrum is insulated from its outcome.

**TR re-derive is a hard gate before `/kb-sprint-plan`.** CONSTITUTION bodies in `09-technical-requirements/` must match the four locks (evidence graph, live role names, live seven-stage cycle, CLI+Markdown MVP) before sprints are planned.

## In Scope

### Local Inference Substrate (LIS)

LIS config lands **alongside LED**. There is no "LIS ships first" sprint.

- **Consumption of the fleet as an ordinary client**: one **loopback** endpoint on Fulcrum's host node, served by the fleet's packaged router pinned to `inference1` + `inference2`. Fulcrum declares **no** base URL, host, port, model identifier, or device.
- **Three live roles and no others** — `divergent` (ASSAY / extract), `convergent` (SENSE-plan / GENERATE / CHALLENGE), `embed` (1024-dim). Optional `fleet.json` aliases `fulcrum-assay` / `fulcrum-challenge` map 1:1. **`judge` is forbidden.** No coder role (`reviewer`, `implementer`, `orchestrator`, `qwen-coder`, `verifier`) appears on the Fulcrum path.
- **Swap-and-measure**: the model behind a role is a fleet config edit, scored by a deterministic oracle — quote-check pass rate for ASSAY over a **held-out source pack with a minimum claim-attempt floor**, refuting-claim gate-pass rate for CHALLENGE, and whether a queued kill-question later yields an **admitted** disconfirm. A 1/1 pass rate is not a measurement. No model ever grades a model.
- **Per-role degradation**: a role with no reachable backend produces an explicit, named error and a defined reduced mode. The loop never retries by requesting a different role (including `judge`), and never silently falls back to a cloud model without the operator opting in.
- Per-cycle inference **telemetry** (tokens, wall time, fleet role, and the backend that *actually served* the call, read from router headers rather than the response body) recorded on every `mission_runs` / `mission_stage_runs` row.

### Cycle Loop Engine (CYC)

Live stage graph (inherited, `evidence-research`): `plan → retrieve → extract → assay → challenge → gate → commit`. Fulcrum maps product names onto those ids and **adds** two stages:

| Fulcrum name | Live stage | Action |
|--------------|------------|--------|
| SENSE | `plan` + `retrieve` | Keep. Retrieval uses named Mastra registry tools against the **corpus**, not Exa/Jina via `convex/research/tools.ts`. |
| GENERATE | *(missing)* | **New stage**, typed I/O, `convergent`. |
| ASSAY | `extract` + `assay` | **Extract only** (agent, `divergent`). Admit + score stay in LED — not a Mastra agent tool. |
| CHALLENGE | `challenge` | Keep (`convergent`). |
| MAP | *(missing)* | **New stage**, typed I/O (niche assignment / retire). |
| COMMIT | `gate` + `commit` | Gate is LED code; commit is the Postgres transaction. |

Also in scope:

- Perpetual scheduling via a **`MIGRATED_JOBS` row `fulcrum:cycle`** that dispatches `mission:execute`, cadence from the mission contract (default `interval 15m`), lease owner = `scheduler-worker` via `mission_runs.lease_owner`, interacting with the daily budget.
- **Diverge/converge** cadence: alternate discovery cycles with deepening cycles.
- A **work-item selector** (pure Postgres query; not `convex/fulcrum/selector.ts`).
- Explicit cycle **budget** (wall-clock + token caps) and circuit breakers; a budget-exceeded cycle records `mission_runs.status='budget_exceeded'`.

ADR-003: mine holocron's research **design**, re-implement on Mastra. Evolving `convex/research/` as an execution plan is **out**.

### Evidence Ledger & Gate (LED)

- Extend the live Postgres evidence graph (`sources`, `passages`, `claims`, `entities`, `relations`, `beliefs`) with named Drizzle tables/columns: `candidates`, `belief_scores` (stamps `domain_tier_version`), `weight_versions` / `weight_components`, `domain_tier_versions` / `domain_tiers`, `touches`, `probes`, `claim_evidence_bindings`. Cycle log = `mission_runs`.
- A deterministic **claim-admission predicate** (LED **code**, not an agent): a claim is admitted only with ≥1 bound evidence at/above a grade floor, within a recency window, on a classified source, with `quote_text` ⊆ `sources.normalized_text`.
- **Provenance-based independence**; self-sourced never corroborates.
- Deterministic **scoring** into `belief_scores`; absent evidence scores UNKNOWN.
- **Versioned** scoring weights and domain-tier ladder; re-scoring on weight-version change.
- Invariant: **no `generateText` / no fleet role inside gate or score modules.**

### Missions & Human Gate (GATE)

- **Missions** as first-class config. Mission #1 = `dev-revenue`.
- **Seed import** into `candidates`.
- **Human gate via named CLI**: `holo fulcrum verdict` wrapping `POST /api/missions/:id/verdicts` for kill/advance/redirect/boost; kills must cite a ledger claim; `advance → validated` requires a recorded `probes` row; **WIP = 1**. Reality-probe **recording** is in scope; probe tooling is out.
- **`ackBrief`**: `holo fulcrum ack-brief` → `POST /api/missions/:id/touches` writing a `touches` row. File reads never count as a touch.
- **Briefs and dossiers** as generated Markdown (in-repo + `publishDocumentForRun`). Daily brief includes a section titled **Loop health**.

## MVP operator surface (the only surface)

| Direction | Surface |
|-----------|---------|
| Read | `.holocron/fulcrum/briefs/{YYYY-MM-DD}.md`; `.holocron/fulcrum/dossiers/{candidateId}.md`; `holo fulcrum brief`; `holo fulcrum dossier <id>`; `documents` rows from `publishDocumentForRun` |
| Write | `holo fulcrum '<goal>'` (existing on-demand alias); `holo fulcrum verdict <runId> <kill\|advance\|redirect\|boost>`; `holo fulcrum ack-brief <runId> <briefId>`; `holo fulcrum probe <candidateId>` |
| Health | Daily brief, section **Loop health** |

No RN screens. No "navigates." No unnamed "minimal verdict entry point."

## Out of Scope

- **The inference fleet itself** — delivered by the **Virtual Device Fleet** PRD. The `fleet.json` edits Fulcrum requires (F1–F4 in [`09-technical-requirements/06-external-dependencies.md`](./09-technical-requirements/06-external-dependencies.md)) are fleet-side work requested by this initiative, not built inside it. `[DELIVERED BY: virtual-device-fleet PRD]`
- **Choosing which physical device serves a role** — derived by the fleet from per-node capability declarations.
- **The platform itself (Mastra + Postgres + Mission Engine + Qwen3 embedder + evidence graph + `POST /api/missions/:id/verdicts` + `publishDocumentForRun`)** — delivered by [`mk6-migration`](../mk6-migration/README.md). Fulcrum inherits it. The v1.0.x "self-hosted Convex on the Mac minis" north star is **not** current topology. `[DELIVERED BY: mk6-migration PRD]`
- **A dedicated in-app Fulcrum UI** (leaderboard, lineage graph, verdict console in the React Native app). Rich UI is a follow-on. **Not a Fulcrum AC.** `[DEFERRED: separate PRD]`
- **Outbound live-web retrieval (Exa/Jina)** — no such registry tool exists. SENSE is corpus-only. Inventing an outbound tool is platform work.
- **Porting Prospector tables** (`prospects`, `cycles`, `scores`, `fulcrumCycles`) as a second schema.
- **Embedding-based near-duplicate provenance clustering** — MVP uses exact content-hash provenance.
- **Verdict-calibrated automatic weight fitting** — weights are human-edited at the weekly gate in MVP.
- **The NAICS full-economy sweep at scale.**
- **Reality-probe tooling** (outreach, smoke-test scaffolding) — recording the result is in; conducting the probe is out.
- **Replacing holocron's on-demand research** — the `research` alias of `evidence-research` stays.
- **Non-research missions** beyond the loop.

## Scope Posture Note

This is one shippable initiative under the ONE-PRD-=-ONE-Project rule, **hard-sequenced after `mk6-migration`**, internally sequenced as **LED → CYC → GATE**, with LIS config alongside LED. If the in-app Fulcrum UI is pulled forward, it splits into its own PRD. That split is **not** "near-free" work inside this initiative.
