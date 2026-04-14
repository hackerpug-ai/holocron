# Epic 3: Clarification & Multi-Turn Coherence (Backend)

**Sequence**: 3 of 6
**Priority**: P0
**Wall-clock estimate**: ~7 hours (3 tasks)

## Overview

Ship the backend side of clarification behavior. Persistent `pendingIntent` mutations let the conversation survive a clarification round (user says "SF for autism" and the agent continues the original `find_recommendations` request). Ambiguous triage short-circuits specialist dispatch and emits a direct clarifying question. `HOLOCRON_SYSTEM_PROMPT` gains two new sections: "Clarification Before Tools" and "Inline vs Document Discipline".

**Why it's its own epic**: The clarification contract spans triage + orchestrator + prompt and has a distinct human test (multi-turn flow). Keeping it separate from Epic 2 preserves clean test boundaries and lets REC and CLR ship independently after Epic 1.

## Human Test Steps

1. Send "find me a career coach" in dev chat
2. Confirm agent returns a clarifying question (no tool fired, no specialist dispatched)
3. Run `npx convex run chat/telemetryQueries:listRecentClassifications '{"limit":5}'` — confirm `classificationSource` is set and `clarificationQuestion` field is populated
4. Verify `conversations` document has `pendingIntent='research'`, `pendingQueryShape='recommendation'`, `pendingSince` = recent
5. Respond "SF for autism" — agent completes a full recommendation flow with the original intent preserved
6. Verify `pendingIntent` is cleared after successful non-ambiguous turn
7. Send "Save this" with no prior savable content → agent asks "what would you like me to save?"
8. Send "what is RAG?" → agent answers inline with `answer_question`, NO document created
9. Send "deep dive into RAG" → agent runs `deep_research`, document IS created (confirm Decision Table C)

## PRD Sections Covered

- `06-uc-clr.md` — UC-CLR-01 through UC-CLR-08
- `07-uc-rel.md` — UC-REL-03 (deep_research gating), UC-REL-06 (document discipline policy)
- `09-technical-requirements.md` — pendingIntent/clearPendingIntent mutations, ambiguous short-circuit, HOLOCRON_SYSTEM_PROMPT additions, Build Sequence Tasks 7, 8

## Acceptance Criteria (Epic-level)

- [x] `setPendingIntent` / `clearPendingIntent` internal mutations exist with 30-minute expiry helper
- [x] Ambiguous triage short-circuits specialist dispatch and emits `directResponse`
- [x] `clarificationDepth` is capped deterministically at 1 (not via prompt alone)
- [x] Pending state rehydrates triage input on the next turn when fresh
- [x] Non-ambiguous turn completion clears pending state
- [x] `HOLOCRON_SYSTEM_PROMPT` has `## Clarification Before Tools` and `## Inline vs Document Discipline` sections
- [x] Document discipline signals (`save`, `comprehensive`, `deep dive`) enumerated in prompt

## Tasks

| ID      | Title                                          | Agent                | Priority | Effort | Est (min) | Depends On       |
|---------|------------------------------------------------|----------------------|----------|--------|-----------|------------------|
| CLR-001 | setPendingIntent / clearPendingIntent mutations | convex-implementer  | P0       | S      | 120       | INT-001          |
| CLR-002 | Ambiguous short-circuit + rehydrate in agent.ts | pi-agent-implementer | P0      | M      | 240       | INT-006, CLR-001 |
| REL-001 | HOLOCRON_SYSTEM_PROMPT clarification + doc rules | pi-agent-implementer| P1      | M      | 120       | REC-004, REC-005 |

**Total estimate**: ~480 minutes (~8 hours)

## Dependency Graph

```
INT-001 ── CLR-001 ─┐
                    │
INT-006 ─────────── CLR-002
                    │
REC-004 + REC-005 ── REL-001
```

CLR-001 can run immediately after Epic 1's INT-001. CLR-002 waits for INT-006 (agent.ts integration). REL-001 waits for Epic 2's REC-004 + REC-005 (to know what the specialist + continuation prompts look like).

## Blocks

- **Epic 5** (CLR-UI-002 depends on CLR-002's clarification card_data shape)
- **INT-008** (eval harness in Epic 2 needs CLR-002's short-circuit path)

## Definition of Done

1. All 3 tasks pass their verification gates
2. Human test steps above all pass in a dev environment
3. Multi-turn flow preserves intent across exactly one clarification round
4. No regression in non-ambiguous routing (factual/recommendation/comprehensive still work)
5. Commit ends at a green tree
