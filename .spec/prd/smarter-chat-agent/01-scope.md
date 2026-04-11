---
name: Scope
description: In scope and out of scope items for the smarter chat agent initiative with a 6-week appetite
stability: FEATURE_SPEC
last_validated: 2026-04-11
prd_version: 1.0.0
appetite_weeks: 6
---

# Scope

**Appetite**: 6 weeks (full polish — go maximalist on reliability, observability, and UX)

## In Scope

### Backend (Convex)

- New `queryShape` field on triage classifier output (`factual` / `recommendation` / `comprehensive` / `exploratory` / `ambiguous`)
- Updated `TRIAGE_SYSTEM_PROMPT` with queryShape taxonomy and few-shot examples
- New deterministic regex pre-filter (`convex/chat/triageRegex.ts`) that overrides LLM on high-precision recommendation patterns
- New `find_recommendations` Vercel AI SDK tool definition in `convex/chat/tools.ts`
- New synchronous `findRecommendationsAction` (internal) and `findRecommendations` (public) actions in `convex/research/actions.ts`
- New `RECOMMENDATION_SYNTHESIS_PROMPT` with strict numbered-list template and fabrication guardrails
- Updated `RESEARCH_SPECIALIST_PROMPT` with TOP PRIORITY recommendation guidance and tightened `deep_research` gate
- Updated `HOLOCRON_SYSTEM_PROMPT` with "Clarification Before Tools" and "Inline vs Document Discipline" sections
- 3 new optional fields on `conversations` table: `pendingIntent`, `pendingQueryShape`, `pendingSince`
- New `agentTelemetry` table with 5 indexes for inspection
- New internal mutations: `setPendingIntent`, `clearPendingIntent`, `recordTriage`, `deleteOldTelemetry`
- New telemetry queries module (`convex/chat/telemetryQueries.ts`) for dev inspection via `npx convex run`
- New eval harness (`convex/chat/eval/`): 30+ fixture queries, eval runner action, vitest test that hard-asserts the failing case
- Telemetry retention cron (90-day TTL)
- `tool_executor.ts` wiring for `find_recommendations`
- `agent.ts` orchestrator updates: queryShape hint to specialist, ambiguous short-circuit, pending state rehydrate, telemetry recording

### Agent Intelligence (prompts and decision rules)

- Decision Table A: Intent + queryShape → Tool mapping (covers all 10 intents)
- Decision Table B: When to ask a clarifying question (8 signals, with example clarifying questions)
- Decision Table C: When to create a document vs inline (12 situations)
- Triage prompt rule: ambiguous queries always include `directResponse`
- Triage prompt rule: don't ask twice (anti-loop)
- Triage prompt rule: clear actions are never conversation
- Specialist prompt update: research specialist receives queryShape hint as system message preamble
- Continuation hint for `find_recommendations`: don't re-render the list, offer save, don't launch another search

### Mobile UI (React Native + Expo)

- New `RecommendationListCard` component with sub-components (`RecommendationItem`, `RecommendationSources`, `RecommendationActionSheet`)
- Tap-to-call (`tel:`), tap-to-website (`https:`), tap-to-maps (`maps://` on iOS, `geo:` on Android) interactions
- Long-press contextual menu on recommendation items (Save to KB, Share, Dismiss)
- "Save list to KB" footer button
- Collapsible sources section with citation links
- New `ClarificationMessage` component with subtle accent treatment ("Quick question" label + left-edge accent stripe)
- New `ClarificationQuickReplyChip` component for quick-reply chips (0-4 chips per clarification)
- Threaded user-response visual when clarification is answered
- New `AgentActivityIndicator` component with phase-aware messages: idle → triage → dispatching → tool_execution → synthesis
- Tool-specific activity messages ("Finding recommendations...", "Searching your knowledge base...")
- `AccessibilityInfo.isReduceMotionEnabled` check disables pulse animation
- New `DocumentDisciplineFooter` component: "Saved to KB" + "Open →" when a doc was created; "Save this to KB" quick-action when not
- New `useAgentActivity` hook subscribing to agent phase via Convex query
- 4 integration points in `ChatThread.tsx`: dispatch new card_types, render activity indicator, wrap answer cards with discipline footer, wire save mutations
- Storybook co-located stories for every new component, including dark mode and play functions for interactive cases
- ~70 unit tests across components + hooks + integration

### MCP Surface (holocron-mcp)

- New `findRecommendationsTool` exposed via `holocron-mcp/src/mastra/stdio.ts`
- Matching Zod schema in `holocron-mcp/src/config/validation.ts` with sync comment to Convex validator
- Wrapper in `holocron-mcp/src/tools/recommendations.ts`
- Public Convex action `findRecommendations` (no auth, key-based security per CLAUDE.md)
- Tool count log bumped from 42 to 43

### Telemetry & Evaluation

- Per-turn telemetry capture: intent, queryShape, confidence, classificationSource, specialistUsed, toolsCalled, durationMs, regexMatchPattern, ambiguousIntents, rawLlmResponse (truncated), clarificationQuestion
- Inspection queries callable via `npx convex run chat/telemetryQueries:*`
- Eval fixture file (TypeScript, typed) with 30+ canonical queries covering all queryShapes
- Eval runner that mocks LLM for fast CI runs (under 60s)
- Live eval flag (`RUN_LIVE_EVALS`) for non-CI verification against real `zaiFlash`
- CI gate: ≥ 90% routing accuracy + canonical failing case must pass

## Out of Scope

### Deferred (could ship in a future PRD)

- **Service finder integration** — `convex/research/specialists/service_finder.ts` exists but is async-structured and doesn't fit the synchronous chat result_card pattern. Steal patterns, not plumbing.
- **Streaming tool output** — current reactive Convex subscription is sufficient; token-by-token streaming would require new transport
- **Voice input on mobile** — separate initiative
- **Image input to chat** — separate initiative
- **Multi-language UX strings** — current copy is English-only
- **A new top-level `clarification` intent** in triage — using `queryShape: "ambiguous"` is structurally cleaner and ships less code
- **Replacing zaiFlash/zaiPro** — model selection is locked
- **Non-mobile clients** — this PRD is mobile-first
- **Recommendation list export to CSV/JSON** — defer to user-driven follow-up
- **Per-recommendation reviews/comments** — defer
- **Caching of `find_recommendations` results** — every turn re-runs; revisit if cost becomes a concern

### Out of scope by principle

- **Multi-tenant features, RLS, OAuth, account separation** — per CLAUDE.md, this is a personal app that will never be published. Keys are the security.
- **Production hardening for an app store release** — same reason
- **Generic agent improvements unrelated to the failing case** — this PRD is laser-focused on intent detection, response routing, and document discipline
- **Refactoring the existing 21-tool registry** — only adding 1 new tool; the rest stays as-is
- **Reorganizing the chat folder structure** — files stay where they are
