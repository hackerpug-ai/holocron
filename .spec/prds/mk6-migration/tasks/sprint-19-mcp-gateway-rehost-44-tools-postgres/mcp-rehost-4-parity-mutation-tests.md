---
status: In Progress
sprint: 19
agent: red-test-generator
---

# mcp-rehost-4 — Parity and mutation replay tests

Added a real seeded-Postgres suite that executes all 44 manifest tools over HTTP, exercises stdio initialize/list/tool execution, validates all frozen success fixtures against shared output schemas, verifies auth/foreign Origin, no-sampling rejection, pre-abort cancellation, hybrid search, live retailer persistence, and mutation replay. Remaining closure work is frozen error-fixture/runtime comparison and long-running cancellation, plus independent review of creator/recommendation domain parity.
