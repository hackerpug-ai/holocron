# Epic 2: Recommendation Engine (Backend + MCP + Eval)

**Sequence**: 2 of 6
**Priority**: P0
**Wall-clock estimate**: ~18 hours (7 tasks)

## Overview

Ship the core fix for the canonical failing query. Add a new `find_recommendations` Vercel AI SDK tool with structured params, build a synchronous Convex action (`findRecommendationsAction`) that calls Jina Search + Reader + zaiPro synthesis + Zod validation, rewrite the research specialist prompt to prioritize it, wire it through the tool executor with a continuation hint, expose it via the holocron MCP server, and lock in regression protection with a 30+ fixture eval harness that hard-asserts the canonical failing case.

**This is the epic where the canonical failing case finally routes correctly.** After this epic, `"career coaches for people with autism in San Francisco — provide 3-5 highly rated referrals"` returns 5 named coaches with contact info — inline, no document — verified by CI.

## Human Test Steps

1. Run `pnpm vitest run convex/chat/eval` — 90%+ accuracy across 30+ fixtures; canonical failing case hard-asserts to `find_recommendations`
2. Run `npx convex run research/actions:findRecommendations '{"query":"career coaches for autism in SF","count":5}'` — returns 3+ named items in under 30s, no document created
3. Send the canonical failing query in dev chat, inspect telemetry — `toolsCalled=['find_recommendations']`, `specialistUsed='research'`
4. Verify `documents` table unchanged (no KB pollution)
5. Run `cd holocron-mcp && bun run build` — exits 0, stdio.ts logs "43 tools"
6. From a Claude Code session: call `mcp__holocron__findRecommendationsTool` with a recommendation query, verify structured response
7. Send a `deep_research` trigger ("deep dive into quantum computing") — confirm it still routes to `deep_research` and DOES create a document (no regression)

## PRD Sections Covered

- `05-uc-rec.md` — UC-REC-01 through UC-REC-06, UC-REC-11
- `04-uc-int.md` — UC-INT-06 (queryShape specialist hint), UC-INT-10 (eval harness)
- `09-technical-requirements.md` — find_recommendations tool, findRecommendationsAction, RECOMMENDATION_SYNTHESIS_PROMPT, Build Sequence Tasks 9–12, 14

## Acceptance Criteria (Epic-level)

- [ ] `find_recommendations` tool registered in `researchTools` subset with 3-7 count constraint
- [ ] `RECOMMENDATION_SYNTHESIS_PROMPT` + Zod schema produce structured output with fabrication guardrails
- [ ] `findRecommendationsAction` runs synchronously under 30s with AbortController cap; never creates a document
- [ ] `RESEARCH_SPECIALIST_PROMPT` prioritizes `find_recommendations` for recommendation queryShape
- [ ] `agent.ts` injects queryShape preamble when dispatching to research specialist
- [ ] Tool executor case returns `result_card` with `card_type='recommendation_list'`
- [ ] Continuation hint prevents re-rendering or re-searching
- [ ] Eval harness: 30+ fixtures, ≥90% accuracy, canonical case hard-asserts, runs <60s mocked
- [ ] MCP server exposes `findRecommendationsTool` and tool count bumps 42→43

## Tasks

| ID        | Title                                              | Agent                 | Priority | Effort | Est (min) | Depends On                         |
|-----------|----------------------------------------------------|-----------------------|----------|--------|-----------|------------------------------------|
| REC-001   | find_recommendations tool schema (Vercel AI SDK)   | pi-agent-implementer  | P0       | S      | 60        | INT-001                            |
| REC-002   | RECOMMENDATION_SYNTHESIS_PROMPT + Zod schema       | pi-agent-implementer  | P0       | M      | 150       | INT-001                            |
| REC-003   | findRecommendationsAction (sync, 30s cap)          | convex-implementer    | P0       | L      | 300       | INT-001, REC-001, REC-002          |
| REC-004   | RESEARCH_SPECIALIST_PROMPT + queryShape hint       | pi-agent-implementer  | P0       | M      | 180       | INT-006, REC-002                   |
| REC-005   | Tool executor wiring + continuation hint           | pi-agent-implementer  | P0       | M      | 150       | REC-001, REC-003, REC-004          |
| INT-008   | Eval fixtures + runner + CI gate (30+ queries)     | pi-agent-implementer  | P0       | L      | 300       | INT-006, REC-005, CLR-002 (Epic 3) |
| REC-MCP-01| findRecommendationsTool on holocron-mcp            | mcp-implementer       | P1       | M      | 150       | REC-003                            |

**Total estimate**: ~1290 minutes (~21.5 hours)

## Dependency Graph

```
(Epic 1 complete)
  │
  ├── REC-001 ─┐
  ├── REC-002 ─┼── REC-003 ── REC-MCP-01
  │            │       │
  │            │       └────┐
  │            └────────── REC-004 ── REC-005 ── INT-008
  │                                      │
  │                                      └─── (needs CLR-002 from Epic 3)
```

Note: INT-008 (eval harness) is in Epic 2 because it gates the REC fix, but its CLR-002 dependency means it can only run after Epic 3 lands. Execution: build Epic 2 tasks 1-5 + REC-MCP-01, run Epic 3, then run INT-008 as the verification gate.

Parallelizable within Epic 2: REC-001 + REC-002 (both depend only on INT-001). REC-MCP-01 runs parallel to REC-004/005 after REC-003.

## Blocks

- **Epic 4** (REC-UI-001 depends on REC-003's cardData shape; INT-UI-001 depends on REC-UI-005 which needs it)

## Definition of Done

1. All 7 tasks pass their verification gates (tsc, lint, vitest, convex dev, bun run build)
2. Canonical failing case is asserted by CI eval suite
3. Human test steps above all pass in a dev environment
4. No regression in existing research specialist flows (answer_question, deep_research still work)
5. MCP server lists 43 tools on startup
6. Commit ends at a green tree
