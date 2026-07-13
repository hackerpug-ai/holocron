---
stability: FEATURE_SPEC
last_validated: 2026-07-13
prd_version: 2.0.0
scope_posture: full
---

# Scope

**Scope Posture:** Full feature (default). This is a complete, decisive platform migration — the Convex runtime and database are fully removed, not partially wrapped.

## In Scope

### Platform (PLAT)
- Self-hosted **Postgres** (with `pgvector` + native full-text search) on the tailnet mini, reachable over Tailscale; **no RLS, no multi-tenant** (see Out of Scope rationale).
- A single **Mastra 1.x service on Bun** (agents, tools, workflows, processors, Hono HTTP + SSE surface) running on the mini.
- **Drizzle ORM** schema and migrations as the typed data layer.
- **Scheduler/queue**: Mastra native scheduled workflows for cadence + **pg-boss** (Postgres-backed) for leased/retried at-least-once work with exactly-once observable effects — together replacing all 16 Convex crons and the `scheduler.runAfter` chaining.
- **Deployment**: launchd/service definitions to run Postgres + Mastra headless on the mini; dev-on-laptop, prod-on-mini parity.
- **Observability**: Langfuse (self-host) + OTel tracing, an inference-telemetry stream, and the escape-hatch **budget ledger**.
- A **runtime compatibility lock** and fleet-role manifest that fail closed when the real Bun/Mastra/Postgres/fleet combination is not proven compatible.

### Data (DATA)
- **Postgres schema** for all current domains (the 60 Convex tables), collapsing known duplication (the four business pipelines → one; the two research systems → one).
- The **evidence-graph substrate** (sources → passages → claims → entities → relations → beliefs, with supports/contradicts edges and bi-temporal validity) added now as fulcrum's ledger, append-only and DB-enforced.
- **Local re-embedding** of the corpus (Qwen3-Embedding on the fleet), dropping Cohere; **hybrid search on Postgres** (pgvector KNN + FTS, fused with RRF in the app), replacing Convex `hybridSearch`.
- **Passage-level chunking + contextual embeddings**, killing the 8,000-char whole-document truncation.
- **Full file lifecycle**: migrate every retained Convex-storage object, preserve hash/ownership/disposition evidence, and support new image and voice uploads through Hono-backed content-addressed storage.
- The **one-time big-bang ETL** (`convex export` → transform → Postgres load) with referential-integrity + row-count validation gates and vector regeneration.

### Services & Mission Engine (SVC)
- A **Mission Engine**: declarative mission templates (goal, trigger, stage graph, tool grants, model-role bindings, budgets, gate rubric, human-gate, output contract) instantiated as Mastra workflows with Postgres run-state (durable, resumable, steerable, approvable).
- **All agentic pipelines re-expressed as templates/agents**: chat (triage→specialists→tool loop redesigned as a Mastra agent with native in-SDK tool use + SSE streaming), research, deepResearch, whatsNew, assimilate, shop, subscriptions, and the four business pipelines (whose reasoning re-homes from client-side Claude skills to the local fleet).
- **MCP gateway rehost**: the existing 44-tool `@mastra/mcp` server calls in-process Mastra tools (no `convex/browser` proxy, no stringly-typed refs), with manifest-backed stdio and Streamable HTTP compatibility pinned to MCP 2025-11-25.
- The public **`/article/{shareToken}`** endpoint re-hosted on Hono (converter ported verbatim, path/token compatible so existing links survive).

### Inference (INFER)
- A **model role router** (`divergent`/`convergent`/`judge`/`embed`/`rerank`) over LiteLLM; **local-first everywhere** — all 83 call sites route to the fleet by default.
- The **Claude API escape hatch**: default-deny, requires an explicit high-stakes flag + a budget-ledger pre-check + telemetry; a **defined degraded mode** when the fleet is unreachable (never a silent cloud fallback).
- **Structured/constrained output** on local models (json_schema → constrained decode → Zod re-validation → bounded repair loop → explicit fail).
- The **pi-free research engine**: Mastra-native multi-phase research terminating on a **deterministic evidence gate** (not LLM confidence), with ASSAY and CHALLENGE on distinct model instances.

### Sync, Cutover & Decommission (SYNC)
- **Zero (Rocicorp)** integration (logical replication, uuid keys) and the **RN app rewrite** from Convex hooks (~105 call-sites across ~47 files; `ConvexProvider`→Zero provider) to Zero reactive hooks + SSE for live tokens, with an explicit mutation/offline/conflict contract.
- The **big-bang cutover**: parallel build → durable write freeze → ETL → flip app + MCP into a rollbackable read-only soak → verification gates → enable writes (data-plane point of no return) → **decommission** (delete `convex/`, the Convex deps, `python/` + `cli/`, and the Convex cloud deployment).
- A **rollback and recovery plan**: config rollback only during the read-only soak; encrypted Postgres/blob recovery after the first accepted production write; a fresh restore drill before Convex deletion.
- A **real-service integration harness** (real Postgres + real Mastra + real fleet) plus provisioned **Maestro on an iOS Simulator Expo development build** for RN E2E (the human-testing-gate substrate that does not exist today).

### Fulcrum readiness (threaded through, not a separate group)
- The Mission Engine API, the evidence-graph schema, and the fleet role bindings that let **fulcrum become one standing mission template** are delivered here as acceptance criteria (in SVC/DATA/INFER). Fulcrum's own cycle logic, weights, and UI remain its own PRD.

## Out of Scope

- **Fulcrum's own mission logic, weights, human-gate policy, and UI** — that is `.spec/prds/fulcrum/`, built *within* and *after* this platform. This PRD only guarantees the seams. `[DEFERRED: separate PRD — fulcrum]`
- **RLS, multi-tenant isolation, and production auth hardening.** Per `RULES.md` this is a personal, never-published app; Tailscale ACLs + API keys are the entire trust boundary. Explicitly excluded.
- **App-store publication / release engineering** beyond the existing EAS build channels.
- **New product features or UI redesigns.** Screens and MCP tool semantics stay behaviorally identical; only the data/compute layer changes.
- **Self-hosting Convex.** Considered and rejected — the goal is to leave Convex, not relocate it. `[DEFERRED: rejected]`
- **The later MK-VI phases** — the 6-tool Gatekeeper meta-surface, nightly consolidation, the morning-briefing podcast, fleet-transcript ingestion, Sith-mode. `[DEFERRED: separate PRD — MK-VI Phase 2+]`
- **Fleet hardware/topology changes** (exo RDMA pooling, a third mini). The fleet is consumed as-is.
- **Voice-assistant re-platforming** beyond porting its data layer; OpenAI Realtime stays as an optional premium path.
