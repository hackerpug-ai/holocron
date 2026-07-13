---
stability: FEATURE_SPEC
last_validated: 2026-07-13
prd_version: 1.0.0
functional_group: SVC
---

# Use Cases: Backend Services & Mission Engine (SVC)

| ID | Title | Description |
|----|-------|-------------|
| UC-SVC-01 | Mission Engine | A declarative mission-template engine on durable, resumable Mastra workflows with Postgres run-state. |
| UC-SVC-02 | Pipelines as templates | Every agentic pipeline re-expressed as a template/agent, collapsing the copy-pasted per-domain modules. |
| UC-SVC-03 | Chat redesign | The triage→specialists→tool-switch loop rebuilt as a Mastra agent with native in-SDK tool use and real SSE streaming. |
| UC-SVC-04 | MCP rehost & public endpoint | The 44-tool MCP gateway calling in-process Mastra tools (stateless), and the public `/article/` endpoint on Hono. |
| UC-SVC-05 | Human gate, steering & fulcrum seams | Deterministic human-gate/steering/approval, plus the exact seams fulcrum plugs into as a mission template. |

---

## UC-SVC-01: Mission Engine

A mission is a declarative template (Postgres row + Zod: goal, trigger, stage graph, tool grants, model-role bindings, budgets, gate rubric, human-gate, output contract) instantiated as a Mastra workflow run with durable Postgres state — surviving process death and resuming from the last committed step.

**Acceptance Criteria**
- ☐ System can run a mission end-to-end from a declarative contract row and produce the contract's typed output, verified against real Postgres on a live Mastra server.
- ☐ System can resume a killed mission run (SIGKILL mid-run) from its last committed step, losing at most the in-flight step, with state rehydrated from Postgres.
- ☐ System can guarantee a cycle COMMIT is all-or-nothing (one transaction) with idempotency-key replay returning the stored result, verified by a kill-9 mid-commit test producing no partial rows.
- ☐ System can enforce per-run budgets (wall-ms, tokens, cost, max-steps) and record an explicit `budget_exceeded` outcome on breach (never a silent non-commit).

---

## UC-SVC-02: Pipelines as templates

Research, deepResearch, whatsNew, assimilate, shop, subscriptions, and the four business pipelines are re-expressed as mission templates or agents on the one engine — research/deepResearch/subscriptions-research/fulcrum sharing one evidence-research core, the four business pipelines collapsing to one parameterized report template (whose reasoning re-homes from client-side Claude skills onto the local fleet).

**Acceptance Criteria**
- ☐ System can run the research, whatsNew, assimilate, shop, and subscription pipelines as templates/agents on the one engine, each producing its former output shape against real Postgres + real fleet.
- ☐ System can run the four former business pipelines (revenue-validation, competitive-analysis, ai-roi, flights) from one parameterized report template, with their reasoning executed server-side on the fleet (no client-side Claude skill).
- ☐ A reviewer can confirm the per-domain copy-pasted pipeline modules are gone, replaced by shared templates + the tool/schema registry.
- ☐ System can run a standing mission (e.g. subscriptions) that invokes the shared research template as a sub-workflow and publishes a document.

---

## UC-SVC-03: Chat redesign

The chat loop (triage on `divergent` → 10 specialists as sub-agents → native in-SDK agentic tool use replacing the 23-case switch + `scheduler.runAfter` chaining) streams real tokens over SSE while persisting durable message rows that Zero pushes reactively — preserving the app's reactive-row UX and adding true token streaming.

**Acceptance Criteria**
- ☐ User can send a chat message and receive a streamed token response over SSE from a specialist agent running on the local fleet.
- ☐ System can run the agentic tool loop natively (bounded by `maxSteps` + budget + tripwire) with no manual `scheduler.runAfter` chaining and no fixed 23-case tool switch.
- ☐ User can reconnect mid-response and see the durable assistant message continue from Postgres via Zero (streaming survives disconnect).
- ☐ System can route triage and each specialist to its bound fleet role (fast `divergent` router, appropriate specialist model) with least-privilege tool grants.

---

## UC-SVC-04: MCP rehost & public endpoint

The existing 44-tool `@mastra/mcp` gateway stops proxying Convex and calls in-process Mastra tools — stateless per the 2026-07-28 MCP revision, with the duplicate Zod validation layer deleted. The public `/article/{shareToken}` endpoint is re-hosted on Hono with the markdown→HTML converter ported verbatim so existing share links survive.

**Acceptance Criteria**
- ☐ Agent Client can invoke all 44 registered MCP tools and receive Postgres-backed results identical in shape to the Convex era, with the gateway making zero Convex calls.
- ☐ System can serve the MCP gateway statelessly (streamable HTTP, no server→client sampling) with zero `"module:fn" as any` Convex references remaining in `holocron-mcp/src/`.
- ☐ Public Reader can open a `/article/{shareToken}` link and receive the same HTML the Convex endpoint produced, verified byte-comparable on a sample document.
- ☐ A reviewer can confirm the 373-line duplicate Zod validation layer is gone (tools carry their schemas from the shared registry).

---

## UC-SVC-05: Human gate, steering & fulcrum seams

Human-gate verdicts, mid-run steering, and approvals are enforced deterministically in Postgres-writing handlers (not by model choice), and the Mission Engine exposes the exact seams — mission-contract records, the append-only ledger, the pure-TS evidence gate, role bindings with ASSAY≠CHALLENGE, and an idempotent document-publish path — that let fulcrum become one standing mission template.

**Acceptance Criteria**
- ☐ System can enforce the human gate deterministically — reject an uncited kill, refuse a second concurrent build (WIP=1), refuse `advance→validated` without a recorded probe — against the real append-only ledger.
- ☐ Operator can steer a running mission mid-flight (write a steering row) and see it take effect on the following cycle without restarting the workflow.
- ☐ System can guarantee the CHALLENGE model instance differs from the ASSAY instance within the same cycle, with refuting claims passing the identical admission gate as supporting ones.
- ☐ A reviewer can confirm the Mission Engine exposes fulcrum's integration seams (contract record, ledger tables, evidence-gate step, role bindings, idempotent publish to `documents`) such that fulcrum can be authored as a template with no new platform code.
