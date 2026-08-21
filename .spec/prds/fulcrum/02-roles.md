---
stability: PRODUCT_CONTEXT
last_validated: 2026-08-20
prd_version: 3.0.0
---

# Roles

Fulcrum has one human role and four system actors. The design principle is a hard line between them: **the human sets the frame and holds the gate; the system runs the loop below.**

| Role | Type | Responsibilities |
|------|------|------------------|
| **Operator** | Human (Justin) | Authors and edits missions (the fitness contract + `PROGRAM`); reads the daily brief (including the **Loop health** section); issues verdicts via `holo fulcrum verdict` (kill / advance / redirect / boost); records reality probes via `holo fulcrum probe`; acks the brief via `holo fulcrum ack-brief`; performs the weekly gate (adjust weights, tier unclassified domains, check diverge/converge balance). The *only* actor that can advance a candidate's stage or promote it to validated. |
| **Loop Engine** | System | Selects the next work item by rule; runs the live seven-stage graph plus GENERATE and MAP; alternates diverge/converge; respects budgets and circuit breakers; drops to sense-only when the degradation ceiling trips. Proposes candidates; never certifies them. |
| **Evidence Gate** | System (deterministic) | The non-agentic core. Grades evidence by domain-tier × recency; runs the claim-admission predicate; enforces provenance independence and the verbatim-quote check against fetch-artifact `normalizedText`; computes `belief_scores` from admitted claims only. **Contains no `generateText` and no fleet role** — everything here is code that produces the same output for the same ledger. |
| **Inference Fleet** | System (external — owned by the Virtual Device Fleet) | Serves Fulcrum's three live roles — `divergent`, `convergent`, `embed` — on `inference1` and `inference2`, reached through the packaged router on **loopback**. Owns node health, mini-to-mini failover, and cooldown. Fulcrum consumes it as a client and never configures an endpoint, model, or device (ADR-007). **`judge` is never requested.** |
| **Challenger** | System (fleet role `convergent`, optional alias `fulcrum-challenge`) | The adversarial role inside CHALLENGE. Resolves `convergent`, which is guaranteed to serve a *different* model than `divergent` (ASSAY / extract; optional alias `fulcrum-assay`), so the critic does not share the extractor's blind spots. Produces refuting claims (which pass the same gate) and the next cycle's kill-question; it never scores. |

## Role Boundaries (the invariants)

- **Only the Operator advances stages.** The Loop Engine can create, deepen, and *retire* candidates autonomously, but `contender → validated` is human-only and requires a reality-probe result recorded as a `probes` row. (Autonomous *retirement* is symmetric-visible: every kill appears in the brief with its cited reason.)
- **The Evidence Gate never calls a model, and the Loop Engine never computes a score.** Agents produce claims and narratives; code decides what is admitted and what it's worth. **No `generateText` / no fleet role inside gate or score modules.** Reviewer greps both.
- **ASSAY (`divergent`) and Challenger (`convergent`) must be different models.** Enforced by two distinct live fleet roles, and verified per cycle against the model each call *actually resolved to* — not against the role names alone. Optional aliases map 1:1; they are not a third vocabulary.
- **The Inference Fleet is never silently bypassed, and never silently swapped.** If a role has no reachable backend the system degrades visibly and names the role; it never retries by requesting a different role (including `judge`), and a cloud fallback for research requires an explicit Operator opt-in.
- **Fulcrum's model vocabulary is `divergent` / `convergent` / `embed` only.** No coder role appears on the Fulcrum path (ADR-008). **`judge` never appears on the Fulcrum path**, the same way coder roles never appear.
