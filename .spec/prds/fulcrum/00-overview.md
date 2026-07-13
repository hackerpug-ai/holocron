---
stability: PRODUCT_CONTEXT
last_validated: 2026-07-13
prd_version: 2.0.0
---

# Fulcrum — Autonomous Research Loop

> **Sequenced after MK-VI (v2.0.0).** This initiative is a hard successor to the [MK-VI Platform Migration](../mk6-migration/README.md) (Convex → Mastra + Postgres on the mini). Fulcrum does **not** build its own inference substrate, ledger, or embedder — it plugs into the platform mk6 delivers as a standing **mission template**. The product *behavior* described below is unchanged from v1.0.1; what changes is *where it runs* (the platform, not a sidecar worker) and *what it owns* (the mission logic, not the substrate). See [ADR-004 / ADR-005 / ADR-006](./09-technical-requirements/00-architecture-decisions.md).

## Product Description

Fulcrum is holocron's **perpetual research engine**. Where holocron today runs research on demand — a user asks a question, `runRalphLoop` iterates SEARCH → SYNTHESIZE → REVIEW → REFINE for a few passes, and a report is saved — Fulcrum runs research **continuously and unattended**, against standing **missions**, on **local inference**, producing a compounding, evidence-graded body of findings that a human triages in minutes a day.

The name is load-bearing. In Rebel-intelligence tradecraft, *Fulcrum* was the codename for the covert network that delivered **vetted** intelligence to command, who decided what to act on. That is precisely this system's shape: the loop gathers and grades; the human decides. A fulcrum is also the leverage point — and Fulcrum exists to raise the probability of the operator's next high-stakes decision (mission #1: *which revenue-generating thing to build next*).

Fulcrum is the holocron-native realization of the `idea-factory/ideas/autoresearch-loop/` design, narrowed by adversarial review to an honest claim: it is an **evidence-triage engine**, not a validator. It nominates well-cited candidates; humans validate them through real-world probes.

## The Problem

1. **Holocron's research is episodic and cloud-bound.** Findings go stale the moment a session ends; nothing re-checks them, and every `generateText` call in `convex/research/` runs on a cloud model (`claudeFlash()`), metering every token and making true 24/7 operation uneconomic.
2. **The current loop terminates on an LLM's self-assessed confidence.** `runRalphLoop` stops when a model judges coverage ≥ 4 and confidence ≥ 70. This is the textbook reward-hackable pattern: the thing generating the findings also grades them, so "done" means "the model is satisfied," not "the evidence holds."
3. **Discovery is bounded by the operator's imagination.** A solo engineer's research is identity-shaped — it drifts toward what he already knows (software for engineers). The opportunities with the best revenue-to-effort ratios often sit in industries he would never think to read about (insurance, logistics, specialty trades).
4. **Owned compute sits idle.** A split-host Apple-Silicon fleet (M5 Max laptop + two Mac minis on a Tailscale tailnet) already runs local models for coding. Research — the workload most improved by *always-on, cheap, private* inference — doesn't use it at all.

## The Solution

Fulcrum adds four capabilities to holocron, and nothing else (scope is the loops only):

1. **A research-specific inference configuration on the mk6 substrate** — all research model calls route to local endpoints through the role router mk6 delivers (`divergent`/`convergent`/`judge`/`embed`/`rerank`), mapped onto locally-served models. Fulcrum contributes the *research* role mapping (divergent generation, convergent claim-extraction/challenge), the degradation policy, and per-cycle telemetry that configure the platform router for this mission — it does not rebuild the substrate. This is the initiative's defining constraint and it is satisfied by inheriting the mk6 platform.
2. **A perpetual, evidence-gated cycle engine** — a fixed-budget cycle (SENSE → GENERATE → ASSAY → CHALLENGE → MAP → COMMIT) that evolves the existing `convex/research/` loop, alternates divergent discovery with convergent deepening, and runs unattended on a schedule.
3. **An evidence ledger and deterministic gate** — the anti-reward-hacking core. Claims enter the ledger only with cited, independent, recency-checked evidence; scores are computed by code (top-3-grade mean, disconfirmation weighted double, syndication deduped, sparsity scored as UNKNOWN). This **replaces** the LLM-confidence termination with a metric the model cannot narrate its way past.
4. **Missions and a human gate** — standing research goals (starting with *development ideas with revenue potential*) that the operator steers by editing one contract, plus a daily brief, per-candidate dossiers with full evidence chains, and verdicts (kill / advance / redirect / boost) that are the only way a candidate advances.

## Sequencing on the MK-VI platform (why this is a holocron mission template, not an idea-factory script)

The idea-factory MVP imagined a standalone Bun CLI. Fulcrum was first drawn into holocron (v1.0.x) because holocron already owned the durable store, the retrieval tools, the MCP server, and the app surface — and because the one thing holocron lacked was an evidence-gated loop running on local inference. That v1.0.x design hit a hard wall: **Convex actions run in a cloud runtime that cannot reach tailnet-local inference**, so Fulcrum worked around it with a separate tailnet-resident worker, a local `bun:sqlite` ledger, and Cohere embeddings for publish (the retired ADR-001 / ADR-002).

The MK-VI Platform Migration removes that wall. mk6 moves the entire backend onto the mini — Mastra (Bun) + Postgres, co-located with the local inference fleet, the RN app resyncing via Zero. With the backend running *where the inference runs*, the workaround collapses: no cloud runtime to escape, no sidecar worker, no split ledger, no cloud embedder. Fulcrum becomes a **standing mission template** on the platform's Mission Engine — the generalized `SENSE→GENERATE→ASSAY→CHALLENGE→MAP→COMMIT` cycle mk6 delivers — owning only its *mission logic* (the research role mapping, the evidence gate, the scoring, the missions, the human gate). What holocron's MK-VI platform provides and Fulcrum inherits: the durable Postgres ledger substrate, the local role router, the local Qwen3 embedder, the Mastra workflow runtime, the Zero-reactive app surface. The previously-deferred in-app Fulcrum UI becomes near-free, because the ledger is now Zero-reactive Postgres rather than a mirrored SQLite sidecar.

This is why Fulcrum is **sequenced after, not parallel to, mk6**: it cannot be built until the platform exists. The v1.0.x PRD's north star ("self-hosted Convex on the Mac minis so the publish hop becomes local") is delivered — differently — by mk6's big-bang cutover to Mastra + Postgres.
