---
status: Completed
sprint: 19
agent: red-test-generator
---

# mcp-rehost-4 — Parity and mutation replay tests

Added a real seeded-Postgres suite that executes all 44 manifest tools over HTTP, exercises stdio initialize/list/tool execution, validates all frozen success fixtures against shared output schemas, verifies auth/foreign Origin, no-sampling rejection, pre-abort cancellation, hybrid search, live retailer persistence, and mutation replay. The runtime now serializes typed error codes, persists cancelled retailer sessions, queues creator transcript jobs against Postgres, and executes recommendations through live Jina search. Independent committed-HEAD review passed with zero blockers; replay fixture parity is enforced by `mcp:verify-manifest`.
