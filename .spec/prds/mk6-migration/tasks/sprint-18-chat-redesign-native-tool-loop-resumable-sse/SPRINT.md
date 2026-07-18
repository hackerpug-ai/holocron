---
status: Completed
sprint: 18
slug: chat-redesign-native-tool-loop-resumable-sse
---

# Sprint 18: Chat Redesign — Native Tool Loop and Resumable SSE

**Status:** Completed

## Scope

Durable `chat_runs` and `chat_run_events` provide request-id idempotency, monotonic event sequences, real fleet-bound Mastra Agent streaming, a bounded read-only `chat_context` tool grant, typed blocked/cancelled terminal events, owner-scoped Hono POST/status/cancel/SSE routes, and source-bound trace/route inspection. Independent review and the real gate passed; closure artifacts are complete.

## Gate

`POST /api/chat-runs` against real Postgres and fleet returns a durable run/message; `GET /api/chat-runs/:id/events` emits sequenced fleet tokens and terminal output; replay returns the same run/message; `Last-Event-ID` returns only unobserved events; tripwire produces a typed blocked terminal; `holo chat:trace` and `holo chat:route` show bounded loop and grants.

## Evidence

Raw evidence is under `.tmp/sprint-18-human-gate-20260718T155000Z/`; the current real run is `9d3ba639-53a0-4309-8b9c-e761181112ed`.
