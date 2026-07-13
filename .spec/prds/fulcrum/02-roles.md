---
stability: PRODUCT_CONTEXT
last_validated: 2026-07-12
prd_version: 1.0.0
---

# Roles

Fulcrum has one human role and four system actors. The design principle is a hard line between them: **the human sets the frame and holds the gate; the system runs the loop below.**

| Role | Type | Responsibilities |
|------|------|------------------|
| **Operator** | Human (Justin) | Authors and edits missions (the fitness contract + `PROGRAM`); reads the daily brief; issues verdicts (kill / advance / redirect / boost); runs real-world reality probes on advanced candidates; performs the weekly gate (adjust weights, tier unclassified domains, check diverge/converge balance). The *only* actor that can advance a candidate's stage or promote it to validated. |
| **Loop Engine** | System | Selects the next work item by rule; runs the fixed-budget cycle (SENSE→GENERATE→ASSAY→CHALLENGE→MAP→COMMIT); alternates diverge/converge; respects budgets and circuit breakers; drops to sense-only when the degradation ceiling trips. Proposes candidates; never certifies them. |
| **Evidence Gate** | System (deterministic) | The non-agentic core. Grades evidence by domain-tier × recency; runs the claim-admission predicate; enforces provenance independence and the verbatim-quote check; computes scores from admitted claims only. Contains no LLM call — everything here is code that produces the same output for the same ledger. |
| **Inference Fleet** | System | Serves the two research model roles on local Apple-Silicon hardware — the laptop's LiteLLM router in dev, the Mac minis in production — behind an OpenAI-compatible endpoint. Reports health; the loop reads its state to decide normal vs degraded operation. |
| **Challenger** | System (a distinct model instance) | The adversarial role inside CHALLENGE. Runs on a *different* model than ASSAY's extractor (e.g., extraction on the convergent/precise model, refutation on the divergent model) so the critic does not share the extractor's blind spots. Produces refuting claims (which pass the same gate) and the next cycle's kill-question; it never scores. |

## Role Boundaries (the invariants)

- **Only the Operator advances stages.** The Loop Engine can create, deepen, and *retire* candidates autonomously, but `contender → validated` is human-only and requires a reality-probe result. (Autonomous *retirement* is symmetric-visible: every kill appears in the brief with its cited reason, so the Operator can catch a wrong retirement.)
- **The Evidence Gate never calls a model, and the Loop Engine never computes a score.** This is the probabilistic/deterministic seam: agents produce claims and narratives; code decides what is admitted and what it's worth.
- **ASSAY and Challenger must be different models.** Enforced by config, not convention.
- **The Inference Fleet is never silently bypassed.** If it's unreachable, the system degrades visibly; a cloud fallback for research requires an explicit Operator opt-in.
