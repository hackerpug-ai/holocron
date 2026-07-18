---
status: Completed
sprint: 19
slug: mcp-gateway-rehost-44-tools-postgres
---

# Sprint 19: MCP Gateway Rehost — 44 Tools on Postgres

**Status:** Completed

## Scope

The manifest and one shared Mastra tool registry cover 44 tool IDs. `holo mcp:verify-rehost` proves manifest/registry parity and zero Convex gateway imports; SDK stdio and stateless Streamable HTTP transports are mounted; all 44 IDs have explicit Postgres dispatch; live shop/recommendation/creator paths, replay, typed errors, cancellation, auth/origin, and no-sampling are covered by the real gate.

## Gate

All 44 tools over stdio and Streamable HTTP return manifest-matching results against seeded Postgres; mutations replay idempotently; foreign Origin is rejected; cancellation is honored; `holo mcp:verify-rehost` reports zero Convex calls and no duplicate schema layer.

## Current evidence

Gate artifacts: `gate-results.json` and `gate-verification.json` are PASS at source HEAD `f3c8f42`; independent review is `.tmp/sprint-19-independent-review-final.md`; raw evidence is `.tmp/sprint-19-human-gate-20260718T113900Z/`.
