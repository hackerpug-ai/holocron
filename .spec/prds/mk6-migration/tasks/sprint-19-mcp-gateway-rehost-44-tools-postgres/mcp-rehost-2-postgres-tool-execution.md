---
status: In Progress
sprint: 19
agent: mastra-implementer
---

# mcp-rehost-2 — Real Postgres tool execution

Started Postgres-backed execution for 16 tools: document CRUD/share/list, FTS/hybrid search, subscription add/remove/list, and toolbelt CRUD/search/list. Subscription adds are idempotent by source identity. Real Postgres coverage is in `sprint19-mcp-rehost.test.ts`; The dispatcher now has explicit Postgres-backed handlers for all 44 manifest IDs. A real parameterized gateway suite executes all 44 over HTTP, and mutation/state/cancellation/no-sampling probes pass. Core document/search/subscription/toolbelt/research/improvement/assimilation handlers are real; shop/creator/recommendation handlers remain bounded Postgres queue/read paths and still require frozen fixture output parity and deeper domain verification before Sprint 19 closure.
