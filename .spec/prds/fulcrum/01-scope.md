---
stability: FEATURE_SPEC
last_validated: 2026-07-13
prd_version: 2.0.0
scope_posture: full
---

# Scope

**Scope Posture:** Full feature. Fulcrum is scoped as a complete, polished autoresearch-loop subsystem inside holocron — **the loops only**. Everything the MK-VI platform provides (the Postgres substrate, the local role router, the local Qwen3 embedder, the Mastra workflow runtime, the retrieval tools, document storage, the app shell) is inherited, not rebuilt. **Hard dependency:** Fulcrum is sequenced after [`mk6-migration`](../mk6-migration/README.md) and presumes that platform is live.

## In Scope

### Local Inference Substrate (LIS)
- A research-specific **role configuration on the mk6 role router** (`divergent`/`convergent`/`judge`/`embed`/`rerank`) that points Fulcrum's cycle LLM calls at **local** endpoints (the fleet's LiteLLM router / `llama-server`), replacing the cloud `claudeFlash()` factory for all Fulcrum cycle work. The router, endpoints, and fleet are owned by mk6; Fulcrum contributes the research role mapping + the per-mission config.
- Two research model **roles** — divergent (fast generation, query planning) and convergent (precise claim extraction, scoring, challenge) — mapped onto locally-served models, with the mapping declared in config, not hardcoded.
- **Degradation**: when the fleet (or a mini) is unreachable, the loop drops to a defined reduced mode and surfaces it — never silently falls back to a cloud model without the operator opting in.
- Per-cycle inference **telemetry** (tokens, wall time, endpoint, model role) recorded on every cycle.

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

- **The platform itself (Mastra + Postgres + local fleet + role router + Qwen3 embedder)** — delivered by the predecessor [`mk6-migration`](../mk6-migration/README.md) PRD. Fulcrum inherits it; it does not build it. The v1.0.x "self-hosted Convex on the Mac minis" north star is **satisfied differently** by mk6's big-bang cutover to Mastra + Postgres (not self-hosted Convex). `[DELIVERED BY: mk6-migration PRD]`
- **A dedicated in-app Fulcrum UI** (leaderboard, lineage graph, verdict console in the React Native app). MVP surfaces are generated Markdown briefs/dossiers (in-repo + stored to holocron) plus a minimal verdict entry point. Rich UI is a follow-on. `[DEFERRED: separate PRD]`
- **Embedding-based near-duplicate provenance clustering** — MVP uses exact content-hash provenance; semantic near-dup clustering is a later hardening.
- **Verdict-calibrated automatic weight fitting** — weights are human-edited at the weekly gate in MVP; regression-fit recalibration is later.
- **The NAICS full-economy sweep at scale** — MVP ships a starter set of discovery cells sufficient to prove the blind-spot claim, not exhaustive industry coverage.
- **Reality-probe tooling** (outreach, smoke-test scaffolding) — the loop hands off *to* human-run probes; it does not conduct them.
- **Replacing holocron's on-demand research** (`startSmartResearch` for interactive user queries) — Fulcrum runs alongside it and shares infrastructure; it does not remove the interactive path.
- **Non-research missions** beyond the loop (e.g., using Fulcrum for code tasks) — the engine is mission-generic by design, but only research missions are in scope here.

## Scope Posture Note

This is one shippable initiative under the ONE-PRD-=-ONE-Project rule, **hard-sequenced after `mk6-migration`** (the platform must be live before any Fulcrum sprint starts) and internally sequenced as PRs: the ledger/gate (LED) first — the deterministic spine — then the loop engine (CYC) that commits into it, then the missions/gate surfaces (GATE). The local-inference substrate (LIS) is no longer a Fulcrum sprint; it is inherited from mk6, leaving only the research-specific role mapping + degradation + telemetry inside this initiative. If the in-app Fulcrum UI is pulled forward, it splits into its own PRD (it is now near-free, since the ledger is Zero-reactive Postgres).
