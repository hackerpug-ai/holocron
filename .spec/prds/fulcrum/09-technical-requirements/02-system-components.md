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
| 5 | **Evidence Gate** | Pure TS module (in the worker) | Grading, admission predicate, provenance independence, verbatim-quote check, saturating disconfirmation-weighted scoring; **no model calls** | Reused from Prospector (`gate/`); replaces the LLM-confidence exit |
| 6 | **Evidence Ledger** | **Local `bun:sqlite`** (in the worker) | Durable, append-only ledger (evidence, claims, bindings, scores, lineage, cycles, verdicts, touches); idempotent commit; kill-9 all-or-nothing (ADR-001) | **Reused from Prospector** — branch `task/prospector-schema`, 31/37 ACs green |
| 7 | **Mission Registry** | Local SQLite (`missions*` tables) | Versioned mission contracts (components, weights, tier ladder, scope, source rules, cells, cadence, WIP, ceiling); seed import | Reused from Prospector |
| 8 | **Scheduler & Breakers** | The worker's own loop (local) | Wakes on cadence, holds daily budget + circuit-breaker + degradation-ceiling state, drops to sense-only on ceiling trip; an optional Convex cron can also nudge the worker | New (in the worker); does NOT rely on Convex's durable-workflow layer (barely adopted in holocron) |
| 9 | **Brief/Dossier Generator + Holocron Publisher** | Worker → Markdown + Convex client | Renders brief/dossiers deterministically from the local ledger to Markdown; publishes findings to Convex `documents` via `createWithEmbedding` (Cohere 1024-dim, ADR-002); optional `fulcrumRuns` projection | New; publish template is `holocron-mcp/src/tools/storage.ts` |

*(Nine components, all running in the local worker except the publish target. The Gate and Ledger are the deterministic spine — both reused from the parked Prospector core. The Worker and Provider are the local-inference substrate. Convex is downstream of COMMIT, not upstream of it.)*

## Component Interactions (happy path, one cycle)

1. **Scheduler** fires → **Work-Item Selector** returns the next target → **Cycle Orchestrator** enqueues a cycle for the **Worker**.
2. **Worker** runs SENSE (plan query on divergent model, fetch via holocron retrieval tools), GENERATE (divergent), extracts claims in ASSAY (convergent), then hands claims + fetched sources to the **Evidence Gate**.
3. **Gate** grades, checks quotes, runs admission + provenance, computes the score — deterministically, no model.
4. **Worker** runs CHALLENGE on the *other* model, submits refuting claims back through the **Gate**, emits the next kill-question.
5. **Cycle Orchestrator** performs MAP (niche placement) and COMMIT — one idempotent, append-only transaction into the **Evidence Ledger** (evidence, claims, score, lineage, cycle-log row with telemetry).
6. **Brief/Dossier Generator** reflects the change on next brief generation; **Scheduler** updates budget/breaker state.

## The one boundary that crosses the machine edge

Under ADR-001 the loop is self-contained on the machine: selection, cycle, gate, and commit all run locally against the SQLite ledger — **no per-cycle network dependency**. The only boundary that leaves the machine is **publish**: after COMMIT, the Brief/Dossier Generator pushes a candidate's finding to Convex `documents` over HTTPS (idempotent upsert), and optionally mirrors leaderboard state to `fulcrumRuns` for the app. If Convex is unreachable, the finding queues and the loop keeps running. This is the seam self-hosted-Convex-on-mini later shortens to a local call — but nothing about the loop depends on it being remote.
