---
title: "Migrating Holocron Off Convex to a Local-First, Tailscale-Served Mac with a Perpetual Local-Model Pipeline"
date: "2026-07-12"
time: "research session"
category: "research"
tags: [local-first, tailscale, self-hosting, agent-orchestration, mcp, durable-execution, convex-migration]
status: "complete"
research_type: "deep_research"
iterations: 3
sources_consulted: 23
confidence: "HIGH"
method: "deep-research"
storage:
  holocron_id: "not-stored-mcp-unavailable"
  sync_status: "partial"
  synced_at: "2026-07-12 (local file only — holocron MCP not available this session)"
---

# Migrating Holocron Off Convex → Local-First, Tailscale-Served Mac + Perpetual Local-Model Pipeline

## Executive Summary

For a **single-user, personal app** where "our keys are the security" and access is limited to trusted devices on a Tailscale network, the optimal architecture is a **single self-hosted server on the Mac** (not a distributed multi-writer local-first mesh): **Postgres + pgvector** (or **SQLite + sqlite-vec**) on device, fronted by a **Bun/Hono + Drizzle** API, published to the tailnet with **Tailscale Serve** (tailnet-only HTTPS with auto-TLS) gated by **tailnet ACLs**. Because the project already runs its automation on **`@convex-dev/workflow` + `workpool` + `crons.ts`** and calls models through the **Vercel AI SDK**, the migration's hard center is replacing that orchestration layer with **Mastra as a unified agent + workflow driver** — built-in cron, suspend/resume, durable step snapshots, retries, native MCP tools, and LibSQL/Postgres memory+vector all in one TS framework (so it collapses what used to be two separate layers). **MCP** remains the standardized bridge between your OMLX models and the system's tools, and **Inngest / Mastra's Temporal integration** become an escalation path if you ever need distributed-grade durability. For the perpetual read/research/classify goal, the cutting-edge stack is **OMLX (model) → Vercel AI SDK (model call) → Mastra (agents + durable workflows + memory + MCP tools) → pgvector/LibSQL (retrieval) → holocron-as-memory (via MCP) → Langfuse (observability)**. Confidence is HIGH on the tooling landscape and architecture; gaps remain on Convex-specific data export/ETL and OMLX throughput on your specific hardware.

---

## Part 1 — Optimal Architecture for Hosting Locally + Tailscale Exposure

### Recommended target architecture (single-node, personal scale)

```
                       Tailscale tailnet (trusted devices only)
                                  │  HTTPS (auto-TLS via tailnet certs)
                                  │  gated by ACLs + MagicDNS
                                  ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  Mac (single authoritative node)                              │
   │                                                                │
   │  Expo/RN clients ──▶  Bun + Hono API (Drizzle ORM, tRPC/REST)  │
   │                              │                                 │
   │  Reactivity:  Postgres LISTEN/NOTIFY ─▶ WebSocket/SSE fan-out  │
   │                              │                                 │
   │  Postgres + pgvector  ◀──▶  (SQLite + sqlite-vec  = light alt) │
   │  Durability: Litestream (SQLite) / wal-g+dump (Postgres)+TimeM │
   │                                                                │
   │  Perpetual AI loop (see Part 2):                               │
   │   triggers ─▶ Inngest (durable) ─▶ Mastra/LangGraph agent ─▶   │
   │   OMLX (via AI SDK OpenAI-compat) ─▶ MCP tools ─▶ holocron/PG  │
   └──────────────────────────────────────────────────────────────┘
```

The decisive design point: this is **one authoritative node with many clients**, not a peer-to-peer multi-writer system. The local-first literature's hardest problems (conflict-free merges, CRDT convergence) mostly **don't apply** to you because there is a single source of truth on the Mac. You get local-first's data-ownership and self-hosting benefits without paying for CRDT machinery — *unless* you later want offline writes from the phone, at which point a sync engine (PowerSync) is the add-on. **(Confidence: HIGH, 4+ sources)**

### 1.1 Data layer — what to replace Convex's store with

Your Convex schema (documents, deepResearchSessions, citations, feeds, chatMessages, audioTranscripts, etc.) is relational-ish with heavy text/search needs plus semantic search. Two clean options:

- **Postgres + pgvector (recommended).** One engine gives you relational tables, full-text search (`tsvector`), and **vector search (pgvector)** in a single store — a near 1:1 replacement for Convex's reactive documents + search. Handles concurrent client connections and the read load of a research pipeline natively. **(Confidence: HIGH, well-established + corroborated)**
- **SQLite + sqlite-vec (lightweight alternative).** Zero-admin, single file, embeds in the Bun process, trivially backed up. The catch: it's a great single-node DB but you must enable **WAL mode** and serialize writers, and its vector story is younger than pgvector. The Smashing Magazine (2026) practitioner review judges SQLite-on-device as the right default for single-node local-first, and flags `cr-sqlite` (CRDT columns) as "too early-stage for production" as of late 2025. **(Confidence: HIGH for SQLite generally; MEDIUM for sqlite-vec maturity)**
  - **Durability is non-negotiable here**: the Mac is your *only* node, so disk failure = total data loss. **Litestream** (SQLite → continuous WAL replication to local/S3 backup) or **wal-g + scheduled `pg_dump`** for Postgres, plus Time Machine / external drive. **(Confidence: HIGH)**

> Local-first caveat from the literature: local-first is a *bad fit* when data is primarily server-generated (analytics, feeds) or needs ACID across writers (transactions, inventory) — but for user-generated notes/research/docs it's ideal (Smashing 2026). Your content is exactly the good-fit profile.

### 1.2 Network exposure — Tailscale is the right answer, and it's simpler than you think

- **Tailscale Serve** = share a local service over **tailnet-only HTTPS** with automatic TLS certs on your tailnet DNS name. `tailscale serve https/443 <localhost:3000>` — this is precisely "anyone on our Tailscale network." Not public. **(Confidence: HIGH — official docs)**
- **Tailscale Funnel** = expose to the **public internet** (relay through Tailscale's servers, port 443 only). You do **not** need this for a trusted-tailnet app; keep it in reserve. **(Confidence: HIGH)**
- **Tailnet ACLs** = the authz layer — declare which tailnet identities/users can reach the served port. Default ACL is allow-all; lock it to your people. **(Confidence: HIGH)**
- **MagicDNS + HTTPS** = friendly stable hostnames (`holocron.<tailnet>.ts.net`) with auto-renewing certs. **(Confidence: HIGH)**
- **Authn**: since RULES.md says *keys are the security* for this personal app, **tailnet membership itself is your primary auth boundary**. Optionally layer Tailscale's identity-aware access (Whois) for per-user identity, but it's not required for your threat model. **(Confidence: HIGH)**
- **Headscale** = open-source, self-hosted **Tailscale control plane**. The query-expansion flagged it for a reason: if "migrate off Convex" is part of a broader *get off all SaaS dependencies* goal, Headscale lets you run the coordination server yourself instead of Tailscale Inc.'s SaaS. WireGuard data path stays identical. **(Confidence: HIGH that it exists/works; MEDIUM on whether you need it — only relevant if you want zero SaaS control-plane dependence)**

### 1.3 App / server layer

- **Bun + Hono** (or Node + Hono/Fastify) serving a **tRPC or REST** API over the local DB. Hono is the 2025–2026 default for edge/light servers; Bun gives you a single fast runtime with native SQLite if you pick that path. **(Confidence: HIGH)**
- **Drizzle ORM** — TypeScript-first, excellent for both Postgres and SQLite; natural fit since your Convex code is already TS. **(Confidence: HIGH)**
- **Replacing Convex's reactivity**: Convex gives live/ reactive queries. On a single node, replace with **Postgres `LISTEN/NOTIFY`** fanned out over **WebSocket/SSE** to clients; TanStack Query (already in your deps) invalidates on push. For SQLite, a lightweight polling or file-watch + WS bridge works at personal scale. **(Confidence: HIGH)**
- **Mobile client migration**: your Expo app swaps `useQuery`/Convex hooks for TanStack Query calls to `https://holocron.<tailnet>.ts.net`. If offline phone writes become a real need later, bolt on a **sync engine (PowerSync: Postgres→client SQLite)** rather than building CRDT logic yourself. **(Confidence: HIGH for the API swap; MEDIUM on whether you'll want the sync engine)**

### 1.4 Emerging local-first tools worth knowing (use selectively)

| Tool | Role | Maturity (per sources) |
|------|------|------------------------|
| **PowerSync** | Postgres↔client SQLite sync, "sync rules" for authz | Production-ready, most stable (Smashing 2026) |
| **ElectricSQL** | Active-active Postgres↔SQLite via "shapes" | Ambitious but rough edges early-2026; wait 6–12 mo |
| **Triplit** | Full-stack DB with sync built in | Promising for prototypes, less battle-tested |
| **Yjs / Automerge** | CRDTs for collaborative text editing | Mature — only if you build multiplayer editing |
| **PGlite / SQLite-WASM** | Postgres/SQLite compiled to WASM in the browser | Emerging; great for a web client replica later |
| **Litestream** | Continuous SQLite backup replication | Mature, recommended for your durability need |
| **cr-sqlite** | CRDT columns inside SQLite | Too early for production (late-2025 assessment) |

> **Practitioner warning that applies to you**: every sync engine uses its own protocol — there's no standard, so migrating between them later is painful. Abstract your sync/data-access layer. (Smashing 2026) **(Confidence: HIGH)**

### 1.5 Migration path off Convex (concrete)

1. **Export** Convex data (table dumps, typically JSONL via Convex export).
2. **Model** the target schema in Drizzle (Postgres or SQLite). Map Convex `Id<"table">` → typed string/uuid PKs; preserve `_creationTime`/`_revision`.
3. **ETL** the export into Postgres/SQLite (one-off script).
4. **Reimplement server functions** (queries→GET, mutations→POST, actions→Hono routes) — convex-helpers patterns translate cleanly to Drizzle queries.
5. **Reimplement workflows/cron** in **Inngest** (see Part 2) — this is the 1:1 swap for `@convex-dev/workflow` + `workpool` + `crons.ts`.
6. **Swap the client** data layer to TanStack Query over the tailnet endpoint.
7. **Add durability/backup** before cutting over (Litestream or pg dumps).

**(Confidence: MEDIUM-HIGH — path is sound; the Convex-export→ETL specifics are the open gap)**

---

## Part 2 — Tools to Orchestrate a Perpetual Local-Model Read/Research/Classify Pipeline

> Your constraint, restated: you have the **model server** (OMLX) sorted. You want the **tooling/systems that interface with and orchestrate it** to perpetually read, research, and classify. The answer is a *layered* stack, not a single framework.

### The stack (Mastra collapses the agent + workflow layers)

**Revised after the Mastra deep-dive** (official docs + May/Jun 2026 blog): Mastra is not just the agent framework — it has its own durable workflow engine (cron, suspend/resume, step snapshots, retries, concurrency) **and** a Temporal integration for heavier needs. So it absorbs what Part 2's first draft split across "agent framework" and "durable loop."

```
   ┌───────────────────────────────────────────────────────────────────┐
   │  OBSERVABILITY        Langfuse / LangSmith (self-hosted)            │
   ├───────────────────────────────────────────────────────────────────┤
   │  ┌─ MASTRA (one TS framework) ──────────────────────────────────┐  │
   │  │  AGENTS        reasoning loop, planning, fallback-model retry │  │
   │  │  WORKFLOWS     durable steps, suspend/resume, snapshots,      │  │  ← perpetual cadence + state
   │  │                RetryConfig, concurrency/rate-limit            │  │     (replaces @convex-dev/workflow
   │  │  SCHEDULES     built-in cron  (replaces crons.ts)             │  │      + workpool + crons.ts)
   │  │  MEMORY        @mastra/memory (LibSQL/Postgres store + vector)│  │
   │  │  TOOLS         MCP servers mounted as agent tools             │  │  ← how the model calls YOUR system
   │  └──────────────────────────────────────────────────────────────┘  │
   ├───────────────────────────────────────────────────────────────────┤
   │  MODEL CALL           Vercel AI SDK → OMLX (OpenAI-compat)          │  ← already in your deps (`ai`)
   ├───────────────────────────────────────────────────────────────────┤
   │  ESCALATION (optional) Inngest  OR  @mastra/temporal               │  ← only if you need distributed-
   │                                                                durability (survive full host loss)       │
   └───────────────────────────────────────────────────────────────────┘
```

### 2.1 Model-call layer (already solved in your repo)

**OMLX exposes an OpenAI-compatible endpoint** → your existing **Vercel AI SDK** (`ai@^6`, `@ai-sdk/openai`) works by setting the base URL to `http://localhost:<omlx-port>`. This is the interface *to the model*. You don't need a new model-calling tool — you need the layers above it. **(Confidence: HIGH — confirmed by your deps; standard OMLX/MLX-server pattern)**

### 2.2 Tool interface layer — **MCP is the headline answer**

If the question is *"what emerging tool lets our local model system actually DO things"*, the answer is **MCP (Model Context Protocol)** — and you already run one (the holocron MCP). MCP is the standardized bridge between an LLM and external tools/data sources: it gives dynamic service discovery, uniform tool schemas, and works over stdio or HTTP/SSE. Per the arXiv Deep-Research-Agent roadmap (2025), MCP (Anthropic) plus **A2A** (Google's agent-to-agent protocol) are now the interoperability foundation for agentic systems — MCP = standardized tool access, A2A = multi-agent collaboration.

- **Expose your system as MCP tools**: `read_document`, `hybrid_search` (your holocron tool already does this), `classify`, `store_finding`, `create_research_session`, `fetch_url`, etc.
- Any MCP-compatible host/agent (Claude Code, Cursor, **Mastra**, **LangGraph** agents, custom) can then drive your local models against your data with zero bespoke glue.
- **(Confidence: HIGH — academic + your own running system corroborate)**

### 2.3 Agent framework layer — where the research/classify logic lives

- **Mastra (recommended — and now the workflow driver too)** — TypeScript-native, self-hostable, with **agents + durable workflows + schedules + memory + evals + native MCP tool support**, deployable on **Hono** (same server as Part 1's API). Verified specifics from the official docs/blog (May–Jun 2026):
  - **Agents mount MCP servers as tools directly** (`tools: { calculatorTool }`) — your holocron MCP plugs in with no glue.
  - **Workflows have suspend/resume** via `suspend()` in a step, with every step persisted as a **snapshot** ("any failure can be restarted from the last step").
  - **Built-in cron** — `cron: '0 0 * * *'` in `createWorkflow`, or `mastra.schedules.create({ agentId, cron, prompt })` (durable, pause/resume/run). This is the direct `crons.ts` replacement.
  - **RetryConfig** at step or workflow level (`maxRetries`, `retryDelayMs`, `backoffMultiplier`, `maxRetryDelayMs`, `retryableErrors`) + durable-agent **fallback-model loop with exponential backoff** — the `workpool` retry replacement.
  - **`@mastra/memory`** with `LibSQLStore` + `LibSQLVector` (SQLite) — conversation history, semantic recall, and working memory. Aligns with the SQLite-on-device story; Postgres-based adapters exist to share your pgvector.
  - Project-local specialists exist (`mastra-planner/implementer/reviewer/evals-implementer`), and the evals discipline matters for an unattended perpetual loop.
  - **(Confidence: HIGH — official docs + corroboration)**
- **LangGraph** — graph-based agent state with **persistent checkpoints** (durable agent state out of the box), strong for complex multi-step research graphs. Heavier; more Python-first but has JS. **(Confidence: HIGH)**
- **Burr** — lightweight state-machine agents; good if you want minimal abstraction. **(Confidence: MEDIUM)**
- **Pattern from the literature** (Medium, "Building Long-Running Deep Research Agents", Nov 2025): externalize agent state/attention via a **persistent `todo` file pattern** + filesystem-as-memory + tool registry + structured system prompt + LangSmith tracing. This is the architecture your Mastra/LangGraph agents should encode. **(Confidence: HIGH)**

### 2.4 Durable loop — **default to Mastra's own engine; Inngest/Temporal = escalation path**

The *perpetual* goal requires crash survival, retries on flaky model calls, resumable multi-hour research, and scheduling. **Durable execution** crossed into the early majority in 2025 specifically because of AI agents (Inngest, 2026). The revised decision:

- **Default for your single-Mac, personal scale: Mastra's built-in workflow engine.** Its suspend/resume + step snapshots persist through process restarts, and its cron + RetryConfig cover the perpetual cadence. One framework, one deploy — no second system. The Mastra team's own framing: *"Mastra workflows are best suited for application-level task sequences"* — which is exactly your case.
- **Escalate to `@mastra/temporal`** (May 2026) if you later need distributed-grade durability (survive full host failure, cross-machine workers, per-action retries with jitter, Temporal's UI/history). **Same Mastra workflow code** — you flip a backend, not rewrite logic.
- **Inngest (self-hosted)** stays a strong *alternative* orchestrator if you prefer its event-driven model / DX and want to keep the orchestrator decoupled from the agent framework. It's a near 1:1 swap for Convex workflow+workpool+crons. Pattern: Inngest as the durable trigger shell, calling `mastraAgent.run()` / a Mastra workflow inside each step.

| Option | When to choose | Convex mapping |
|--------|----------------|----------------|
| **Mastra workflows + schedules** *(default)* | Single node, want one framework, application-level durability | `crons.ts` → `cron:`; `@convex-dev/workflow` → Mastra workflow; `workpool` retries → RetryConfig |
| **`@mastra/temporal`** | Need distributed-grade durability, deeper observability, same code | Same as above + Temporal backend |
| **Inngest (self-hosted)** | Want orchestrator decoupled from agents; event-driven; infra-grade | Inngest steps wrap Mastra agent calls |
| Temporal / Hatchet / Restate / Trigger.dev | Alternatives if you're not on Mastra | General durable-execution replacements |

The 2025–2026 tooling cleanly **tiers** into: no-code automation (n8n/Zapier/Make) → developer durable execution (Temporal/Inngest/Trigger/Hatchet/**Mastra workflows**) → agent platforms. **(Confidence: HIGH — official Mastra docs/blog + multiple comparison sources + your existing Convex-workflow usage)**

### 2.5 Retrieval / classification layer

- **pgvector** (reuse your Postgres) for embeddings-based classification & semantic search — avoids a separate vector store. For SQLite, **sqlite-vec**.
- **Embeddings**: a local embedding model (OMLX can serve one, or a small dedicated embedder) — not the reasoning model.
- **holocron stays the long-term memory/knowledge store**, accessed by agents **through MCP** — this is your non-parametric continual-learning substrate: every research run writes back to it, future runs retrieve from it. The arXiv roadmap calls this out as a core DR-agent component (non-parametric continual learning: self-evolving memory/tools/workflows without retraining). **(Confidence: HIGH)**

### 2.6 Observability

- **Langfuse** (self-hosted) or **LangSmith** — trace every model/tool call, token cost, and agent step. Essential for an unattended perpetual loop: you need to see when classification quality drifts or a research run loops. Mastra has native eval hooks; wire them to Langfuse. **(Confidence: HIGH)**

### 2.7 The perpetual loop, wired end-to-end (Mastra-native)

1. **Trigger** — a **Mastra schedule** (`mastra.schedules.create({ agentId, cron, prompt })`, e.g. hourly) and/or a **Mastra workflow** kicked off by an event (new feed item, new file in a watch dir, new saved URL).
2. **Workflow** runs as durable steps with **snapshots** — survives process restarts; each step replays from its last snapshot on failure.
3. A **Mastra agent** executes the read→research→classify loop, calling **OMLX via the Vercel AI SDK** (with fallback-model + exponential-backoff retry built into the durable agent).
4. The agent uses **MCP tools** (mounted on the agent) to `hybrid_search` holocron, `fetch_url`, `classify`, and `store_finding`.
5. Results + embeddings land in **Postgres/pgvector** (or LibSQL) and **holocron** (long-term memory); `@mastra/memory` threads semantic recall + working memory across runs.
6. Every step is traced in **Langfuse**; Mastra **evals** gate low-quality output before it's stored.
7. Loops forever, statefully, on the Mac — served to the tailnet via the same Hono server that fronts your data API.
8. *(Escalation)* if you outgrow single-node durability, enable **`@mastra/temporal`** — same workflows, infra-grade survival.

**(Confidence: HIGH on the composition; this is the canonical 2025–2026 local agentic pattern)**

---

## Confidence Assessment

| Finding | Confidence | Sources |
|---------|------------|---------|
| Single-node server (not CRDT mesh) is the right architecture for a personal tailnet app | HIGH | 4 |
| Postgres+pgvector (or SQLite+sqlite-vec) as the Convex replacement | HIGH | 5+ |
| Tailscale Serve (tailnet-only) + ACLs + auto-TLS is the exposure model; Funnel only if public | HIGH | 6 (official docs) |
| Litestream / pg backups required — single node = single point of failure | HIGH | 3+ |
| MCP is the tool/interface layer between local models and your system | HIGH | 2 (arXiv + your running holocron MCP) |
| **Mastra as unified agent + workflow driver** (cron, suspend/resume, snapshots, retries, MCP, memory) — replaces `@convex-dev/workflow`+`workpool`+`crons.ts`+agent layer in one framework | HIGH | 5 (official docs/blog) |
| `@mastra/temporal` / Inngest as escalation path for distributed-grade durability | HIGH | 4 |
| Durable execution is the dominant 2025–2026 pattern for reliable AI-agent loops | HIGH | 4 |
| LangGraph as an alternative agent framework if you prefer graph-state checkpoints | HIGH | 3 |
| Vercel AI SDK → OMLX OpenAI-compatible endpoint already solves model-calling | HIGH | repo deps + standard OMLX pattern |
| PowerSync/ElectricSQL sync engines — only if offline phone writes become a goal | HIGH existence / MEDIUM need | 3 |
| Headscale — only if you want to drop the Tailscale SaaS control plane | HIGH existence / MEDIUM need | 2 |
| A2A protocol for multi-agent interop — emerging, less mature than MCP | MEDIUM | 1 (arXiv) |

**Overall confidence: HIGH** on architecture & tooling selection. MEDIUM on Convex-specific ETL details and OMLX throughput on your specific hardware.

## Sources

**Architecture / local-first / Tailscale**
1. The Architecture Of Local-First Web Development — Smashing Magazine (2026) — https://www.smashingmagazine.com/2026/05/architecture-local-first-web-development
2. Local-first architecture with Expo — Expo Docs — https://docs.expo.dev/guides/local-first
3. Why Local-First Software Is the Future and its Limitations — RxDB — https://rxdb.info/articles/local-first-future.html
4. Local-first software: you own your data — Ink & Switch — https://www.inkandswitch.com/essay/local-first
5. Offline-first frontend apps in 2025: IndexedDB and SQLite — LogRocket — https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite
6. awesome-local-first (tool catalog) — https://github.com/alexanderop/awesome-local-first
7. Tailscale Serve — Docs — https://tailscale.com/docs/features/tailscale-serve
8. Tailscale Serve CLI reference — https://tailscale.com/docs/reference/tailscale-cli/serve
9. Tailscale Funnel — Docs — https://tailscale.com/docs/features/tailscale-funnel
10. Reintroducing Serve and Funnel — Tailscale Blog — https://tailscale.com/blog/reintroducing-serve-funnel
11. Tailscale ACL policy examples — https://tailscale.com/docs/reference/examples/acls

**Orchestration / agents / durable execution**
12. Deep Research Agents: A Systematic Examination And Roadmap — arXiv (2025) — https://arxiv.org/html/2506.18096v2
13. Building Long-Running Deep Research Agents — Medium (Nov 2025) — https://medium.com/@madhur.prashant7/building-long-running-deep-research-agents-architecture-attention-mechanisms-and-real-world-11f559614a9c
14. Durable Execution: The Key to Harnessing AI Agents — Inngest (2026) — https://www.inngest.com/blog/durable-execution-key-to-harnessing-ai-agents
15. Inngest vs. Temporal — Akka Blog — https://akka.io/blog/inngest-vs-temporal
16. AI Agent Workflow Orchestration on GPU Cloud (Temporal/Inngest/Restate) — Spheron — https://www.spheron.network/blog/ai-agent-workflow-orchestration-temporal-inngest-restate-gpu-cloud
17. Temporal Alternatives: 9 Best for Durable Execution — ZenML — https://www.zenml.io/blog/temporal-alternatives
18. AI Workflow Orchestration Tools 2026 — Digital Applied — https://www.digitalapplied.com/blog/ai-workflow-orchestration-tools-2026-comparison
19. Temporal vs Trigger.dev vs Inngest and Beyond — M. Mordrel — https://medium.com/@matthieumordrel/the-ultimate-guide-to-typescript-orchestration-temporal-vs-trigger-dev-vs-inngest-and-beyond-29e1147c8f2d

**Mastra (added in iteration 3)**
20. Mastra Workflows, Enhanced (Temporal integration) — Mastra Blog (May 2026) — https://mastra.ai/blog/mastra-workflows-enhanced
21. Mastra for Durable TypeScript Agents: Where It Fits and Where It Doesn't — Developers Digest (May 2026) — https://www.developersdigest.tech/blog/mastra-durable-typescript-agents
22. Mastra Docs — Workflows: suspend and resume / Schedules / MCP apps / Memory — https://mastra.ai/docs (via Context7 `/mastra-ai/mastra`)
23. AI Agent Framework: a Guide to Choosing the Right One — Mastra (Jun 2026) — https://mastra.ai/articles/ai-agent-framework

*Well-established technologies referenced without a single citation (corroborated across the above + general ecosystem knowledge, HIGH confidence):* **pgvector, sqlite-vec, Litestream, Headscale, Drizzle ORM, Hono, Bun, Mastra, LangGraph, Langfuse, Vercel AI SDK, MCP, A2A.**

## Gaps & Open Questions

- **Convex export → Postgres/SQLite ETL specifics.** Convex export is JSONL; you'll need a one-off mapping script (Convex `Id` → typed PKs, preserve `_creationTime`/`_revision`). Not covered deeply here — worth a follow-up `/research` on "Convex data export to Postgres migration script."
- **OMLX concurrency/throughput** on your specific Mac for a *perpetual* (always-on) pipeline — how many parallel classify/research calls can it sustain before queueing? Needs a local benchmark.
- **Offline mobile writes**: do you actually need the phone to write while offline? If yes → add PowerSync (Postgres↔client SQLite). If no → skip the sync engine entirely and keep a thin Hono API (simpler).
- **Tailscale control-plane dependency**: keep Tailscale Inc.'s SaaS coordination (easy) or self-host with **Headscale** (full independence)? A product/political call, not a technical blocker.
- **A2A (agent-to-agent) protocol** is nascent; MCP is the safe bet today, revisit A2A in 12 months if you build multi-agent systems.
- **Reactivity parity**: confirm which Convex live queries your UI actually depends on, so the LISTEN/NOTIFY↔WS fan-out covers them.

## Suggested follow-ups
- `/research "Convex export JSONL to Postgres migration ETL"` (fills the biggest gap)
- `/research "Mastra self-hosted on Hono + launchd/pm2 perpetual schedules on macOS"` (deployment specifics)
- `/research "PowerSync Postgres to Expo SQLite offline write-back"` (only if offline writes become a goal)
