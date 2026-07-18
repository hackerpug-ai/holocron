---
status: In Progress
sprint: 19
agent: mastra-implementer
---

# mcp-rehost-2 — Real Postgres tool execution

Started Postgres-backed execution for 16 tools: document CRUD/share/list, FTS/hybrid search, subscription add/remove/list, and toolbelt CRUD/search/list. Subscription adds are idempotent by source identity. Real Postgres coverage is in `sprint19-mcp-rehost.test.ts`; The dispatcher now has explicit Postgres-backed handlers for all 44 manifest IDs. A real parameterized gateway suite executes all 44 over HTTP and validates successful results against the shared output schemas; stdio initialize/list/tool execution, mutation replay, cancellation, no-sampling, and frozen success fixtures are covered. `shop_products` now calls the real Jina retailer API, persists listings/status in Postgres, fails closed on missing credentials/API errors, and replays persisted results. Creator and recommendation paths remain bounded Postgres implementations and still require deeper domain verification before Sprint 19 closure.
