---
name: Functional Groups
description: Four functional groups consolidating contributions from convex-planner, pi-agent-planner, frontend-designer, and react-native-ui-planner
stability: FEATURE_SPEC
last_validated: 2026-04-11
prd_version: 1.0.0
---

# Functional Groups

This PRD has 4 functional groups. Each group consolidates contributions from multiple planners (convex-planner, pi-agent-planner, frontend-designer, react-native-ui-planner) into a coherent, end-to-end vertical slice.

| # | Name | Prefix | Description |
|---|------|--------|-------------|
| 1 | Intent Classification, Routing & Telemetry | `INT` | The triage classifier emits `queryShape` alongside `intent` in a single LLM call. Deterministic regex pre-filter overrides the LLM on high-precision recommendation patterns. Per-turn telemetry captures every routing decision. Eval harness asserts on the canonical failing case. |
| 2 | Recommendation Engine + MCP Exposure | `REC` | New `find_recommendations` tool with structured params (query, count, location, constraints). Synchronous Convex action that calls Jina + zaiFlash + structured JSON synthesis. Strict markdown numbered-list output via `RECOMMENDATION_SYNTHESIS_PROMPT`. New `RecommendationListCard` mobile component with tap-to-call/website/maps. New `findRecommendationsTool` exposed via the holocron MCP server for external clients. |
| 3 | Clarification & Multi-Turn Coherence | `CLR` | When `queryShape === "ambiguous"`, the triage emits a focused clarifying question via `directResponse` in the same LLM call. Hard cap at `clarificationDepth = 1`. Persistent `pendingIntent` and `pendingQueryShape` on the `conversations` table preserve original intent across clarification rounds. New `ClarificationMessage` mobile component with quick-reply chips. |
| 4 | Reliability, Activity & Document Discipline | `REL` | Decision tables enforce tool selection consistency. Tools (not specialists) decide document creation. `answer_question` and `find_recommendations` never create documents. `deep_research` is gated on explicit user signal. New `AgentActivityIndicator` component shows phase-aware activity (triage → tool execution → synthesis). New `DocumentDisciplineFooter` component shows "Saved to KB" inline or "Save this to KB" quick-action. |

## Use Case Summary

| Group | UCs | Acceptance Criteria | Spans |
|-------|-----|---------------------|-------|
| INT — Intent Classification, Routing & Telemetry | 11 | ~50 | Backend (8) + Agent design (3) |
| REC — Recommendation Engine + MCP Exposure | 11 | ~55 | Backend (5) + Mobile components (5) + MCP (1) |
| CLR — Clarification & Multi-Turn Coherence | 10 | ~40 | Backend (4) + Agent design (3) + Mobile components (3) |
| REL — Reliability, Activity & Document Discipline | 9 | ~35 | Agent design (5) + Mobile components (4) |
| **Total** | **41** | **~180** | — |

## Cross-Group Dependencies

```
INT (intent + queryShape + telemetry)
   │
   │ supplies queryShape hint to
   ▼
REC (find_recommendations tool, RecommendationListCard)
   │
   │ shares pendingIntent persistence with
   ▼
CLR (ClarificationMessage, multi-turn coherence)
   │
   │ shares document discipline rules with
   ▼
REL (AgentActivityIndicator, DocumentDisciplineFooter)
```

INT must ship first because every other group depends on `queryShape` being available. REC and CLR can ship in parallel after INT. REL ships last because it depends on stable card_data shapes from REC and CLR.

## Build Order Rationale

The `09-technical-requirements.md` file contains a 20-task build sequence. The dependency order is:

1. **Schema and types** (additive, non-breaking) — enables every other change
2. **Triage extension** (queryShape field, defensive validation) — enables intent routing improvements
3. **Regex backstop and triage prompt rewrite** — enables the failing case fix
4. **Telemetry mutation + queries** — enables eval harness
5. **Pending state mutations** — enables clarification multi-turn
6. **Find recommendations tool + action + specialist prompt** — implements the core fix
7. **Tool executor wiring** — connects the agent to the new tool
8. **Mobile UI components** (ClarificationQuickReplyChip → ClarificationMessage → RecommendationItem → RecommendationListCard → AgentActivityIndicator → DocumentDisciplineFooter)
9. **ChatThread integration** — wires the new components into the existing chat dispatcher
10. **MCP exposure** — makes the new tool available to external clients
11. **Eval fixtures + runner + CI gate** — locks in regression protection
12. **Telemetry retention cron** — prevents unbounded growth
13. **End-to-end smoke test on device** — verifies the full flow
