---
stability: FEATURE_SPEC
last_validated: 2026-07-12
prd_version: 1.0.0
scope_posture: full
---

# Scope

**Scope Posture:** Full feature. Fulcrum is scoped as a complete, polished autoresearch-loop subsystem inside holocron — **the loops only**. Everything holocron already provides (retrieval tools, document storage, embeddings, the app shell) is reused, not rebuilt.

## In Scope

### Local Inference Substrate (LIS)
- An OpenAI-compatible model provider that points research LLM calls at **local** endpoints (LiteLLM router / LM Studio / Mac-mini `llama-server`), replacing the cloud `claudeFlash()` factory for all Fulcrum cycle work.
- Two research model **roles** — divergent (fast generation, query planning) and convergent (precise claim extraction, scoring, challenge) — mapped onto locally-served models, with the mapping declared in config, not hardcoded.
- The **tailnet reachability** architecture: a tailnet-resident inference worker that Convex dispatches cycle work to (dev = laptop; prod = Mac mini), because Convex's own runtime cannot reach local endpoints.
- **Degradation**: when the fleet (or a mini) is unreachable, the loop drops to a defined reduced mode and surfaces it — never silently falls back to a cloud model without the operator opting in.
- Per-cycle inference **telemetry** (tokens, wall time, endpoint, model role) recorded on every cycle.

### Cycle Loop Engine (CYC)
- A fixed-budget cycle with six phases: **SENSE** (one novel retrieval), **GENERATE** (refine/mutate a candidate), **ASSAY** (extract claims → gate → score), **CHALLENGE** (a *different* model attempts refutation), **MAP** (niche placement / retire), **COMMIT** (one durable transaction).
- Perpetual scheduling via Convex crons + the workflow component: the loop wakes, selects one work item, runs one cycle, sleeps.
- **Diverge/converge** cadence: alternate discovery cycles (new candidates in under-covered territory) with deepening cycles (more evidence on leaders, kill the weakest).
- A **work-item selector** that picks the next cycle target by rule (thinnest-evidenced leader, oldest open challenge, least-covered discovery cell), not by the operator.
- Explicit cycle **budget** (wall-clock + token caps) and circuit breakers; a budget-exceeded cycle records an explicit outcome, never a silent non-commit.
- Evolution of the existing `convex/research/` phase logic (search, synthesize, review, termination) into this engine — reusing what fits, replacing LLM-confidence termination with the evidence gate.

### Evidence Ledger & Gate (LED)
- A local `bun:sqlite` **append-only evidence ledger** (reusing the parked Prospector core, ADR-001): evidence objects, claims, claim↔evidence bindings, scores, lineage, cycle log.
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

- **Self-hosted Convex on the Mac minis** — the production north star for "all research local," but a separate infrastructure initiative. Fulcrum is designed to move onto it without redesign; the dev/MVP runs the tailnet worker against cloud-hosted Convex. `[DEFERRED: separate PRD]`
- **A dedicated in-app Fulcrum UI** (leaderboard, lineage graph, verdict console in the React Native app). MVP surfaces are generated Markdown briefs/dossiers (in-repo + stored to holocron) plus a minimal verdict entry point. Rich UI is a follow-on. `[DEFERRED: separate PRD]`
- **Embedding-based near-duplicate provenance clustering** — MVP uses exact content-hash provenance; semantic near-dup clustering is a later hardening.
- **Verdict-calibrated automatic weight fitting** — weights are human-edited at the weekly gate in MVP; regression-fit recalibration is later.
- **The NAICS full-economy sweep at scale** — MVP ships a starter set of discovery cells sufficient to prove the blind-spot claim, not exhaustive industry coverage.
- **Reality-probe tooling** (outreach, smoke-test scaffolding) — the loop hands off *to* human-run probes; it does not conduct them.
- **Replacing holocron's on-demand research** (`startSmartResearch` for interactive user queries) — Fulcrum runs alongside it and shares infrastructure; it does not remove the interactive path.
- **Non-research missions** beyond the loop (e.g., using Fulcrum for code tasks) — the engine is mission-generic by design, but only research missions are in scope here.

## Scope Posture Note

This is one shippable initiative under the ONE-PRD-=-ONE-Project rule, sequenced as PRs (local inference first, then the ledger/gate, then the loop engine, then missions/gate surfaces). If the self-hosted-Convex migration or the in-app UI is pulled forward, each splits into its own PRD.
