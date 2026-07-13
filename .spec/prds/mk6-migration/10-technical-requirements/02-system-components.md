---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 2.0.0
---

# System Components

The entire backend is one Bun process (`new Mastra({...})`) fronted by Hono, plus Postgres and the fleet — all on the tailnet. Components below are logical modules within that process unless noted as separate services.

| # | Component | Responsibility | Type |
|---|-----------|----------------|------|
| C-1 | **Postgres** (pgvector + FTS) | The single datastore and durable ledger. All 60-domains-worth of tables, the evidence-graph substrate, vector (HNSW) + FTS (GIN) indexes, logical replication for Zero, append-only immutability triggers on ledger tables. | Service (on mini) |
| C-2 | **Mastra Server (Hono)** | The one backend process. Hosts agents, tools, workflows, processors; exposes scoped `/api/*`, resumable SSE, the MCP mount, public `/article/`, tailnet blobs, and tailnet health/readiness. | Service (on mini) |
| C-3 | **Agent Registry** | The chat router + 10 specialists (sub-agents), research/extraction/challenge agents, digest agents. Each has an `id` + `description` and least-privilege tool grants. | Module |
| C-4 | **Tool + Schema Registry** | Single home for all tool Zod schemas (retrieval, storage, the 44 MCP tools, domain tools). Shared by agents, workflows, and the MCP gateway — deletes the 373-line duplicate Zod layer. | Module |
| C-5 | **Mission Engine** | Loads a declarative mission-template record, instantiates a Mastra workflow run, binds trigger/tool-grants/role-bindings/budgets/gate/human-gate/output-contract. | Module |
| C-6 | **Workflow Runtime + State** (`@mastra/pg`) | Durable run state, suspend snapshots, resume-from-last-committed-step, and a versioned closed Mission Template DSL resolved through code-owned executors. Survives kill-9. | Module |
| C-7 | **Scheduler + Durable Queue** | Mastra native `schedule` for cadence + **graphile-worker / pg-boss** (Postgres leases, retries/backoff, DLQ, priorities). Uses outbox/inbox, idempotency, and fencing for at-least-once execution with exactly-once observable effects. | Module + PG |
| C-8 | **Reactive Bridge** | Postgres `LISTEN/NOTIFY` + transactional outbox → queue job → mission run. Implements the reactive trigger class with durable deduplication; raw NOTIFY is never the source of truth. | Module + PG |
| C-9 | **Model Role Router** | `resolveModel(role,{allowEscape})` → a `LanguageModelV2` from `@ai-sdk/openai-compatible` (fleet via LiteLLM `:4545`) or the budget-gated `@ai-sdk/anthropic` escape hatch. Default-deny escape. | Module |
| C-10 | **Evidence Gate** (pure TS) | Deterministic grading, admission predicate, provenance independence, verbatim-quote entailment, disconfirmation-weighted scoring. **No model calls.** A Mastra step. | Module |
| C-11 | **Ledger + Data Access** | Typed Drizzle repositories over Postgres; append-only evidence/ledger tables with DB-enforced immutability; the shared `embed()` helper; the RRF hybrid-search helper. | Module |
| C-12 | **MCP Gateway** (`@mastra/mcp`) | The 44-tool server, rehosted to call in-process Mastra tools (no Convex proxy), with manifest-backed stdio + MCP-2025-11-25 Streamable HTTP compatibility, scoped keys, origin validation, and no server→client sampling. | Module |
| C-13 | **Blob Store** | Content-addressed storage on the mini FS behind a `BlobStore` interface (`put/get/stream/url/delete`); Hono supports upload-init/finalize, tailnet `/blobs/:id` Range reads, and article-scoped public asset reads. MinIO is a one-adapter swap. | Module + FS |
| C-14 | **Processors / Guardrails** | Input/output/error processors; TokenLimiter, output validation, and typed `blocked` tripwire handling at every call site. | Module |
| C-15 | **Observability + Budget Ledger** | Langfuse (self-host) via OTel exporter; per-call inference telemetry (tokens/wall-ms/endpoint/role) to Postgres; the escape-hatch budget ledger; versioned eval datasets, scorers, baselines, and CI regression gates. | Module + Service |
| C-16 | **zero-cache** | Zero's replication service: tails a Postgres logical-replication slot over `zero_pub` and syncs the reactive subset to the RN client. | Service (on mini) |
| C-17 | **Local Fleet + LiteLLM** | The existing Qwen fleet (`divergent`=35B-A3B, `convergent`=27B) + the new `embed`/`rerank`/`judge` routes, behind LiteLLM `:4545`. Consumed as-is. | External (tailnet) |
| C-18 | **RN App (Expo)** | The mobile client, rewritten from Convex hooks to Zero reactive hooks + SSE. Screens unchanged; data layer swapped. | Client |

**Removed vs today:** the Convex cloud backend (60 tables, 233 modules, 16 crons, the Workflow component, the `/article/` httpAction), the `convex/browser` MCP proxy + its 62 stringly-typed refs + 373-line Zod dup, the Cohere embedder, and the two dead Python/CLI clients.
