---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 1.0.0
---

# API Design

Three surfaces over the one Mastra service: the **Hono HTTP/SSE API** (app + public), the **MCP gateway** (agents), and the **Mission contract** (the declarative record the engine runs). All tailnet-only except `/article/`.

## Hono HTTP / SSE routes

| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/health` | Liveness/readiness (DB, fleet, queue). | tailnet |
| POST | `/api/chat` | Send a message; **SSE** token stream back; durable message rows persisted (Zero-synced). | tailnet |
| POST | `/api/missions` | Start an on-demand mission from a template + args → returns run id. | tailnet |
| GET | `/api/missions/:id` | Mission run status/output (also available reactively via Zero). | tailnet |
| POST | `/api/missions/:id/verdicts` | Human-gate verdict (kill/advance/redirect/boost) → writes `verdicts`+`touches`; deterministic enforcement (WIP=1, cited-kill, probe-gated advance). | tailnet |
| POST | `/api/missions/:id/steer` | Mid-run steering note → `steering` row, re-read next cycle. | tailnet |
| GET | `/article/:shareToken` | **Public** HTML render of a shared document (ported markdown→HTML converter). | **public** (single egress) |
| GET | `/blobs/:id` | Stream an MP3/image blob with `Accept-Ranges`/206 Range support. | tailnet |
| `*` | `/mcp` | MCP streamable-HTTP mount (stateless). | tailnet |

Convex reactive `useQuery` reads are **not** HTTP endpoints — they become **Zero reactive queries** against the published Postgres subset (see Data Schema). Writes go through `/api/*` (or Zero custom mutators calling the server), keeping the server authoritative.

## MCP gateway (44 tools, unchanged surface)

The 44 registered tools keep their names, input Zod schemas, and result shapes (Agent Client contract is preserved). What changes is the backend: each tool calls an **in-process Mastra tool / SQL query** instead of a Convex function by string ref. Stateless per the 2026-07-28 MCP revision (capabilities per-request, no sessions, no server→client sampling — the fleet does inference server-side). Tool categories: search/retrieval, documents, subscriptions, toolbelt, shop, whats-new, assimilation, creators, improvements, research.

## Mission contract (the declarative record)

The unit the Mission Engine runs — a Postgres row validated by `MissionTemplateSchema` (Zod):

```
id, version, goal,
trigger:        on-demand | standing{cron} | reactive{event},
stageGraph:     workflow spec → compiled to createWorkflow(...).commit(),
toolGrants:     string[]            // least-privilege
modelRoleBindings: { stageId → role },   // ASSAY≠CHALLENGE enforced
budgets:        { wallMs, tokens, cost, maxSteps },
gateRubric:     ref → the pure-TS Evidence Gate (or null),
humanGate:      { verdicts, wipLimit, citedKill, probeGatedAdvance } | null,
outputContract: ZodSchema           // validated on COMMIT
```

Every current pipeline is expressed as one of these; fulcrum plugs in as a `standing` template with a `gateRubric` and `humanGate` — no new platform code (see SVC-05 and the fulcrum seams). Results reference the template `version` in force.
