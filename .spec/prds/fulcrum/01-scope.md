---
stability: FEATURE_SPEC
last_validated: 2026-08-20
prd_version: 3.0.0
scope_posture: full
---

# Scope

**Scope Posture:** Full feature. Fulcrum is scoped as a complete, polished autoresearch-loop subsystem inside holocron — **the loops only**. Everything the MK-VI platform provides (the Postgres substrate, the Mastra workflow runtime, the retrieval tools, document storage, the app shell) and everything the Virtual Device Fleet provides (the packaged router, fleet-wide role definitions, derived backend pools, the loopback invariant, model serving on the minis) is inherited, not rebuilt.

**Hard dependencies:** Fulcrum is sequenced after **both**

1. [`mk6-migration`](../mk6-migration/README.md) — the Mastra + Postgres platform must be live; and
2. **Virtual Device Fleet** ([`~/models/.spec/prds/virtual-device-fleet/`](file:///Users/justinrich/models/.spec/prds/virtual-device-fleet/README.md)) — specifically its config + launcher layers (roadmap Sprints 01–06) plus the two deferred items *"every node answers a role with the same model"* and *"the client node can embed again."* Until those land, a Fulcrum node can silently receive a different model than it asked for — the exact defect the fleet exists to close. The **Tart VM tier is not a dependency**; it is separately gated and cancellable, and Fulcrum is insulated from its outcome.

## In Scope

### Local Inference Substrate (LIS)
- **Consumption of the fleet as an ordinary client**: one **loopback** endpoint on Fulcrum's host node, served by the fleet's packaged router pinned to `inference1` + `inference2`, replacing the cloud `claudeFlash()` factory for all Fulcrum cycle work. Fulcrum declares **no** base URL, host, port, model identifier, or device — the router, pools, endpoints, and fleet are owned by the Virtual Device Fleet.
- **Three research roles and no others** — `fulcrum-assay` (claim + verbatim-quote extraction), `fulcrum-challenge` (query planning, generation, refutation), and `qwen3-embedding` (1024-dim publish embedding). The two chat roles are guaranteed to resolve to different models, preserving cross-model challenge. **No coder role** (`reviewer`, `implementer`, `orchestrator`, `qwen-coder`, `verifier`) appears on the Fulcrum path.
- **Swap-and-measure**: the model behind a role is a fleet config edit, scored by a deterministic oracle the gate already produces — quote-check pass rate for ASSAY, refuting-claim gate-pass rate for CHALLENGE. No model ever grades a model.
- **Per-role degradation**: a role with no reachable backend produces an explicit, named error and a defined reduced mode. The loop never retries by requesting a different role, and never silently falls back to a cloud model without the operator opting in.
- Per-cycle inference **telemetry** (tokens, wall time, fleet role, and the backend that *actually served* the call, read from router headers rather than the response body) recorded on every cycle.

### Cycle Loop Engine (CYC)
- A fixed-budget cycle with six phases: **SENSE** (one novel retrieval), **GENERATE** (refine/mutate a candidate), **ASSAY** (extract claims → gate → score), **CHALLENGE** (a *different* model attempts refutation), **MAP** (niche placement / retire), **COMMIT** (one durable transaction).
- Perpetual scheduling via the **mk6 Mastra workflow runtime + platform scheduler**: the loop wakes, selects one work item, runs one cycle, sleeps. (The platform's scheduler replaces the v1.0.x Convex-cron + workflow-component design.)
- **Diverge/converge** cadence: alternate discovery cycles (new candidates in under-covered territory) with deepening cycles (more evidence on leaders, kill the weakest).
- A **work-item selector** that picks the next cycle target by rule (thinnest-evidenced leader, oldest open challenge, least-covered discovery cell), not by the operator.
- Explicit cycle **budget** (wall-clock + token caps) and circuit breakers; a budget-exceeded cycle records an explicit outcome, never a silent non-commit.
- Evolution of the existing `convex/research/` phase logic (search, synthesize, review, termination) into this engine — reusing what fits, replacing LLM-confidence termination with the evidence gate.

### Evidence Ledger & Gate (LED)
- An append-only **Postgres** evidence ledger on the mk6 substrate (reusing the Prospector v1.1 schema/logic, ADR-004): evidence objects, claims, claim↔evidence bindings, scores, lineage, cycle log.
- A deterministic **claim-admission predicate**: a claim is admitted only with ≥1 bound evidence at/above a grade floor, within a recency window, on a classified source; unknown-domain evidence keeps the claim provisional.
- **Provenance-based independence**: syndicated/near-duplicate content across domains collapses to one source; a source can't solely support two components of the same candidate; self-sourced (holocron's own prior output) evidence never counts as independent corroboration.
- Deterministic **scoring**: per component, `f = mean of top-3 admitted-claim grades` (saturating — volume can't buy score); total = Σ wᵢ·(f_supportᵢ − 2·f_refuteᵢ); disconfirmation weighted double; **absent evidence scores UNKNOWN, never "survived challenge."**
- **Versioned** scoring weights and domain-tier ladder (grading is a deterministic domain→tier lookup, never an LLM judgment); re-scoring on weight-version change.
- A **verbatim-quote entailment check**: an admitted claim's quote must be an exact substring of the fetched source (deterministic anti-fabrication guard).

### Missions & Human Gate (GATE)
- **Missions** as first-class config: a root question + fitness contract (components, weights, tier ladder, scope, source rules, discovery cells, WIP limits). Mission #1 = `dev-revenue` (development ideas with revenue potential). Adding/changing a goal is a config edit, not code.
- **Seed import**: bootstrap a mission's candidate pool from existing material.
- A **human gate**: verdicts (kill / advance / redirect / boost) that are the only path to stage advancement; kills must cite a ledger claim; `advance → validated` requires a recorded human **reality-probe** result; **WIP = 1** active build enforced.
- **Briefs and dossiers**: a daily brief (movers with the claims that moved them, ≤3 nominations, retired-with-reasons, coverage, unclassified domains, loop health) and per-candidate dossiers (full claim table, score breakdown, lineage, open kill-questions).
- **Touch mechanics**: an explicit human-acknowledgment signal that drives a degradation ceiling (no touch within the ceiling → the loop drops to sense-only). File reads never count as a touch.

## Out of Scope

- **The inference fleet itself** — the packaged router, fleet config schema, role definitions, derived backend pools, farm isolation, the loopback invariant, launcher, and per-node cutover are delivered by the **Virtual Device Fleet** PRD. Fulcrum is a *consumer*. The `fleet.json` edits Fulcrum requires (recorded in [`09-technical-requirements/06-external-dependencies.md`](./09-technical-requirements/06-external-dependencies.md)) are fleet-side work requested by this initiative, not built inside it. `[DELIVERED BY: virtual-device-fleet PRD]`
- **Choosing which physical device serves a role** — derived by the fleet from per-node capability declarations. Fulcrum names roles; the fleet decides devices.
- **The platform itself (Mastra + Postgres + Mission Engine + Qwen3 embedder)** — delivered by the predecessor [`mk6-migration`](../mk6-migration/README.md) PRD. Fulcrum inherits it; it does not build it. The v1.0.x "self-hosted Convex on the Mac minis" north star is **satisfied differently** by mk6's big-bang cutover to Mastra + Postgres (not self-hosted Convex). `[DELIVERED BY: mk6-migration PRD]`
- **A dedicated in-app Fulcrum UI** (leaderboard, lineage graph, verdict console in the React Native app). MVP surfaces are generated Markdown briefs/dossiers (in-repo + stored to holocron) plus a minimal verdict entry point. Rich UI is a follow-on. `[DEFERRED: separate PRD]`
- **Embedding-based near-duplicate provenance clustering** — MVP uses exact content-hash provenance; semantic near-dup clustering is a later hardening.
- **Verdict-calibrated automatic weight fitting** — weights are human-edited at the weekly gate in MVP; regression-fit recalibration is later.
- **The NAICS full-economy sweep at scale** — MVP ships a starter set of discovery cells sufficient to prove the blind-spot claim, not exhaustive industry coverage.
- **Reality-probe tooling** (outreach, smoke-test scaffolding) — the loop hands off *to* human-run probes; it does not conduct them.
- **Replacing holocron's on-demand research** (`startSmartResearch` for interactive user queries) — Fulcrum runs alongside it and shares infrastructure; it does not remove the interactive path.
- **Non-research missions** beyond the loop (e.g., using Fulcrum for code tasks) — the engine is mission-generic by design, but only research missions are in scope here.

## Scope Posture Note

This is one shippable initiative under the ONE-PRD-=-ONE-Project rule, **hard-sequenced after `mk6-migration`** (the platform must be live before any Fulcrum sprint starts) and internally sequenced as PRs: the ledger/gate (LED) first — the deterministic spine — then the loop engine (CYC) that commits into it, then the missions/gate surfaces (GATE). The local-inference substrate (LIS) is no longer a Fulcrum sprint; it is inherited from mk6, leaving only the research-specific role mapping + degradation + telemetry inside this initiative. If the in-app Fulcrum UI is pulled forward, it splits into its own PRD (it is now near-free, since the ledger is Zero-reactive Postgres).
