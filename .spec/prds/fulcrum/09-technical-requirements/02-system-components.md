---
stability: CONSTITUTION
last_validated: 2026-07-12
prd_version: 1.0.0
---

# System Components

| # | Component | Runtime | Role | Evolves / New |
|---|-----------|---------|------|---------------|
| 1 | **Local Inference Provider** | Worker (tailnet) | OpenAI-compatible AI SDK provider (`@ai-sdk/openai` `createOpenAI({ baseURL })`) targeting the LiteLLM router / `llama-server`; resolves role→model; enforces ASSAY≠CHALLENGE | New (`fulcrum/inference`) |
| 2 | **Fulcrum Worker** | Bun process, tailnet-resident (dev: laptop; prod: mini) | Pulls dispatched cycle work, runs the inference-bearing phases against local endpoints, calls the Gate, commits results via the Convex client; reports fleet health | New (sibling to / extension of `holocron-mcp`) |
| 3 | **Cycle Orchestrator** | Convex (actions + workflow) | Drives one cycle through SENSE→GENERATE→ASSAY→CHALLENGE→MAP→COMMIT; coordinates worker dispatch and Gate calls; enforces per-cycle budget | Evolves `convex/research/dispatcher.ts` + `scheduled.ts` |
| 4 | **Work-Item Selector** | Convex (query, deterministic) | Chooses the next cycle target by the expected-value rule over ledger state; enforces the challenge-starvation floor | New (`convex/fulcrum/selector.ts`) |
| 5 | **Evidence Gate** | Pure TS module (callable from worker + Convex) | Grading, admission predicate, provenance independence, verbatim-quote check, saturating disconfirmation-weighted scoring; **no model calls** | New (`convex/fulcrum/gate/`); replaces `termination.ts` LLM-confidence exit |
| 6 | **Evidence Ledger** | Convex (tables + append-only mutations) | Durable, append-only storage for evidence, claims, bindings, scores, lineage, cycles, verdicts, touches; idempotent commit | New tables; findings publish into existing `documents` |
| 7 | **Mission Registry** | Convex (tables + queries) | Versioned mission contracts (components, weights, tier ladder, scope, source rules, cells, cadence, WIP, ceiling); seed import | New (`convex/fulcrum/missions.ts`) |
| 8 | **Scheduler & Breakers** | Convex (crons + workflow + state) | Wakes the loop on cadence, holds daily budget + circuit-breaker + degradation-ceiling state, drops to sense-only on ceiling trip | Evolves `convex/crons.ts` + the whatsNew workflow pattern |
| 9 | **Brief/Dossier Generator** | Convex (query/action) → Markdown | Renders the daily brief and per-candidate dossiers deterministically from the ledger; stores to `documents` + writes repo Markdown | New (`convex/fulcrum/reports.ts`) |

*(Nine components; the Gate and Ledger are the deterministic spine, the Worker and Provider are the local-inference substrate, the rest orchestrate and surface.)*

## Component Interactions (happy path, one cycle)

1. **Scheduler** fires → **Work-Item Selector** returns the next target → **Cycle Orchestrator** enqueues a cycle for the **Worker**.
2. **Worker** runs SENSE (plan query on divergent model, fetch via holocron retrieval tools), GENERATE (divergent), extracts claims in ASSAY (convergent), then hands claims + fetched sources to the **Evidence Gate**.
3. **Gate** grades, checks quotes, runs admission + provenance, computes the score — deterministically, no model.
4. **Worker** runs CHALLENGE on the *other* model, submits refuting claims back through the **Gate**, emits the next kill-question.
5. **Cycle Orchestrator** performs MAP (niche placement) and COMMIT — one idempotent, append-only transaction into the **Evidence Ledger** (evidence, claims, score, lineage, cycle-log row with telemetry).
6. **Brief/Dossier Generator** reflects the change on next brief generation; **Scheduler** updates budget/breaker state.

## The reachability boundary (the one hard interaction)

The **Worker↔Convex** boundary is the crux. The Worker lives on the tailnet (can reach local inference); Convex holds durable truth (can't reach local inference). Work flows Convex→Worker via a durable dispatch (a `fulcrumWorkQueue` row the worker leases, or a Convex→worker trigger), and results flow Worker→Convex via the Convex client under an idempotency key. This is exactly the seam that self-hosted-Convex-on-mini later removes.
