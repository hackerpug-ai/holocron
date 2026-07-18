---
status: In Progress
sprint: 19
agent: mastra-implementer
---

# mcp-rehost-2 — Real Postgres tool execution

Started Postgres-backed execution for `get_document`, `list_documents`, `store_document`, `update_document`, `share_document`, `search_fts`, `hybrid_search`, `add_subscription`, `remove_subscription`, and `list_subscriptions`, including mutation idempotency for subscriptions. Real Postgres coverage is in `sprint19-mcp-rehost.test.ts`; the remaining 34 tools must be migrated before closure.
