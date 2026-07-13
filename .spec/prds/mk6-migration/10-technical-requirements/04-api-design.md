---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 2.0.0
---

# API Design

Three surfaces over the one Mastra service: the **Hono HTTP/SSE API** (app + public), the **MCP gateway** (agents), and the **Mission contract** (the declarative record the engine runs). All tailnet-only except `/article/`.

## Hono HTTP / SSE routes

| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/health` | Liveness/readiness (DB, fleet, queue). | tailnet |
| POST | `/api/chat-runs` | Create or idempotently retrieve a chat run from a client request ID; returns run and durable-message IDs. | tailnet + RN API key |
| GET | `/api/chat-runs/:id/events?after=<seq>` | Resumable SSE event stream; honors `Last-Event-ID`; replays only persisted events after the cursor. | tailnet + RN API key |
| POST | `/api/missions` | Start an on-demand mission from a template + args → returns run id. | tailnet + RN API key |
| GET | `/api/missions/:id` | Mission run status/output (also available reactively via Zero). | tailnet + RN API key |
| POST | `/api/missions/:id/verdicts` | Human-gate verdict (kill/advance/redirect/boost) → writes `verdicts`+`touches`; deterministic enforcement (WIP=1, cited-kill, probe-gated advance). | tailnet + RN API key |
| POST | `/api/missions/:id/steer` | Mid-run steering note → `steering` row, re-read next cycle. | tailnet + RN API key |
| POST | `/api/zero/query` | Zero query endpoint over the published subset. | tailnet + RN API key |
| POST | `/api/zero/mutate` | Zero server-mutator endpoint; validates, transacts, and deduplicates registered mutations. | tailnet + RN API key |
| POST | `/api/uploads` | Start an authoritative upload with idempotency ID and required metadata. | tailnet + RN API key |
| PUT | `/api/uploads/:id` | Stream staged upload bytes. | tailnet + RN API key |
| POST | `/api/uploads/:id/finalize` | Verify hash/length, promote content-addressed object, and atomically attach it. | tailnet + RN API key |
| GET | `/article/:shareToken` | **Public** HTML render of a shared document (ported markdown→HTML converter). | **public** (single egress) |
| GET | `/article/:shareToken/assets/:fileObjectId` | Public capability read for an asset currently attached to that public article; returns 404 when unshared/revoked. | **public** (article-scoped) |
| GET | `/blobs/:id` | Stream a blob with `Accept-Ranges`/206 Range support. | tailnet + scoped API key |
| `*` | `/mcp` | MCP 2025-11-25 Streamable HTTP mount; stdio remains a supported package entry. | tailnet + MCP API key |

## Route policy

`/article/:shareToken` and its article-scoped asset route are the only public egress. `/health` and readiness are tailnet-only. Every other application, blob, and MCP operation requires tailnet reachability plus a scoped API key. RN and MCP keys have distinct scopes, are configured from the consolidated secret source, rotate with a documented grace window, and log only a key fingerprint. This is a personal-app control plane, not RLS or multi-tenant authorization.

## Zero query, mutation, and offline contract

Convex reactive reads become Zero reactive queries over the published Postgres subset. Zero uses `ZERO_QUERY_URL` and `ZERO_MUTATE_URL` to call the query and server-mutator endpoints above; the query/mutator schemas are shared with the client registry. Simple client-visible CRUD uses a registered Zero mutator. Chat, mission start/verdict/steer, and upload initiation/finalization are authoritative Hono commands, never optimistic database mutators.

For every operation, the client-data contract declares a UUIDv7 or idempotency key, offline queueability, optimistic projection, structured validation/rejection error, conflict/version behavior, retry/dedup rule, and final Zero reconciliation. `migration_read_only` is a terminal, visible write rejection during the rollbackable soak.

## Chat run and SSE contract

`POST /api/chat-runs` accepts a client `requestId`; replaying it returns the same immutable `runId` and assistant-message ID. Events are persisted with monotonic per-run sequence and envelope `{ id: "runId:sequence", event: "delta|final|error|blocked", data }`. `GET /api/chat-runs/:id/events` resumes after its explicit cursor or `Last-Event-ID`; clients suppress duplicates and out-of-order events. The durable `chat_messages` row is authoritative: replay first fills the gap, then Zero reconciliation produces the final message exactly once.

## MCP gateway (44 tools, unchanged surface)

The 44 registered tools keep their manifest-approved names, schemas, success/error behavior, defaults, ordering, pagination, side effects, and result contracts. Each calls an **in-process Mastra tool / SQL query** instead of a Convex function by string ref. The baseline is MCP 2025-11-25 with both stdio and Streamable HTTP support; HTTP origin validation, scoped authentication, cancellation, and no-server-sampling policy are explicit compatibility-manifest fields. Tool categories: search/retrieval, documents, subscriptions, toolbelt, shop, whats-new, assimilation, creators, improvements, research.

## Mission contract (the declarative record)

The unit the Mission Engine runs — a Postgres row validated by `MissionTemplateSchema` (Zod):

```
id, version, goal,
trigger:        on-demand | standing{cron} | reactive{event},
stageGraph:     closed DSL stage IDs → code-owned executor/schema registry,
toolGrants:     string[]            // least-privilege
modelRoleBindings: { stageId → role },   // ASSAY≠CHALLENGE enforced
budgets:        { wallMs, tokens, cost, maxSteps },
gateRubric:     ref → the pure-TS Evidence Gate (or null),
humanGate:      { verdicts, wipLimit, citedKill, probeGatedAdvance } | null,
outputContract: ZodSchema           // validated on COMMIT
```

Every current pipeline is expressed as one of these; fulcrum plugs in as a `standing` template with a `gateRubric` and `humanGate` — no new platform code (see SVC-05 and the fulcrum seams). Results reference the template, compiler, executor, and schema versions in force. Unknown/incompatible versions fail before creating a run.
