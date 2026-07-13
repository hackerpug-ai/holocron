---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 2.0.0
---

# PRD Consistency Contract

A build gate derives—not hand-copies—the documented counts and references from authoritative PRD artifacts. It verifies unique UC IDs, every acceptance criterion’s test coverage, test-criterion totals/type totals, 44 MCP manifest entries, 60 source-table catalog entries, legacy storage entries, legacy hook/action mappings, technical-section index links, and version/date claims.

The gate fails on a future-dated protocol claim, a stale quick-stat total, an unmapped legacy surface, or a broken index/cross-reference. The E2E criteria summary and root README statistics are regenerated from its output.
