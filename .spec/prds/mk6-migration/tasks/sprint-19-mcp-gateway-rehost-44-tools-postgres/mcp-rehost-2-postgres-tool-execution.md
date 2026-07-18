---
status: Completed
sprint: 19
agent: mastra-implementer
---

# mcp-rehost-2 — Real Postgres tool execution

The dispatcher has explicit Postgres-backed handlers for all 44 manifest IDs. The real gate executes all 44 over HTTP, validates successful results and frozen fixtures against shared schemas, proves stdio execution, and covers replay, cancellation, no-sampling, and typed errors. `shop_products` calls the real Jina retailer API, persists listings/status in Postgres, fails closed on missing credentials/API errors, and replays by the full effective input. `findRecommendations` uses live Jina search, and creator assimilation queues durable transcript jobs. See `GATE-RESULTS.md` and `gate-verification.json`.
