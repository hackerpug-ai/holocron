---
stability: PRODUCT_CONTEXT
last_validated: 2026-08-20
prd_version: 3.0.0
---

# Roles

Fulcrum has one human role and four system actors. The design principle is a hard line between them: **the human sets the frame and holds the gate; the system runs the loop below.**

| Role | Type | Responsibilities |
|------|------|------------------|
| **Operator** | Human (Justin) | Authors and edits missions (the fitness contract + `PROGRAM`); reads the daily brief; issues verdicts (kill / advance / redirect / boost); runs real-world reality probes on advanced candidates; performs the weekly gate (adjust weights, tier unclassified domains, check diverge/converge balance). The *only* actor that can advance a candidate's stage or promote it to validated. |
| **Loop Engine** | System | Selects the next work item by rule; runs the fixed-budget cycle (SENSE→GENERATE→ASSAY→CHALLENGE→MAP→COMMIT); alternates diverge/converge; respects budgets and circuit breakers; drops to sense-only when the degradation ceiling trips. Proposes candidates; never certifies them. |
| **Evidence Gate** | System (deterministic) | The non-agentic core. Grades evidence by domain-tier × recency; runs the claim-admission predicate; enforces provenance independence and the verbatim-quote check; computes scores from admitted claims only. Contains no LLM call — everything here is code that produces the same output for the same ledger. |
| **Inference Fleet** | System (external — owned by the Virtual Device Fleet) | Serves Fulcrum's three roles — `fulcrum-assay`, `fulcrum-challenge`, `qwen3-embedding` — on `inference1` and `inference2`, reached through the packaged router on **loopback**. Owns node health, mini-to-mini failover, and cooldown. Fulcrum consumes it as a client and never configures an endpoint, model, or device (ADR-007). |
| **Challenger** | System (a distinct fleet role) | The adversarial role inside CHALLENGE. Resolves `fulcrum-challenge`, which is guaranteed to serve a *different* model than `fulcrum-assay`, so the critic does not share the extractor's blind spots. Produces refuting claims (which pass the same gate) and the next cycle's kill-question; it never scores. |

## Role Boundaries (the invariants)

- **Only the Operator advances stages.** The Loop Engine can create, deepen, and *retire* candidates autonomously, but `contender → validated` is human-only and requires a reality-probe result. (Autonomous *retirement* is symmetric-visible: every kill appears in the brief with its cited reason, so the Operator can catch a wrong retirement.)
- **The Evidence Gate never calls a model, and the Loop Engine never computes a score.** This is the probabilistic/deterministic seam: agents produce claims and narratives; code decides what is admitted and what it's worth.
- **ASSAY and Challenger must be different models.** Enforced by two distinct fleet roles whose bindings are fleet-wide config, and verified per cycle against the model each call *actually resolved to* — not against the role names alone.
- **The Inference Fleet is never silently bypassed, and never silently swapped.** If a role has no reachable backend the system degrades visibly and names the role; it never retries by requesting a different role, and a cloud fallback for research requires an explicit Operator opt-in.
- **Fulcrum's model vocabulary is research + embedding only.** No coder role appears on the Fulcrum path (ADR-008).
