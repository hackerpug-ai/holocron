---
name: Use Cases — Reliability, Activity & Document Discipline
description: Tool selection consistency rules, AgentActivityIndicator UI, DocumentDisciplineFooter component, and "tools decide doc creation" discipline
stability: FEATURE_SPEC
last_validated: 2026-04-11
prd_version: 1.0.0
functional_group: REL
---

# Use Cases: Reliability, Activity & Document Discipline (REL)

| ID | Title | Description |
|----|-------|-------------|
| UC-REL-01 | Default to answer_question for factual questions | Research specialist defaults to inline answer_question for factual queries, never deep_research |
| UC-REL-02 | Use find_recommendations for provider/referral queries | Research specialist picks find_recommendations for any "find me N", "best", "top N" query — never deep_research |
| UC-REL-03 | Gate deep_research on explicit user signal | deep_research only fires on "comprehensive", "deep dive", "thorough", "complete guide" — never on agent judgment about complexity |
| UC-REL-04 | Never fabricate provider names or contact info | Synthesis prompt forbids fabrication, sources must be cited, fields omitted when missing |
| UC-REL-05 | Respond with text (no tool calls) for opinions and follow-up analysis | Agent responds inline for "what do you think?", "summarize this", "which is best?" |
| UC-REL-06 | Create documents only when user signals intent to save | Tools decide document creation; no specialist proactive saving |
| UC-REL-07 | Acknowledge find_recommendations results and offer to save | After find_recommendations completes, agent offers save without launching another search |
| UC-REL-08 | Render AgentActivityIndicator with phase-aware messages | Mobile component shows triage → dispatching → tool_execution → synthesis phases with tool-specific text |
| UC-REL-09 | Render DocumentDisciplineFooter inline on responses | "Saved to KB" + "Open →" when doc created; "Save this to KB" quick-action when not |

---

## UC-REL-01 — Default to answer_question for factual questions

Research specialist defaults to `answer_question` (inline, no doc) for factual questions and avoids `quick_research` / `deep_research` unless explicitly signaled.

### Acceptance Criteria

- ☐ Research specialist picks `answer_question` for "what is RAG" (factual query)
- ☐ Research specialist picks `answer_question` for "latest news on GPT-5" (factual, current info)
- ☐ Research specialist picks `answer_question` for "difference between Anthropic and OpenAI" (factual comparison)
- ☐ Research specialist does NOT pick `deep_research` or `quick_research` without an explicit save signal or "comprehensive" keyword
- ☐ Research specialist completes factual queries without creating a document

---

## UC-REL-02 — Use find_recommendations for provider/referral queries

Research specialist picks `find_recommendations` for queries asking for specific named providers, services, or products.

### Acceptance Criteria

- ☐ Research specialist picks `find_recommendations` for "find me 5 career coaches in SF specializing in autism"
- ☐ Research specialist picks `find_recommendations` for "best React state libraries"
- ☐ Research specialist picks `find_recommendations` for "top 3 therapists for ADHD in Oakland"
- ☐ Research specialist picks `find_recommendations` for "who should I hire to redesign my logo"
- ☐ Research specialist does NOT pick `deep_research` for any of these
- ☐ Research specialist does NOT create a document for `find_recommendations` results

---

## UC-REL-03 — Gate deep_research on explicit user signal

Research specialist only calls `deep_research` when the user explicitly uses "comprehensive", "deep dive", "thorough", "complete guide", "full breakdown", or "research report on X" — never on its own judgment about "complexity."

### Acceptance Criteria

- ☐ Research specialist picks `deep_research` when query contains "comprehensive report" or "deep dive"
- ☐ Research specialist picks `deep_research` when query contains "thorough analysis" or "complete guide"
- ☐ Research specialist does NOT pick `deep_research` for "find me N" queries (regardless of how comprehensive-sounding the topic is)
- ☐ Research specialist does NOT pick `deep_research` for "highly rated" or "best" queries (these are recommendation signals)
- ☐ Research specialist creates a document ONLY when it calls `deep_research` or `quick_research`

---

## UC-REL-04 — Never fabricate provider names or contact info

Every named entity in a recommendation result must appear in the cited sources. The synthesis prompt forbids fabrication.

### Acceptance Criteria

- ☐ Every provider name in `find_recommendations` output appears in at least one cited source (verifiable via post-synthesis string-match validator)
- ☐ System omits phone numbers and addresses that are not explicitly in the sources
- ☐ System returns 3-4 entries with partial metadata rather than 5 entries with fake metadata
- ☐ System returns a graceful "I found general information but not enough specific providers" message when sources don't yield 3+ real providers
- ☐ Synthesis prompt explicitly forbids guessing missing fields (OMIT, don't GUESS rule)

---

## UC-REL-05 — Respond with text (no tool calls) for opinions and follow-up analysis

The agent responds with plain text — no tool calls — when the user asks for opinions, analysis, summary, or discussion of content already retrieved.

### Acceptance Criteria

- ☐ Agent responds with text for "what do you think of those?" when prior message has results
- ☐ Agent responds with text for "summarize this" when prior message has a research result
- ☐ Agent responds with text for "which of those is best?" when prior message has a list
- ☐ Agent responds with text for general-knowledge questions it can answer confidently
- ☐ Agent does NOT call any tool when responding to opinion/analysis/discussion prompts
- ☐ Triage classifies "save the 5 coaches you just listed" as `documents` intent + `queryShape='factual'` (extracts content from prior conversation context, not a new search)

---

## UC-REL-06 — Create documents only when user signals intent to save

The agent creates documents only when the user explicitly signals intent to retain, reference, or save the output — never proactively "because it feels comprehensive."

### Acceptance Criteria

- ☐ Agent creates a document when user says "save", "save this", "for later", "bookmark", "add to my KB", "keep this", or "save to notes"
- ☐ Agent creates a document when user asks for "comprehensive report", "deep dive", "thorough analysis", or "complete guide"
- ☐ Agent does NOT create a document for "what is X", "how does Y work", "find me N", or any factual/recommendation query
- ☐ Agent does NOT create a document for follow-up analysis or discussion turns
- ☐ Synthesis prompts enforce "no document" default for `answer_question` and `find_recommendations` actions
- ☐ Tools that ALWAYS create documents (whats_new, assimilate, save_document, quick_research, deep_research) are clearly labeled in the planner specialist's tool descriptions

---

## UC-REL-07 — Acknowledge find_recommendations results and offer to save

After `find_recommendations` returns results, the continuation prompt generates a brief acknowledgment and offers to save — it does NOT launch another search.

### Acceptance Criteria

- ☐ Agent renders the markdown list as the primary response (continuation does NOT re-render the list)
- ☐ Agent appends a brief offer: "Want me to save these to your knowledge base?" (or similar, one sentence)
- ☐ Agent does NOT launch a follow-up search ("let me look for more options") unless the user explicitly asks
- ☐ Agent does NOT call `deep_research` after `find_recommendations` results for the same query
- ☐ Agent waits for user response before taking any further action
- ☐ Continuation hint is wired in `convex/chat/agent.ts` `continueAfterTool` for the `find_recommendations` tool specifically

---

## UC-REL-08 — Render AgentActivityIndicator with phase-aware messages

New `AgentActivityIndicator` mobile component shows progressive activity indicators across triage / dispatch / tool execution / synthesis phases.

### Acceptance Criteria

- ☐ User can see the AgentActivityIndicator display "Thinking…" during the triage phase
- ☐ User can see the indicator transition text when phase changes from triage → dispatching ("Deciding approach…")
- ☐ User can see the indicator display tool-specific text during tool execution ("Finding recommendations…", "Searching your knowledge base…", "Researching…")
- ☐ User can see the indicator display "Writing…" during synthesis phase
- ☐ User can see the indicator animate with a subtle pulse (Animated.Value)
- ☐ Component checks `AccessibilityInfo.isReduceMotionEnabled` and disables animation when true
- ☐ Component renders nothing when `phase === 'idle'`
- ☐ Component uses semantic theme tokens only
- ☐ Component has `testID="agent-activity-indicator"` with sub-element testIDs
- ☐ Component has co-located Storybook stories for each phase (idle, triage, clarifying, dispatching, tool_execution, synthesis)
- ☐ New `useAgentActivity` hook subscribes to agent phase via Convex query and returns `{phase, toolName}`
- ☐ ChatThread.tsx integrates AgentActivityIndicator at bottom of message list, replacing/augmenting the existing TypingIndicator
- ☐ Phase transitions are announced via `AccessibilityInfo.announceForAccessibility` for screen readers

---

## UC-REL-09 — Render DocumentDisciplineFooter inline on responses

New `DocumentDisciplineFooter` mobile component shows "Saved to KB" inline when a document was created or "Save this to KB" quick-action when not.

### Acceptance Criteria

- ☐ User can see the DocumentDisciplineFooter show "Saved to KB" + "Open →" when `savedDocumentId` is provided
- ☐ User can tap "Saved to KB" / "Open →" and navigate to the saved document via expo-router
- ☐ User can see "Save this to KB" quick-action button when `savedDocumentId` is null and `canSave` is true
- ☐ User can tap "Save this to KB" and trigger the save mutation
- ☐ User can see the DocumentDisciplineFooter render nothing when both `savedDocumentId` is null AND `canSave` is false
- ☐ Component uses semantic theme tokens only (semantic.color.onSurface.muted for subtle visual weight)
- ☐ Component is wrapped around assistant text messages and result_card messages in ChatThread.tsx
- ☐ Component has `testID="document-discipline-footer"` with sub-element testIDs
- ☐ Component has co-located Storybook stories: Saved, NotSavedCanSave, NeitherState, SavingInProgress
- ☐ Save success animation: button text swaps to "Saved" with Check icon, fades to muted opacity after 2s
