---
status: In Progress
sprint: 19
slug: mcp-gateway-rehost-44-tools-postgres
---

# Sprint 19: MCP Gateway Rehost — 44 Tools on Postgres

**Status:** In Progress

## Scope

The manifest and one shared Mastra tool registry cover 44 tool IDs. `holo mcp:verify-rehost` proves manifest/registry parity and zero Convex gateway imports; the SDK stdio and stateless Streamable HTTP transports are mounted, and all 44 IDs have explicit gateway dispatch. Remaining work is manifest-fixture parity for every call, deeper domain behavior verification, mutation replay coverage, and cancellation/no-sampling proof against real seeded Postgres.

## Gate

All 44 tools over stdio and Streamable HTTP return manifest-matching results against seeded Postgres; mutations replay idempotently; foreign Origin is rejected; cancellation is honored; `holo mcp:verify-rehost` reports zero Convex calls and no duplicate schema layer.

## Current evidence

`holo mcp:verify-rehost --json` passes with `manifestTools=44`, `registeredTools=44`, and empty `convexRefs`.
