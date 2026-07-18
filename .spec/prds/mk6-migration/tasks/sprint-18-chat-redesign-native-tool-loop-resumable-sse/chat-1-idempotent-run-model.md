---
status: Completed
sprint: 18
agent: mastra-implementer
---

# chat-1 — Idempotent chat run model

Implemented migration `0021_chat_runs_sse.sql`, durable run/message identifiers, owner-scoped request-id uniqueness, status/error fields, step budget, and monotonic event sequence storage. Real Postgres evidence is in `chat-run-fixed.json` and `chat-trace.json`.
