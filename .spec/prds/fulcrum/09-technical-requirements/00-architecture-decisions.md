---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 1.0.1
---

# Architecture Decision Records

These ADRs were added in v1.0.1 after a dedicated mapping pass over the holocron codebase (`convex/`, `holocron-mcp/`, `convex/schema.ts`, `convex/crons.ts`, `convex/lib/ai/`) verified the reachability and coupling facts below. They are the load-bearing decisions; the rest of the technical requirements conform to them.

## ADR-001 — The loop's ledger of record is LOCAL (bun:sqlite), not Convex tables

**Context.** The v1.0.0 draft placed the evidence ledger in Convex tables with the tailnet worker calling back over the network for every gate/score/commit. The mapping pass established three facts that make that the wrong default:
1. **Convex actions cannot reach tailnet-local inference** (verified: all research inference runs in Convex-cloud actions through `convex/lib/ai/anthropic_provider.ts` → Anthropic cloud; no `baseURL` seam, no network route from Convex cloud to `laptop:4545`/`inference1/2`). Local inference *forces* an on-machine process.
2. **Convex actions have execution-time limits** suited to "schedule the next cycle" (`ctx.scheduler.runAfter`), not to hosting a long-lived worker that holds a local-model connection.
3. A **SQLite evidence-ledger core already exists and passes tests** — the parked Prospector work (`idea-factory` branch `task/prospector-schema`, 31/37 ACs green; blueprint `idea-factory/.spec/prospector/blueprint-schema-ledger-v1.1.md`). Rebuilding it as Convex tables discards working code.

**Decision.** The Fulcrum loop is an on-machine/tailnet process whose **durable ledger of record is a local `bun:sqlite` database** (the Prospector v1.1 schema). Holocron/Convex is the **publish + search substrate**, not the loop's spine. The worker runs the full cycle locally — local inference + local gate + local commit — and pushes *published findings* to holocron over HTTPS.

**Consequences.**
- Fulcrum reuses the parked Prospector SQLite ledger core instead of re-implementing it. The `fulcrum*` schema in `03-data-schema.md` is the **local SQLite** schema (the Prospector blueprint), not Convex tables.
- The loop runs even when Convex is unreachable (findings queue for publish). Its determinism and durability guarantees are the SQLite ones already blueprinted (WAL, idempotent commit, kill-9 all-or-nothing) — not Convex's.
- Convex's role shrinks to: receive published documents (searchable knowledge), and optionally mirror a lightweight run/leaderboard state for app visibility.
- **North star unchanged**: when holocron self-hosts Convex on the Mac minis (tailnet-resident), the local ledger and Convex can co-locate; the publish hop becomes local. No redesign — the boundary just shortens.

## ADR-002 — Publishing must honor holocron's 1024-dim Cohere embedding contract

**Context.** Every holocron vector index — `documents`, `deepResearchIterations`, `researchFindings`, `subscriptionContent`, and others — is hard-coded to **1024 dimensions**, produced by **Cohere `embed-english-v3.0` (cloud)** via `convex/lib/ai/embeddings_provider.ts`. This is the sneakiest coupling: a "local inference for all research" reading might assume embeddings also go local, but the local fleet (`~/models/RULES.md`) serves *coder* models, not a 1024-dim embedder.

**Decision.** For MVP, **published findings embed through holocron's existing Cohere path** (`documents/storage:createWithEmbedding`) — embeddings stay cloud, are 1024-dim, and remain compatible with holocron search. Fulcrum's *reasoning* inference is local (the mandate); its *publish-time embedding* is holocron's existing concern, unchanged.

**Consequences.**
- The local mandate (ADR-001) covers the cycle's generative/analytic inference. Embedding is explicitly out of the local mandate for MVP and noted as such, so "all research local" is honestly scoped to reasoning, not vectorization.
- Going fully local later requires a **1024-dim local embedding model** (or a schema migration of every vector index). Tracked as a risk (R11), not attempted in MVP.
- Fulcrum's *internal* dedup/near-dup (SENSE query dedup, provenance) uses its own local mechanism (content hash for MVP; local embeddings later) and does **not** touch holocron's 1024-dim indexes.

## ADR-003 — Reuse holocron's research *design*, re-implement its *execution* locally

**Context.** Holocron already has (a) a working "Ralph loop" (`convex/research/actions.ts`, a `while` loop terminating on `coverage ≥ 4 && confidence ≥ 70`), (b) a mature 5-factor confidence + citation model (`researchFindings`, `citations` in `convex/schema.ts`), and (c) an unimplemented refactor spec (`.spec/research-loop-improvement-plan.md`) proposing exactly a phase state machine with pluggable termination strategies. Reusing the Convex *execution* directly would route inference back to Anthropic cloud (defeating the mandate).

**Decision.** Mine holocron's research **design** — the phase decomposition, the 5-factor source-credibility signals (fold into the domain-tier + grade model), the citation model, the improvement-plan state machine — but **re-implement execution in the local worker**. Replace the LLM-confidence termination with the deterministic evidence gate (the whole point). Leave holocron's on-demand path (`startSmartResearch`) untouched and running.

**Consequences.**
- `.spec/research-loop-improvement-plan.md` is a primary input to the CYC cycle-engine sprint (it is nearly a Fulcrum cycle spec already).
- Holocron's 5-factor confidence (`sourceCredibilityScore`, `evidenceQualityScore`, `corroborationScore`, `recencyScore`, `expertConsensusScore`) informs the tier ladder and recency model but does **not** become the score — the deterministic gate does. This avoids importing the LLM-judged confidence as a score input.
- No fork of `convex/research/`; Fulcrum is a new local subsystem that publishes into the same `documents` store the existing pipeline uses.
