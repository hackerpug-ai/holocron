# Smarter Chat Agent — Task Index

**Project**: Holocron (Expo React Native + Convex + holocron-mcp)
**Feature**: Smarter Chat Agent — intent classification, recommendation engine, clarification, document discipline
**PRD**: `.spec/prd/smarter-chat-agent/`
**Generated**: 2026-04-11
**Appetite**: 6 weeks (full polish)

## Overview

| Metric            | Value                                                   |
|-------------------|---------------------------------------------------------|
| Total epics       | 6                                                       |
| Total tasks       | 33                                                      |
| Avg quality score | ~105/115 (all tasks pass min 80 threshold)             |
| PRD coverage      | 100% (all 41 UCs + 7 technical sections mapped)         |
| Wall-clock        | ~70 hours sequential, ~45 hours parallelized           |
| Agents used       | pi-agent-implementer, convex-implementer, mcp-implementer, react-native-ui-implementer |

## Anchor Success Criterion

After all 6 epics ship, the canonical failing query:

> *"career coaches for people with autism in San Francisco — provide 3-5 highly rated referrals"*

must route to `find_recommendations` with `queryShape='recommendation'`, render a `RecommendationListCard` with 5 named coaches inline, create zero documents, and be asserted by the CI eval harness in Epic 2.

## Epic Sequence

### Epic 1 — Triage Intelligence & Telemetry Backbone
- **Folder**: [epic-1-triage-intelligence/](epic-1-triage-intelligence/)
- **Tasks**: 7 · Wall-clock: ~12h · Priority: P0
- **Human Test**: Send canonical query → inspect telemetry via `npx convex run chat/telemetryQueries:listRecentClassifications` → confirm `queryShape='recommendation'` emitted
- **PRD**: `04-uc-int.md` (UC-INT-01..11), schema deltas
- **Blocks**: Epic 2, Epic 3

| ID       | Title                                          | Agent              | Depends On           |
|----------|------------------------------------------------|--------------------|----------------------|
| INT-001  | Schema delta (agentTelemetry + pending fields) | convex             | —                    |
| INT-002  | Triage regex pre-filter (pure module)          | pi-agent           | INT-001              |
| INT-003  | Triage QueryShape type + validated parser      | pi-agent           | INT-001              |
| INT-004  | TRIAGE_SYSTEM_PROMPT rewrite                   | pi-agent           | INT-003              |
| INT-005  | Telemetry mutations                            | convex             | INT-001              |
| INT-006  | Triage integration in agent.ts                 | pi-agent           | INT-002,003,004,005  |
| INT-007  | Telemetry inspection queries                   | convex             | INT-005              |

### Epic 2 — Recommendation Engine (Backend + MCP + Eval)
- **Folder**: [epic-2-recommendation-engine/](epic-2-recommendation-engine/)
- **Tasks**: 7 · Wall-clock: ~18h · Priority: P0
- **Human Test**: `pnpm vitest run convex/chat/eval` → 90%+ accuracy + canonical case asserts; `npx convex run research/actions:findRecommendations` → structured result in <30s
- **PRD**: `05-uc-rec.md` (UC-REC-01..06, 11), UC-INT-10
- **Depends on**: Epic 1. **Blocks**: Epic 4

| ID          | Title                                              | Agent     | Depends On                  |
|-------------|----------------------------------------------------|-----------|-----------------------------|
| REC-001     | find_recommendations tool schema                   | pi-agent  | INT-001                     |
| REC-002     | RECOMMENDATION_SYNTHESIS_PROMPT + Zod              | pi-agent  | INT-001                     |
| REC-003     | findRecommendationsAction (sync, 30s cap)          | convex    | INT-001, REC-001, REC-002   |
| REC-004     | RESEARCH_SPECIALIST_PROMPT + queryShape hint       | pi-agent  | INT-006, REC-002            |
| REC-005     | Tool executor wiring + continuation hint           | pi-agent  | REC-001, REC-003, REC-004   |
| INT-008     | Eval fixtures + runner + CI gate                   | pi-agent  | INT-006, REC-005, CLR-002   |
| REC-MCP-01  | findRecommendationsTool on holocron-mcp            | mcp       | REC-003                     |

### Epic 3 — Clarification & Multi-Turn Coherence (Backend)
- **Folder**: [epic-3-clarification-backend/](epic-3-clarification-backend/)
- **Tasks**: 3 · Wall-clock: ~8h · Priority: P0
- **Human Test**: "find me a coach" → clarification → "SF for autism" → agent completes original intent with preserved state
- **PRD**: `06-uc-clr.md`, UC-REL-03/06
- **Depends on**: Epic 1. **Blocks**: Epic 5, INT-008

| ID       | Title                                            | Agent     | Depends On       |
|----------|--------------------------------------------------|-----------|------------------|
| CLR-001  | setPendingIntent / clearPendingIntent mutations  | convex    | INT-001          |
| CLR-002  | Ambiguous short-circuit + rehydrate in agent.ts  | pi-agent  | INT-006, CLR-001 |
| REL-001  | HOLOCRON_SYSTEM_PROMPT clarification + doc rules | pi-agent  | REC-004, REC-005 |

### Epic 4 — Recommendation Mobile UI
- **Folder**: [epic-4-recommendation-mobile-ui/](epic-4-recommendation-mobile-ui/)
- **Tasks**: 7 · Wall-clock: ~15h · Priority: P0
- **Human Test**: Send canonical query → RecommendationListCard renders inline → tap phone/maps/website → native apps open → long-press → action sheet → Save works
- **Stack**: NativeWind + `@/components/ui/text` (NOT react-native-paper)
- **PRD**: `05-uc-rec.md` UC-REC-07..10
- **Depends on**: Epic 2

| ID          | Title                                              | Agent                      | Depends On                 |
|-------------|----------------------------------------------------|----------------------------|----------------------------|
| REC-UI-001  | Types + props contract                             | react-native-ui-implementer | REC-003                    |
| REC-UI-002  | RecommendationItem (tel:/maps://geo:)              | react-native-ui-implementer | REC-UI-001                 |
| REC-UI-003  | RecommendationSources (collapsible)                | react-native-ui-implementer | REC-UI-001                 |
| REC-UI-004  | RecommendationActionSheet (long-press menu)        | react-native-ui-implementer | REC-UI-001                 |
| REC-UI-005  | RecommendationListCard (container composition)    | react-native-ui-implementer | REC-UI-002,003,004         |
| INT-UI-001  | ChatThread dispatch for recommendation_list        | react-native-ui-implementer | REC-UI-005, REC-UI-001     |
| REC-UI-006  | Save-to-KB wiring (per-item + whole list)          | react-native-ui-implementer | INT-UI-001                 |

### Epic 5 — Clarification Mobile UI
- **Folder**: [epic-5-clarification-mobile-ui/](epic-5-clarification-mobile-ui/)
- **Tasks**: 3 · Wall-clock: ~6h · Priority: P0
- **Human Test**: Send "find me a coach" on device → clarification bubble with chips → tap chip → agent completes original intent
- **PRD**: `06-uc-clr.md` UC-CLR-09/10
- **Depends on**: Epic 3

| ID          | Title                                            | Agent                      | Depends On          |
|-------------|--------------------------------------------------|----------------------------|---------------------|
| CLR-UI-001  | ClarificationQuickReplyChip (leaf)               | react-native-ui-implementer | —                   |
| CLR-UI-002  | ClarificationMessage (bubble + chips)            | react-native-ui-implementer | CLR-UI-001, INT-001 |
| INT-UI-002  | ChatThread dispatch + onSendMessage wiring       | react-native-ui-implementer | CLR-UI-002, CLR-002 |

### Epic 6 — Activity Indicator, Document Discipline & Cleanup
- **Folder**: [epic-6-activity-discipline-cleanup/](epic-6-activity-discipline-cleanup/)
- **Tasks**: 6 · Wall-clock: ~12h · Priority: P0 (UI) / P2 (cron)
- **Human Test**: Send query → "Finding recommendations…" indicator visible during tool run → assistant messages show save/open footer → reduce-motion disables animation → telemetry retention cron prunes old rows
- **PRD**: `07-uc-rel.md` UC-REL-07/08/09, Risk 5
- **Depends on**: Epic 2, Epic 5

| ID          | Title                                            | Agent                      | Depends On                |
|-------------|--------------------------------------------------|----------------------------|---------------------------|
| REL-UI-001  | useAgentActivity hook                            | react-native-ui-implementer | INT-007                   |
| REL-UI-002  | AgentActivityIndicator (phase-aware)             | react-native-ui-implementer | REL-UI-001                |
| REL-UI-003  | DocumentDisciplineFooter                         | react-native-ui-implementer | —                         |
| INT-UI-003  | ChatThread wrap: DocumentDisciplineFooter        | react-native-ui-implementer | REL-UI-003                |
| INT-UI-004  | ChatThread mount: AgentActivityIndicator         | react-native-ui-implementer | REL-UI-001, REL-UI-002    |
| REL-002     | Telemetry retention cron (90-day TTL)            | convex-implementer         | INT-005, INT-008          |

## Dependency Graph (ASCII)

```
Epic 1: Triage Intelligence & Telemetry
  INT-001 ── INT-002 ┐
         ├── INT-003 ─ INT-004 ┐
         ├── INT-005 ──────────┼── INT-006
         └── INT-007 (parallel w/ INT-006)
                                │
                                ▼
Epic 2: Recommendation Engine              Epic 3: Clarification (Backend)
  REC-001 ┐                                  CLR-001 ─┐
  REC-002 ┼── REC-003 ── REC-MCP-01                    │
          │       │                          CLR-002 ◄─┴── (needs INT-006)
          │       └── REC-004 ── REC-005 ── INT-008
          │                        │               │
          │                        └── REL-001 ◄── (needs Epic 2 + Epic 3)
          └────── (Epic 2 blocks)
                        │
                        ▼
Epic 4: Recommendation Mobile UI           Epic 5: Clarification Mobile UI
  REC-UI-001 ──┬── REC-UI-002 ┐              CLR-UI-001 ── CLR-UI-002 ── INT-UI-002
               ├── REC-UI-003 ┼── REC-UI-005 ── INT-UI-001 ── REC-UI-006
               └── REC-UI-004 ┘
                                                    │
                                                    ▼
                              Epic 6: Activity, Discipline, Cleanup
                                INT-007 ── REL-UI-001 ─┬── REL-UI-002 ── INT-UI-004
                                REL-UI-003 ── INT-UI-003
                                INT-005+INT-008 ── REL-002
```

## Parallelization Opportunities

| Group               | Tasks that can run in parallel                                    |
|---------------------|-------------------------------------------------------------------|
| Epic 1 mid          | INT-002, INT-003 (both depend on INT-001)                         |
| Epic 1 late         | INT-007 runs alongside INT-006                                    |
| Epic 2 early        | REC-001, REC-002 (both depend only on INT-001)                    |
| Epic 2 mid          | REC-MCP-01 runs parallel to REC-004/005 after REC-003             |
| Epic 2 ↔ Epic 3     | CLR-001/002 run parallel to REC tasks after Epic 1               |
| Epic 4 mid          | REC-UI-002, REC-UI-003, REC-UI-004 (all depend only on REC-UI-001)|
| Epic 5 ↔ Epic 6     | CLR-UI-001 can run in parallel with Epic 1                        |
| Epic 6 early        | REL-UI-003 runs parallel to REL-UI-001/002                        |
| Anywhere after INT-008 | REL-002 (telemetry cron — low risk)                            |

## Usage

```bash
# Browse task files
ls .spec/prd/smarter-chat-agent/tasks

# View this index
cat .spec/prd/smarter-chat-agent/tasks/INDEX.md

# Execute Epic 1 first
/kb-run-epic epic-1-triage-intelligence

# Continue with Epic 2, then 3, 4, 5, 6
/kb-run-epic epic-2-recommendation-engine
/kb-run-epic epic-3-clarification-backend
/kb-run-epic epic-4-recommendation-mobile-ui
/kb-run-epic epic-5-clarification-mobile-ui
/kb-run-epic epic-6-activity-discipline-cleanup
```

## Quality Metrics

| Dimension              | Coverage       |
|------------------------|----------------|
| Critical constraints   | 100% tasks     |
| Specification          | 100% tasks     |
| GIVEN-WHEN-THEN ACs    | 100% tasks (4-7 per task) |
| TEST CRITERIA (boolean)| 100% tasks     |
| Reading list           | 100% tasks     |
| Guardrails (write_allowed paths) | 100% tasks |
| Design (pattern + source + anti-pattern) | 100% tasks |
| Verification gates     | 100% tasks (exact commands) |
| Agent assignment rationale | 100% tasks |
| Estimate minutes       | 100% tasks     |
| Coding standards paths | 100% tasks     |
| Dependencies (depends_on + blocks) | 100% tasks |

## Notes

- **Stack correction**: This project uses **NativeWind (Tailwind)** with `Text` from `@/components/ui/text`. All 14 mobile UI tasks encode this as a critical constraint. The PRD's CLAUDE.md "React Native Rules" section mentions react-native-paper, but the actual project does not use it — the EM/UID agents verified this against `package.json`.
- **INT-008 cross-epic dependency**: The eval harness (Epic 2) hard-asserts the canonical failing case, but it also needs CLR-002 (Epic 3) because one of its fixtures exercises the ambiguous short-circuit path. Execution order: run Epic 2 tasks 1-5 + REC-MCP-01, then Epic 3, then INT-008.
- **INT-007 scope expansion**: Task originally had 4 queries (listRecent, countByShape, findDivergences, getTurnDetails); expanded to 5 to include `getCurrentPhase` consumed by the mobile `useAgentActivity` hook (REL-UI-001) in Epic 6. This avoids creating a separate INT-010 task.
- **Deployment**: Per project CLAUDE.md, client-code changes require a deploy (GitHub release → EAS workflow). Epics 4, 5, 6 all change `components/` and `hooks/` — a deploy is required after shipping each client-touching epic or after all mobile UI is merged.
- **Personal app**: Per CLAUDE.md, this is a personal app with no multi-tenant / RLS / OAuth concerns. Reviewers should not apply production-hardening standards for security.
