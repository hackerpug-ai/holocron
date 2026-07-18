---
status: In Progress
sprint: 19
slug: mcp-gateway-rehost-44-tools-postgres
---

# Sprint 19: MCP Gateway Rehost — 44 Tools on Postgres

**Status:** In Progress

## Scope

The manifest and one shared Mastra tool registry already cover 44 tool IDs. Sprint 19 begins with `holo mcp:verify-rehost`, which proves manifest/registry parity and zero Convex gateway imports. Remaining work is to bind real Postgres tool execution, expose stdio and Streamable HTTP transports, enforce cancellation/no-sampling/origin/auth policy, and prove all-tool parity against real seeded Postgres.

## Gate

All 44 tools over stdio and Streamable HTTP return manifest-matching results against seeded Postgres; mutations replay idempotently; foreign Origin is rejected; cancellation is honored; `holo mcp:verify-rehost` reports zero Convex calls and no duplicate schema layer.

## Current evidence

`holo mcp:verify-rehost --json` passes with `manifestTools=44`, `registeredTools=44`, and empty `convexRefs`.
