---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 1.0.0
---

# Architecture Diagram

Everything on the Tailscale tailnet. One store, one backend process, the fleet, and the clients.

```
                          TAILSCALE TAILNET (tail011a51.ts.net)
┌───────────────────────────────────────────────────────────────────────────────────┐
│                                                                                     │
│   ┌──────────────────────────── MINI (prod) / LAPTOP (dev) ────────────────────┐   │
│   │                                                                            │   │
│   │   ┌────────────────────────── Mastra Server (Bun + Hono) ──────────────┐   │   │
│   │   │  Agents (chat router + 10 specialists · research · challenge)      │   │   │
│   │   │  Mission Engine ── Workflow Runtime (@mastra/pg, durable/resumable)│   │   │
│   │   │  Tool+Schema Registry · Processors · Model Role Router            │   │   │
│   │   │  Evidence Gate (pure TS, NO model) · Scheduler+Queue · Reactive   │   │   │
│   │   │  Bridge · MCP Gateway (stateless) · Blob Store · Observability     │   │   │
│   │   └───────┬───────────────┬───────────────┬───────────────┬──────────┘   │   │
│   │           │ SQL/Drizzle   │ LISTEN/NOTIFY │ /v1 (LiteLLM) │ OTel          │   │
│   │           ▼               ▼               │               ▼               │   │
│   │   ┌───────────────┐   ┌─────────┐         │        ┌──────────────┐       │   │
│   │   │  POSTGRES     │   │zero-    │         │        │  Langfuse    │       │   │
│   │   │  pgvector+FTS │◄──┤cache    │         │        │ (self-host)  │       │   │
│   │   │  domains +    │   │(logical │         │        └──────────────┘       │   │
│   │   │  evidence graph│  │ replica)│         │                               │   │
│   │   │  = the ledger │   └────┬────┘         │                               │   │
│   │   │  blobs on FS  │        │              │                               │   │
│   │   └───────────────┘        │              │                               │   │
│   └────────────────────────────┼──────────────┼───────────────────────────────┘   │
│                                 │ Zero sync    │ role calls                        │
│                                 │              ▼                                    │
│                                 │      ┌──────────────────────────────────────┐    │
│                                 │      │  LiteLLM router  laptop:4545/v1       │    │
│                                 │      │  divergent·convergent·judge·embed·rerank│  │
│                                 │      │  → Qwen fleet (inference1/2 + laptop)  │    │
│                                 │      └──────────────────────────────────────┘    │
│                                 │                                                   │
│   ┌─────────────────────────────┼───────────┐        ┌──────────────────────────┐  │
│   │  RN App (Expo)              ▼            │        │  Agent Clients           │  │
│   │  Zero reactive hooks + SSE chat         │        │  (Claude Code / Cursor)  │  │
│   │  screens unchanged; data layer swapped  │        │  via MCP gateway          │  │
│   └─────────────────────────────────────────┘        └──────────────────────────┘  │
│                                                                                     │
└──────────────────────────────────┬──────────────────────────────────────────────┘
                                    │ /article/:shareToken  (the ONE public egress)
                                    ▼
                             Public Reader (Tailscale Funnel / reverse proxy)

  ESCAPE HATCH (default-deny, budget-gated):  Model Role Router ──▶ Claude API (Anthropic)
                                              only when step declares highStakes + budget OK
```

**Reading it:** the Mastra server is the only backend; Postgres is the only store *and* the ledger; the fleet does all default reasoning via LiteLLM; Zero syncs the reactive Postgres subset to the app; the Claude API is a gated side-path; `/article/` is the only public door. Compared to today, the Convex cloud backend and the `convex/browser` MCP proxy are gone, and the compute now sits next to both the data and the inference.
