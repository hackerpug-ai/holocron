---
name: Use Cases — Recommendation Engine + MCP Exposure
description: New find_recommendations tool, synchronous Convex action, structured synthesis prompt, RecommendationListCard mobile component, and MCP tool exposure
stability: FEATURE_SPEC
last_validated: 2026-04-11
prd_version: 1.0.0
functional_group: REC
---

# Use Cases: Recommendation Engine + MCP Exposure (REC)

| ID | Title | Description |
|----|-------|-------------|
| UC-REC-01 | Define find_recommendations tool with structured params | New Vercel AI SDK tool definition in convex/chat/tools.ts with query, count, location, constraints params |
| UC-REC-02 | Implement synchronous findRecommendationsAction | Internal action in convex/research/actions.ts that runs Jina + zaiFlash + structured JSON synthesis without creating a document |
| UC-REC-03 | Generate structured recommendation list via synthesis prompt | RECOMMENDATION_SYNTHESIS_PROMPT extracts items with name, specialty, rating, location, contact, why-it-fits and forbids fabrication |
| UC-REC-04 | Render recommendation_list cardData via new card type | Backend produces messageType: result_card with cardData.card_type: recommendation_list — no schema migration needed |
| UC-REC-05 | Update research specialist prompt for find_recommendations | RESEARCH_SPECIALIST_PROMPT lists find_recommendations as TOP PRIORITY for recommendation queries |
| UC-REC-06 | Wire find_recommendations through tool executor | toolExecutor.ts dispatches the new tool to findRecommendationsAction |
| UC-REC-07 | Render RecommendationListCard on mobile | New mobile component renders 3-7 items with name, specialty, rating, location, contact, why-it-fits |
| UC-REC-08 | Tap-to-call, tap-to-website, tap-to-maps interactions | RecommendationItem opens phone dialer, browser, or maps app via Linking.openURL |
| UC-REC-09 | Long-press contextual menu and save-to-KB action | Long-press on item opens action sheet with Save to KB, Share, Dismiss options |
| UC-REC-10 | Render and link source citations | Sources section shows domain names, tap opens browser |
| UC-REC-11 | Expose findRecommendations via holocron MCP server | New mcp__holocron__findRecommendationsTool wraps the public Convex action for external clients |

---

## UC-REC-01 — Define find_recommendations tool with structured params

Add a new Vercel AI SDK tool in `convex/chat/tools.ts` and register it in the `researchTools` subset. The tool is distinct from `answer_question` — distinct name, distinct description, distinct schema. LLMs anchor on tool names, so this is the highest-leverage intervention.

### Acceptance Criteria

- ☐ Backend exposes `find_recommendations` in the Vercel AI SDK tool set
- ☐ Research specialist receives `find_recommendations` in its tool subset (researchTools array)
- ☐ Tool description explicitly contrasts itself with `answer_question` and `quick_research` ("use this INSTEAD of answer_question when...")
- ☐ Tool schema requires `query`, accepts optional `count` (default 5, min 3, max 7), `location`, `constraints[]`
- ☐ Other specialists do NOT receive `find_recommendations` (keeps tool count manageable per specialist)
- ☐ Tool description includes negative examples ("Do NOT use this for 'what is X' or 'how does X work' — use answer_question instead")
- ☐ Tool description states "produces an INLINE response — no document is created"

---

## UC-REC-02 — Implement synchronous findRecommendationsAction

New `internalAction` in `convex/research/actions.ts` that runs synchronously, calls Jina, extracts structured items, returns an array without creating a document. Total execution capped at 30 seconds.

### Acceptance Criteria

- ☐ Backend executes `findRecommendationsAction` synchronously (no scheduler.runAfter, no document creation)
- ☐ Action returns typed `{items, sources, query, durationMs}` shape
- ☐ System caps execution at 30 seconds with AbortController (Jina fetch + LLM synthesis combined)
- ☐ Action returns graceful empty-result shape when Jina returns no sources
- ☐ Backend never writes to the documents table from this action
- ☐ Action accepts validators: `query: v.string(), count: v.optional(v.number()), location: v.optional(v.string()), budget: v.optional(v.string()), mustHave: v.optional(v.array(v.string()))`
- ☐ Action exposes both `internalAction` (for chat) and `action` (public, for MCP) wrappers around a shared core function

---

## UC-REC-03 — Generate structured recommendation list via synthesis prompt

The synthesis prompt instructs the LLM to extract exactly `count` items, each with `{name, description, contact, location, pricing, rating, whyRecommended}`, and return a strict markdown numbered list. No fabrication, no general advisory articles.

### Acceptance Criteria

- ☐ Synthesis output starts directly with "Here are N..." (no "I researched this and found..." preamble)
- ☐ Each entry has a bold name, optional tagline, and indented metadata fields
- ☐ Each entry has a "Why this fits" one-sentence justification tied to user's criteria
- ☐ Each entry has a source citation `[Source N]` referencing the numbered source list
- ☐ System omits fields that aren't in the sources (does NOT fabricate ratings, phones, or addresses)
- ☐ Output ends with 1-2 sentences of practical guidance (how to choose, what to verify)
- ☐ Output does NOT include "More information", "Conclusion", or "Further reading" sections
- ☐ Synthesis prompt uses fallback response when sources don't yield 3+ real providers ("I found general info but not enough specific named providers...")
- ☐ Backend validates LLM JSON output against a Zod schema before returning
- ☐ System retries synthesis once with stricter instructions when JSON parse fails
- ☐ Action returns text fallback (markdown list) when both synthesis attempts fail

---

## UC-REC-04 — Render recommendation_list cardData via new card type

The agent response uses a new `card_type: "recommendation_list"` discriminator. No schema migration needed because `cardData: v.optional(v.any())` is already permissive.

### Acceptance Criteria

- ☐ Backend produces `messageType: "result_card"` with `cardData.card_type: "recommendation_list"`
- ☐ Card payload includes `items`, `sources`, `durationMs`, and the original `query` for context
- ☐ Action sets `skipContinuation: false` so the specialist can offer follow-ups
- ☐ Mobile client receives the card via reactive subscription without backend changes
- ☐ Backward compat — existing `answer_with_sources` card type continues to work

---

## UC-REC-05 — Update research specialist prompt for find_recommendations

Replace `RESEARCH_SPECIALIST_PROMPT` in `convex/chat/specialistPrompts.ts:34-51` with a version that lists `find_recommendations` as TOP PRIORITY for recommendation queries.

### Acceptance Criteria

- ☐ Research specialist prompt lists `find_recommendations` as a tool with a decision rule tied to recommendation queries
- ☐ Prompt contains the canonical failing-case example mapped to `find_recommendations`
- ☐ Prompt explicitly says "never use deep_research for recommendations that fit in a single message"
- ☐ Prompt includes negative examples: "Signals that mean FACTUAL (use answer_question instead)" and "Signals that mean COMPREHENSIVE (use deep_research)"
- ☐ Prompt specifies `deep_research` is gated on user explicitly using "comprehensive", "deep dive", "thorough", "complete guide", or "full breakdown"
- ☐ Research specialist receives queryShape context in its system prompt preamble when available

---

## UC-REC-06 — Wire find_recommendations through tool executor

Add a new case in `convex/chat/toolExecutor.ts` `executeAgentTool` switch that calls `internal.research.actions.findRecommendationsAction` synchronously and returns an `AgentResponse` with `card_type: "recommendation_list"`.

### Acceptance Criteria

- ☐ Tool executor calls `internal.research.actions.findRecommendationsAction` for `find_recommendations` tool
- ☐ Tool executor returns `AgentResponse` with `messageType: "result_card"` and `cardData.card_type: "recommendation_list"`
- ☐ Tool executor passes through `query`, `count`, `location`, `constraints` from the LLM tool call args
- ☐ Tool executor sets `skipContinuation: false` so `continueAfterTool` runs (with the find_recommendations continuation hint)
- ☐ Backend re-invokes specialist with tool result in context after `find_recommendations` completes
- ☐ Specialist produces a brief text message (no further tool calls) summarizing the recommendations

---

## UC-REC-07 — Render RecommendationListCard on mobile

New `RecommendationListCard` React Native component in `components/cards/RecommendationListCard.tsx` renders the result of `find_recommendations` as a structured card.

### Acceptance Criteria

- ☐ User can see a recommendation list card render with 3 items when given a 3-item response
- ☐ User can see a recommendation list card render with 7 items when given a 7-item response
- ☐ User can see each recommendation item display name, specialty, rating, and location
- ☐ User can see a "Why it fits" explanation per recommendation truncated to a single line by default
- ☐ User can see the card render in dark mode with correct contrast
- ☐ Component uses semantic theme tokens only (no hardcoded colors, spacing, or typography)
- ☐ Component uses Paper Text variants (titleSmall, bodySmall, labelSmall) — never react-native Text
- ☐ Component has `testID="recommendation-list-card"` and per-item testIDs `recommendation-item-{index}`
- ☐ Component has co-located Storybook stories: Default, MinimumItems, MaximumItems, WithMissingFields, NoSources, DarkMode, LongQuery, ActionSheetOpen

---

## UC-REC-08 — Tap-to-call, tap-to-website, tap-to-maps interactions

Each `RecommendationItem` exposes phone, website, and location chips that open the device's native app via `Linking.openURL`.

### Acceptance Criteria

- ☐ User can tap a phone number on a recommendation item and trigger `Linking.openURL` with `tel:` prefix
- ☐ System strips formatting from phone numbers before passing to `tel:` URL (e.g., "(415) 555-1234" → "tel:4155551234")
- ☐ User can tap a website link and trigger `Linking.openURL` with the `https:` URL
- ☐ User can tap a location chip and trigger `Linking.openURL` with `maps://?q=...` on iOS
- ☐ User can tap a location chip and trigger `Linking.openURL` with `geo:0,0?q=...` on Android
- ☐ System uses `Linking.canOpenURL` to check before calling `openURL` (graceful fallback to clipboard via Snackbar if blocked)
- ☐ Component hides phone/website/location chips when corresponding fields are missing from the recommendation
- ☐ Touch targets meet 44pt minimum (via padding or hitSlop)

---

## UC-REC-09 — Long-press contextual menu and save-to-KB action

Long-press on a `RecommendationItem` opens an action sheet with Save to KB, Share, and Dismiss options.

### Acceptance Criteria

- ☐ User can long-press a recommendation item to open `RecommendationActionSheet`
- ☐ Action sheet renders with Save to KB, Share, and Dismiss options
- ☐ User can save an individual recommendation to the KB via the long-press menu (calls `onSaveRecommendation` callback)
- ☐ User can share an individual recommendation via `Share.share`
- ☐ User can dismiss the action sheet via the cancel/backdrop tap
- ☐ Long-press uses `delayLongPress={400}` for tighter feedback
- ☐ Long-press does not conflict with parent ScrollView/FlatList scroll gestures (verified on real device)
- ☐ Component also offers a "Save list to KB" footer button that calls `onSaveAllToKB` to save the entire list as one document

---

## UC-REC-10 — Render and link source citations

Sources section at the bottom of `RecommendationListCard` shows the domains used to generate the recommendations and lets the user tap to open them.

### Acceptance Criteria

- ☐ User can see source citations at the bottom of the card with domain names
- ☐ User can tap a source citation and trigger `Linking.openURL` with the source URL
- ☐ Sources section is hidden when sources array is empty
- ☐ Sources section uses semantic.color.onSurface.muted for citation text (subtle visual weight)
- ☐ Sources component has `testID="recommendation-list-sources"` and per-source `recommendation-source-{index}` testIDs

---

## UC-REC-11 — Expose findRecommendations via holocron MCP server

External MCP clients (e.g., Claude Code) can call `mcp__holocron__findRecommendationsTool` with the same args as the chat agent.

### Acceptance Criteria

- ☐ MCP server registers `findRecommendationsTool` in its tool list
- ☐ External clients can call `mcp__holocron__findRecommendationsTool` with `query`, `count`, `location`, `budget`, `mustHave`
- ☐ MCP tool description clearly tells LLMs "use this when asking for a list of specific providers/services/people, not for general questions"
- ☐ MCP wrapper returns the Convex action result directly (no reshaping)
- ☐ Tool count log in stdio.ts updates from 42 to 43
- ☐ Backend exposes `api.research.actions.findRecommendations` as a public action for MCP
- ☐ Public action delegates to the same core logic as the internal action (shared function, no duplication)
- ☐ MCP `FindRecommendationsSchema` matches Convex action validators field-for-field with sync comments
