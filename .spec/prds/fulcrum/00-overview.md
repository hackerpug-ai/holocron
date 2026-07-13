---
stability: PRODUCT_CONTEXT
last_validated: 2026-07-12
prd_version: 1.0.0
---

# Fulcrum — Autonomous Research Loop

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

1. **A local-inference substrate** — all research model calls route to local endpoints through an OpenAI-compatible provider: in **dev**, the laptop's LiteLLM router; in **production**, the Mac minis on the tailnet. This is the initiative's defining constraint and its first sprint. It directly advances the standing goal of *migrating holocron's research off cloud models onto owned Apple-Silicon inference*.
2. **A perpetual, evidence-gated cycle engine** — a fixed-budget cycle (SENSE → GENERATE → ASSAY → CHALLENGE → MAP → COMMIT) that evolves the existing `convex/research/` loop, alternates divergent discovery with convergent deepening, and runs unattended on a schedule.
3. **An evidence ledger and deterministic gate** — the anti-reward-hacking core. Claims enter the ledger only with cited, independent, recency-checked evidence; scores are computed by code (top-3-grade mean, disconfirmation weighted double, syndication deduped, sparsity scored as UNKNOWN). This **replaces** the LLM-confidence termination with a metric the model cannot narrate its way past.
4. **Missions and a human gate** — standing research goals (starting with *development ideas with revenue potential*) that the operator steers by editing one contract, plus a daily brief, per-candidate dossiers with full evidence chains, and verdicts (kill / advance / redirect / boost) that are the only way a candidate advances.

## The Local-Inference Mandate (why this is a holocron initiative, not an idea-factory script)

The idea-factory MVP imagined a standalone Bun CLI. Building Fulcrum **in holocron** is a deliberate choice: holocron already owns the durable store (Convex tables for `deepResearchSessions`, `documents`), the retrieval tools (Exa/Jina via the AI SDK), the MCP server, and the app surface. What holocron lacks — and what this initiative delivers — is (a) the evidence-gated loop and (b) **local inference for all research**. The architectural crux is that Convex actions run in a cloud runtime that **cannot reach tailnet-local inference**; Fulcrum resolves this with a tailnet-resident inference worker in dev, on the explicit path toward self-hosted Convex on the Mac minis in production — the concrete meaning of "migrate holocron to the minis and run all research locally."
