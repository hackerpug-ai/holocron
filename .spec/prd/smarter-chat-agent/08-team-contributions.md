---
name: Team Contributions
description: Phase outputs from the four planners that contributed to this PRD
---

# Team Contributions

This PRD was synthesized from parallel contributions by four domain-expert planners. Each contributed within their lane; the orchestrator merged their outputs into 4 functional groups (INT, REC, CLR, REL).

## Phase 1 — Backend Architecture (convex-planner)

**Domain**: Convex backend, MCP tool exposure, telemetry, validators, data flow

**Deliverables**:
- 5 functional groups: BIC (Backend Intent Classification), REC (Recommendation Tool), CSC (Conversation State & Coherence), MCP (MCP Exposure), OBS (Telemetry & Evaluation)
- 25 use cases with acceptance criteria
- Schema deltas: 3 new optional fields on `conversations`, new `agentTelemetry` table with 5 indexes
- Full Convex `v.*` validator definitions for all new actions and mutations
- Architecture diagram (ASCII) showing the data flow from mobile → triage → specialist dispatch → tool execution → result rendering
- 15-task TDD-ordered build sequence with file paths and verification steps
- 5 risks with rollback strategies (LLM emits invalid queryShape, action timeouts, stale pendingIntent, MCP tool count, agentTelemetry growth)

**Key opinions**:
- All schema changes additive with optional fields — zero migration risk
- Single LLM call for triage (queryShape merged into existing JSON output, not a second pass)
- `find_recommendations` is a NEW tool (not a mode parameter on `answer_question`) because LLMs anchor on tool names more reliably
- `agentTelemetry` table is rotated by a 90-day cron — keeps storage bounded
- MCP exposure consolidates the same core function for chat and external clients (no duplication)

**Key files contributed**:
- Validator code blocks for `findRecommendationsAction`, `setPendingIntent`, `clearPendingIntent`, `recordTriage`
- Architecture ASCII diagram
- Eval fixture pattern with `FAILING_CASE` constant
- Build sequence with 15 numbered tasks

---

## Phase 2 — Agent Intelligence (pi-agent-planner)

**Domain**: Agent intelligence, prompts, intent classification, multi-turn coherence, reasoning reliability

**Deliverables**:
- 3 user personas with goals, pain points, and queryShape distribution mappings
- 4 functional groups: INT (Intent Classification), CLR (Clarification Workflow), MTC (Multi-Turn Coherence), REL (Agent Reasoning Reliability)
- 28 use cases with detailed acceptance criteria
- 3 decision tables: Intent + queryShape → Tool Mapping (32 rows), When to Ask Clarifying Question (8 signals), When to Create Document vs Inline (12 situations)
- Full prompt replacements for `TRIAGE_SYSTEM_PROMPT`, `RESEARCH_SPECIALIST_PROMPT`, `RECOMMENDATION_SYNTHESIS_PROMPT`
- Tool description text for `find_recommendations` (load-bearing for LLM tool selection)
- Continuation hint for `find_recommendations` post-execution
- 20-query eval set with expected (intent, queryShape, tool, docCreated) outcomes
- 6 risks with mitigations (LLM drift, synthesis prompt failures, clarification loops, multi-turn intent decay, JSON parse failures, cross-turn context pollution)

**Key opinions**:
- New `find_recommendations` tool is the highest-leverage intervention (tool names beat mode parameters for LLM tool selection)
- `queryShape` field on triage with 5 values is the right secondary classification dimension
- `ambiguous` is a queryShape, not a top-level intent — extends existing directResponse short-circuit gate
- Persistent `pendingIntent` on conversation doc is necessary for multi-turn coherence
- Deterministic regex backstop catches LLM drift on the highest-frequency failure pattern
- Hard cap at `clarificationDepth = 1` prevents loops
- Tools (not specialists) decide document creation — `answer_question` and `find_recommendations` never create docs
- Recommendation synthesis prompt must lead with the OUTPUT FORMAT EXAMPLE before rules (LLMs anchor on examples)

**Key files contributed**:
- Verbatim TRIAGE_SYSTEM_PROMPT replacement with queryShape taxonomy and 7 examples
- Verbatim RESEARCH_SPECIALIST_PROMPT replacement with TOP PRIORITY recommendation section
- Verbatim RECOMMENDATION_SYNTHESIS_PROMPT (new) with strict template + fabrication guardrails
- Decision Table A (Intent × queryShape → tool mapping)

---

## Phase 3 — UI Visual Design (frontend-designer)

**Domain**: UI/UX design specs — visual design, layout, interaction, styling

**Deliverables**:
- 7 UX principles defining how the smarter agent should "feel" on mobile
- 3 functional groups: RCU (Recommendation Card UI), CMU (Clarification Message UI), AAI (Agent Activity Indicators)
- 22 use cases with TDD-ready acceptance criteria
- 4 visual specs:
  - **Spec A**: RecommendationListCard — full layout (375px reference), per-item structure, header, sources, footer, all interactive states (loading, empty, error, partial, long content), accessibility, dark mode
  - **Spec B**: ClarificationMessage — left-edge accent, "Quick question" chip, quick-reply chip row, multi-turn threading, light/dark mode
  - **Spec C**: AgentActivityIndicator — 4 phases (idle/routing/tool_running/synthesizing), spinning dot animation, tool-specific labels, transition to result, accessibility announcements
  - **Spec D**: Document Discipline UX — DocumentSavedFooter (replaces stand-alone DocumentSavedCard), inline "Save this answer" opt-in, no-save state (most queries)
- Token usage table confirming no new design tokens needed
- 5 risks with mitigations (touch target density, ClarificationMessage visual weight, activity indicator expectation-setting, brand consistency, LayoutAnimation on Android)

**Key opinions**:
- Agent thinking is visible but calm — no modals, no progress bars, no percentage counters
- Conversation, not report generation — the default mode is conversational, deep_research mode is earned
- Recommendations are actionable at the point of reading — tap-to-call, tap-to-website, never copy-paste
- Clarification feels like a natural follow-up, not an interrogation form
- At a glance, the user can tell what kind of response they received
- Document creation is opt-in for most responses
- Plain markdown lists for MVP, structured cards as phase 2 polish
- Subtle visual treatment for clarification (5% opacity background + 3px left border) to avoid feeling like an interrogation

**Note**: This planner discovered the project uses **NativeWind / Tailwind tokens** (`bg-card`, `text-foreground`, `bg-info/15`) via `className` props with `useTheme()` from `lib/theme.ts` for dynamic values — NOT `useSemanticTheme`. The react-native-ui-planner used `useSemanticTheme()` in its specs based on a different convention reading. Implementers should use whichever convention is currently in use in the codebase (verify via existing card components). The acceptance criteria in this PRD are token-system-agnostic — they describe what tokens are used, not the specific API.

**Key files contributed**:
- ASCII mockups for RecommendationListCard, ClarificationMessage, AgentActivityIndicator, DocumentDisciplineFooter
- Per-component token specifications
- Interaction patterns (tap-to-call, long-press menu, quick-reply chips)
- Accessibility annotations

---

## Phase 4 — Mobile Implementation Tasks (react-native-ui-planner)

**Domain**: React Native mobile component implementation tasks — TDD-ready, with file paths, props, testIDs, theme tokens

**Deliverables**:
- 3 functional groups: RCC (Recommendation Card Components), CFC (Clarification Flow Components), ADI (Activity & Discipline Indicators)
- 30 use cases tied to specific test cases
- 6 component specs with full props interfaces, JSX skeletons, theme tokens, testIDs, state management, external dependencies, Storybook stories, and RED-phase test cases:
  - RecommendationListCard
  - RecommendationItem
  - RecommendationSources
  - RecommendationActionSheet
  - ClarificationMessage
  - ClarificationQuickReplyChip
  - AgentActivityIndicator
  - DocumentDisciplineFooter
- 1 required hook (`useAgentActivity`) + 1 optional (`useClarificationState`)
- 4 ChatThread.tsx integration points
- Test strategy with mocking patterns for `Linking`, `Platform`, `useRouter`, `useQuery`, `useMutation`, `AccessibilityInfo`
- 20-task TDD-ordered build sequence
- 6 risks with mitigations (Linking permissions, Storybook play function flakiness, Convex query mocking, dark mode contrast, long-press scroll conflicts, touch target sizing)

**Key opinions**:
- Build leaf components first (ClarificationQuickReplyChip), then container components (ClarificationMessage), then integration (ChatThread dispatcher)
- Each component is one commit with RED → GREEN → REFACTOR cycle
- Use `Platform.select` for maps URL scheme (iOS: `maps://`, Android: `geo:`)
- Touch targets must meet 44pt minimum via padding or hitSlop
- Reduce motion accessibility check disables pulse animation
- Convex query mocking is the highest test infra risk — create a `mockConvexQuery<T>` helper
- Long-press conflict with scroll gestures requires real-device testing on Android Pixel and iPhone

**Key files contributed**:
- Full props interfaces for all 8 components
- JSX skeletons showing structure (View hierarchy, Paper Text variants, theme token usage)
- testID conventions per component
- Storybook story lists with play function patterns
- 70+ unit test names with assertion strategies
- 20-task build sequence with verification commands and Definition of Done

---

## Synthesis Notes

The orchestrator (this Claude Code session) merged the four contributions into 4 functional groups by collapsing parallel efforts:

| Source group | Merged into |
|--------------|-------------|
| convex-planner BIC | INT |
| pi-agent-planner INT | INT |
| convex-planner OBS | INT (telemetry as part of intent classification observability) |
| convex-planner REC | REC |
| frontend-designer RCU | REC (visual specs as acceptance criteria) |
| react-native-ui-planner RCC | REC (component implementation as acceptance criteria) |
| convex-planner MCP | REC (MCP exposure of recommendation tool) |
| convex-planner CSC | CLR |
| pi-agent-planner CLR | CLR |
| pi-agent-planner MTC | CLR (multi-turn coherence is fundamentally part of clarification flow) |
| frontend-designer CMU | CLR |
| react-native-ui-planner CFC | CLR |
| pi-agent-planner REL | REL |
| frontend-designer AAI | REL (activity is part of reliability/transparency) |
| react-native-ui-planner ADI | REL |

**Disagreements resolved**:
- **Tool surface**: convex-planner initially suggested a `mode` parameter on `answer_question`; pi-agent-planner argued strongly for a new `find_recommendations` tool. Resolution: NEW TOOL (pi-agent-planner's argument about LLM tool selection reliability is well-supported by ChatGPT/Claude empirical patterns).
- **queryShape vs queryType naming**: pi-agent-planner suggested `queryShape` (describes output), convex-planner used `queryType`. Resolution: `queryShape` (cleaner cognitive separation from `intent`).
- **`ambiguous` placement**: convex-planner suggested it as a top-level intent, pi-agent-planner argued for queryShape value. Resolution: `queryShape` value (extends existing directResponse short-circuit, works across all intents).
- **Theme system**: frontend-designer used NativeWind/Tailwind tokens, react-native-ui-planner used `useSemanticTheme()`. Resolution: implementers verify against current codebase convention (acceptance criteria are token-system-agnostic).
