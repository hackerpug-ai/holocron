# GATE-FIX-holo-search-cli — Wire holo search / search:recall / --explain / --surface for human testing gate
> Status: ✅ Completed
> Cycle: 1
> Commit: 323b2e3bc72e65786fb0146b6fd0bec0c91fa4b6
> Reviewer: mastra-reviewer
> Completed: 2026-07-17T17:44:33Z

## What this does

Wire operator CLI commands required by Sprint 10 Human Testing Gate so an operator can run past-8K RRF search, explain, recall, and surface KNN against real Postgres without cloud.

Provides: `holo search <query>` (rrfHybridSearch), `holo search --explain` (RRF explain output), `holo search:recall --golden <file>`, `holo search --surface <name> <query>` (searchSurface)

## Why

- MUST Expose search-3 rrfHybridSearch + searchSurface via holo CLI for human gate steps 3–5 and 7
- MUST Use real fleet query-mode embed + real Postgres (no mocks)
- NEVER Call Cohere/cloud embedding hosts
- STRICTLY Follow holo.ts switch/case pattern used by embed:run

## How to verify

- `bun services/platform/src/cli/holo.ts search "how to combine vector and keyword rankings in one database query" --json` → top result title includes Local Re-embedding
- `bun services/platform/src/cli/holo.ts search "q" --explain --json` → shows RRF fusion detail
- `bun services/platform/src/cli/holo.ts search --surface research_findings "MLX prefill" --json` → results with searchMethod hnsw:research_findings
- Integration/smoke exits 0

## Scope

Writes: services/platform/src/cli/holo.ts (MODIFY — search, search:recall, flags) · optionally services/platform/tests/integration/holo-search-cli.test.ts (NEW)

Prohibited: services/platform/src/search/** (consume only) · services/platform/src/inference/**

## Acceptance Criteria

- [ ] AC-1: `holo search '<span-query>'` returns golden past-8K doc in top-k via RRF
- [ ] AC-2: `holo search --explain` shows pgvector+FTS RRF fusion (one round-trip)
- [ ] AC-3: `holo search --surface research_findings '<q>'` returns results without Cohere
- [ ] AC-4: `holo search:recall --golden <set.json>` prints recall figure (or documented golden path)

## Test Criteria

- TC-1 maps AC-1
- TC-2 maps AC-2
- TC-3 maps AC-3
- TC-4 maps AC-4

AGENT: mastra-implementer
STATUS: Backlog
TDD_MODE: skipped
