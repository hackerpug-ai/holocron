---
stability: PRODUCT_CONTEXT
last_validated: 2026-07-13
prd_version: 2.0.0
---

# Holocron MK-VI Platform Migration — Convex → Mastra + Postgres

## Product description

Holocron is a personal research knowledge system (RN/Expo app + MCP gateway for agents + a backend). Today the backend is **Convex Cloud**: 60 tables, ~233 function modules, 16 crons, a single public `/article/` endpoint, and a 49-tool MCP server that thin-proxies Convex. All reasoning is cloud Anthropic; all embeddings are cloud Cohere.

This initiative **migrates holocron off Convex entirely** — both the database and the services — onto a **Mastra (Bun) + Postgres** platform that runs on the owner's Tailscale mini. The RN app resyncs through **Zero (Rocicorp)**; all reasoning moves to the **local inference fleet** (LiteLLM at `http://laptop:4545/v1`), with the Claude API demoted to a budgeted escape hatch. It is a **platform migration, not a feature release** — the app's screens and the MCP tool surface stay behaviorally identical; what changes underneath is the entire runtime.

## Problem statement

The current architecture blocks where holocron wants to go, and a specific downstream initiative (fulcrum, an autonomous evidence-graded research loop) proves it:

- **Convex Cloud cannot reach the tailnet fleet.** Convex actions run in a cloud runtime, so local-model inference is impossible from the backend. Fulcrum's entire PRD is an elaborate workaround for exactly this — a separate tailnet worker with its own `bun:sqlite` ledger, publishing findings back to Convex over HTTPS. The workaround exists only because the backend is in the wrong place.
- **Cloud-metered thinking while owned silicon idles.** All 83 LLM call sites are cloud Anthropic (including triage and titles); every embedding is Cohere with a 1024-dim contract hard-coded into 6 vector indexes. Two Mac minis + an M5 Max sit idle.
- **A runtime that fights the roadmap.** Convex actions have execution-time limits (long research loops must self-reschedule); there is no token streaming (the UI fakes it via reactive row inserts); research loops terminate on LLM-self-assessed confidence (`coverage>=4 && confidence>=70`) — a reward-hackable pattern. Reasoning depth lives in external harnesses (pi / Claude Code), not in the system.
- **Vendor lock-in on the runtime.** The Convex function runtime constrains what can run server-side, which is precisely why the compute the owner wants (Mastra agents, local-model missions) is awkward to host today.

## Solution summary

Rebuild the backend as a single **Mastra 1.x service on Bun**, co-located with **Postgres** on the mini and reachable over Tailscale:

- **One store on the metal.** Postgres (pgvector + full-text search) replaces all 60 Convex tables; the RN app resyncs via **Zero** reactive queries; there is no cloud hop and no split brain.
- **One Mission Engine.** Fulcrum's `SENSE→GENERATE→ASSAY→CHALLENGE→MAP→COMMIT` cycle is generalized into a declarative **mission-template** model that *every* agentic pipeline (chat, research, whatsNew, assimilate, shop, subscriptions, the four business pipelines) becomes an instance of — durable, resumable, steerable, approvable, on Mastra workflows with Postgres run-state.
- **Local-first everywhere.** A role router (`divergent`/`convergent`/`judge`/`embed`/`rerank`) sends all reasoning to the fleet; the Claude API is a default-deny, budget-ledgered escape hatch for declared high-stakes steps. Research runs **Mastra-native with no external harness (pi is removed)**, terminating on a **deterministic evidence gate** instead of LLM confidence.
- **Big-bang cutover.** Build the new stack in parallel, run a one-time `convex export`→Postgres ETL (re-embedding the corpus locally), flip the app + MCP, verify against real services, then delete Convex entirely.

**Fulcrum is built within this migration but stays its own PRD.** This initiative delivers the platform — Mission Engine API, evidence-graph substrate schema, and local fleet roles — that fulcrum plugs into. Because Mastra+Postgres run on the mini, fulcrum's tailnet-worker and `bun:sqlite` ledger **collapse into the shared platform**: fulcrum becomes "just another mission template," and its previously-deferred in-app UI becomes near-free (its ledger is now Zero-reactive Postgres).

## Relationship to the MK-VI vision

This PRD is **Phase 1** of the broader "Holocron MK-VI — Gatekeeper" vision (`docs/plans/2026-07-13-holocron-mk6-rewrite-brainstorm.md` and `-stack-recommendations.md`). It delivers the **Metal + Substrate + Mission Engine + local inference** layers on which later MK-VI phases (the 6-tool Gatekeeper surface, nightly consolidation, morning-briefing podcast, fleet-transcript ingestion) will sit. Those later phases are explicitly out of scope here.
