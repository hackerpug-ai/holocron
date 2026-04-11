# Epic 1: Triage Intelligence & Telemetry Backbone

**Sequence**: 1 of 6
**Priority**: P0
**Wall-clock estimate**: ~12 hours (7 tasks)

## Overview

Extend the chat triage classifier to emit `queryShape` alongside `intent`, add a deterministic regex pre-filter that overrides the LLM on high-precision recommendation patterns, and capture every routing decision to a new `agentTelemetry` table. This is the backbone — every other epic depends on `queryShape` being available and telemetry being observable.

**The first provable slice**: Even before the `find_recommendations` tool exists (Epic 2), this epic makes the canonical failing query observable: the user can send the query, inspect telemetry, and see `queryShape='recommendation'` being emitted.

## Human Test Steps

1. Run `npx convex dev --once` — schema deploys cleanly, no validation errors
2. Send the canonical failing query in dev chat: *"career coaches for people with autism in San Francisco — provide 3-5 highly rated referrals"*
3. Run `npx convex run chat/telemetryQueries:listRecentClassifications '{"limit":5}'`
4. Confirm the most recent row shows `queryShape='recommendation'`, `intent='research'`, `classificationSource='regex'` (or `'llm'`)
5. Run `npx convex run chat/telemetryQueries:findDivergences '{"limit":10}'` and confirm any regex overrides are surfaced
6. Confirm `clarificationQuestion` is empty (no clarification yet — that's Epic 3)
7. Verify existing chat flows (non-recommendation queries) still work unaffected

## PRD Sections Covered

- `00-overview.md` — triage intelligence motivation
- `01-scope.md` — Backend/Convex scope
- `04-uc-int.md` — all 11 INT use cases (UC-INT-01 through UC-INT-11)
- `09-technical-requirements.md` — schema deltas, TRIAGE_SYSTEM_PROMPT delta, Build Sequence Tasks 1–6, 13

## Acceptance Criteria (Epic-level)

- [ ] `agentTelemetry` table deployed with 5 indexes; 3 optional `pending*` fields added to `conversations`
- [ ] `regexClassify()` is a pure module (zero Convex imports) with ≥15 unit tests and <5ms perf
- [ ] `classifyIntent()` returns `queryShape` on every call with defensive fallback to `'factual'` on invalid values
- [ ] `TRIAGE_SYSTEM_PROMPT` contains `## Query Shape` section + ≥7 few-shots including the canonical case
- [ ] `recordTriage` internalMutation validates all args, truncates `rawLlmResponse` to 2000 chars
- [ ] `agent.ts` wires regex + LLM + telemetry in every turn; regex wins on disagreement
- [ ] Telemetry inspection queries use `withIndex` only (no `.filter()`)
- [ ] Canonical failing query logs a telemetry row with `queryShape='recommendation'`

## Tasks

| ID      | Title                                          | Agent              | Priority | Effort | Est (min) | Depends On     |
|---------|------------------------------------------------|--------------------|----------|--------|-----------|----------------|
| INT-001 | Schema delta (agentTelemetry + pending fields) | convex-implementer | P0       | S      | 90        | —              |
| INT-002 | Triage regex pre-filter (pure module)          | pi-agent-implementer | P0     | S      | 120       | INT-001        |
| INT-003 | Triage QueryShape type + validated parser      | pi-agent-implementer | P0     | S      | 120       | INT-001        |
| INT-004 | TRIAGE_SYSTEM_PROMPT rewrite w/ taxonomy       | pi-agent-implementer | P0     | M      | 150       | INT-003        |
| INT-005 | Telemetry mutations (recordTriage)             | convex-implementer | P0       | S      | 90        | INT-001        |
| INT-006 | Triage integration in agent.ts                 | pi-agent-implementer | P0     | M      | 180       | INT-002, 003, 004, 005 |
| INT-007 | Telemetry inspection queries                   | convex-implementer | P1       | S      | 120       | INT-005        |

**Total estimate**: ~870 minutes (~14.5 hours)

## Dependency Graph

```
INT-001
  ├── INT-002 ────┐
  ├── INT-003 ── INT-004 ──┐
  └── INT-005 ─────────────┼── INT-006
                           │
      INT-005 ── INT-007 (parallel with INT-006)
```

Parallelizable: INT-002 + INT-003 (after INT-001), INT-007 (after INT-005 alongside INT-006).

## Blocks

- **Epic 2** (REC-004, REC-005 need INT-006's telemetry dispatch path)
- **Epic 3** (CLR-002 needs INT-006's pending-rehydrate hook)

## Definition of Done

1. All 7 tasks pass their verification gates (tsc, lint, vitest, convex dev)
2. Human test steps above all pass in a dev environment
3. No regressions in existing `convex/chat/*` tests
4. Commit ends at a green tree
