---
status: Completed
sprint: 18
agent: mastra-implementer
---

# chat-2 — Resumable SSE

Implemented Hono `GET /api/chat-runs/:id/events` with `Last-Event-ID` gap replay, durable token/terminal events, monotonic IDs, and terminal-aware close. Real response bytes and replay evidence are in `chat-run-fixed.json`.
