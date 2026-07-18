---
status: In Progress
sprint: 19
agent: mastra-implementer
---

# mcp-rehost-2 — Real Postgres tool execution

Started Postgres-backed execution for 16 tools: document CRUD/share/list, FTS/hybrid search, subscription add/remove/list, and toolbelt CRUD/search/list. Subscription adds are idempotent by source identity. Real Postgres coverage is in `sprint19-mcp-rehost.test.ts`; the remaining 28 tools must be migrated before closure.
