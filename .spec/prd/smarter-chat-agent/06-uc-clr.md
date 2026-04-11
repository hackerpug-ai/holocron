---
name: Use Cases — Clarification & Multi-Turn Coherence
description: Triage emits clarifying questions for ambiguous queries via directResponse short-circuit, persistent pendingIntent on conversation document, and ClarificationMessage mobile component
stability: FEATURE_SPEC
last_validated: 2026-04-11
prd_version: 1.0.0
functional_group: CLR
---

# Use Cases: Clarification & Multi-Turn Coherence (CLR)

| ID | Title | Description |
|----|-------|-------------|
| UC-CLR-01 | Ask clarifying question for queries missing blocking variables | Triage identifies missing location, count, topic, or target and emits one focused clarifying question |
| UC-CLR-02 | Emit clarifying question in same triage turn (no extra LLM call) | Clarifying questions generated inside the triage LLM call via directResponse, no second model in the loop |
| UC-CLR-03 | Cap clarification depth at 1 per conversation | Hard cap prevents loops; agent takes best guess after one clarification |
| UC-CLR-04 | Preserve original intent when user answers clarifying question | pendingIntent persistence on conversation doc keeps the original recommendation request alive across rounds |
| UC-CLR-05 | Detect topic change during clarification round | High-confidence topic change clears pending state |
| UC-CLR-06 | Generate contextual clarifying questions, not generic ones | Triage asks specific questions ("Where are you located, and any specialty?") not "tell me more" |
| UC-CLR-07 | Skip clarification when all blocking variables are present | Well-formed queries with location, count, target bypass clarification entirely |
| UC-CLR-08 | Persist pending state on conversations table | Schema delta adds pendingIntent, pendingQueryShape, pendingSince fields |
| UC-CLR-09 | Render ClarificationMessage on mobile | Subtle accent treatment with "Quick question" label and optional quick-reply chips |
| UC-CLR-10 | Tap quick-reply chip to answer clarification | Single tap sends the chip label as a user message, dismissing chips and resuming original intent |

---

## UC-CLR-01 — Ask clarifying question for queries missing blocking variables

Agent identifies queries missing **blocking** variables (location, count, topic, target) and asks a single focused clarifying question before acting. Modulating preferences (count, format) get sensible defaults.

### Acceptance Criteria

- ☐ Triage asks one focused clarifying question when location is missing from a local recommendation query ("find me career coaches" → ask "Where are you located?")
- ☐ Triage asks for specialty/topic when a provider query lacks it ("find me a therapist" → ask "What kind of therapy?")
- ☐ Triage asks for target content when a save query lacks it ("save this" with no prior content → ask "What would you like me to save?")
- ☐ Triage does NOT ask for modulating preferences ("3 vs 5 referrals" — pick 5 and mention it's adjustable)
- ☐ Triage asks at most ONE question per turn (no multi-question clarifications)
- ☐ Triage joins at most 2 sub-questions with "and" inside a single clarifying message

---

## UC-CLR-02 — Emit clarifying question in same triage turn (no extra LLM call)

Clarifying questions are generated inside the triage LLM call via `directResponse`, not through a separate clarification specialist or `ask_clarifying_question` tool.

### Acceptance Criteria

- ☐ Triage returns `directResponse` containing a one-sentence clarifying question when `queryShape='ambiguous'`
- ☐ Orchestrator short-circuits specialist dispatch when `directResponse` is set AND (`intent='conversation'` OR `queryShape='ambiguous'`) AND `confidence != 'low'`
- ☐ System does NOT create a tool approval message for clarifications (no "Use Ask Clarifying Question tool" ceremony)
- ☐ System delivers clarifying question to user in under 500ms p95 (triage is the only LLM call in this path)
- ☐ System does NOT dispatch to any specialist when the clarification gate fires

---

## UC-CLR-03 — Cap clarification depth at 1 per conversation

The agent refuses to ask a second clarifying question without first attempting to act. Instead, it takes its best guess and acts, mentioning any assumptions.

### Acceptance Criteria

- ☐ System tracks `clarificationDepth` counter on conversation document
- ☐ System increments counter when triage emits an ambiguous-shape directResponse
- ☐ Triage does NOT emit another ambiguous-shape directResponse when `clarificationDepth >= 1` (hard cap)
- ☐ Agent takes best guess and acts with mentioned assumptions when hitting the cap ("Showing online coaches since location wasn't specified — let me know if you want local options")
- ☐ System resets `clarificationDepth` to 0 after a non-ambiguous turn completes
- ☐ Cap is enforced deterministically in the orchestrator, not via prompt rule alone

---

## UC-CLR-04 — Preserve original intent when user answers clarifying question

When the user responds to a clarifying question, the agent resumes the original request using the new information — it does NOT re-classify the answer as a fresh query.

### Acceptance Criteria

- ☐ User can answer a clarifying question and have the original recommendation intent preserved across the turn
- ☐ System persists `pendingIntent` and `pendingQueryShape` on conversation when triage emits an ambiguous directResponse
- ☐ Orchestrator prepends a system message to triage input on the next turn: "The user is mid-request. Their original intent was {pendingIntent} with shape {pendingQueryShape}."
- ☐ Triage preserves original intent + shape when user replies with the missing information (e.g., "SF" → still research + recommendation)
- ☐ System clears pending state after the follow-up turn completes
- ☐ Pending state expires after 30 minutes (checked via pendingSince)

---

## UC-CLR-05 — Detect topic change during clarification round

If the user changes topic during a clarification round instead of answering, the agent respects the new topic and drops the pending intent.

### Acceptance Criteria

- ☐ Triage detects when user's follow-up is a clearly different topic (high-confidence classification to a different intent)
- ☐ System clears `pendingIntent` and `pendingQueryShape` when triage classifies with high confidence to a different intent
- ☐ System does NOT force the pending intent onto a clearly off-topic message
- ☐ System logs topic-change events to telemetry: `{turnNumber, oldPendingIntent, newIntent, detectedBy}`
- ☐ Medium/low confidence topic change keeps pending state (biases toward preserving user intent)

---

## UC-CLR-06 — Generate contextual clarifying questions, not generic ones

The clarifying question is specific to what's missing — not a generic "tell me more."

### Acceptance Criteria

- ☐ Triage asks "Where are you located, and is there a specialty you're looking for?" for "find me a coach" (not "tell me more")
- ☐ Triage asks "What's your budget and condition preference?" for "I need a laptop" (not "be more specific")
- ☐ Triage asks "Which part of the app is this about?" for vague improvement requests (not "describe it more")
- ☐ Triage asks at most 2 specific sub-questions within a single clarifying message
- ☐ Triage includes example values when helpful ("e.g., career transitions, executive, neurodivergent support")

---

## UC-CLR-07 — Skip clarification when all blocking variables are present

Well-formed queries with location, count, and target all present bypass clarification entirely.

### Acceptance Criteria

- ☐ Triage does NOT emit `queryShape='ambiguous'` for "find me 5 career coaches in SF specializing in autism" (all blocking vars present)
- ☐ Triage does NOT emit `queryShape='ambiguous'` for "what is RAG" (factual query with no blocking vars)
- ☐ Triage does NOT add unnecessary clarification steps for any query in the non-ambiguous eval set
- ☐ System routes directly to the matching specialist when no blocking variables are missing

---

## UC-CLR-08 — Persist pending state on conversations table

Schema delta adds 3 optional fields to the `conversations` table for multi-turn intent coherence. All optional for backward compatibility.

### Acceptance Criteria

- ☐ Conversations schema supports `pendingIntent: v.optional(v.string())`, `pendingQueryShape: v.optional(v.string())`, `pendingSince: v.optional(v.number())`
- ☐ Existing conversations continue to work without the fields (all optional)
- ☐ Backend writes these fields when triage returns ambiguous via `setPendingIntent` internal mutation
- ☐ Backend clears these fields when the user's next turn resolves the ambiguity via `clearPendingIntent` internal mutation
- ☐ Pending state expires after 30 minutes (checked via `pendingSince` against current time)
- ☐ Actions call mutations via `ctx.runMutation` — never use `ctx.db.patch` from actions
- ☐ Mutations validate that conversation exists before patching
- ☐ TypeScript types reflect the optionality of the new fields
- ☐ No backfill migration is needed — fields populate organically on new ambiguous turns

---

## UC-CLR-09 — Render ClarificationMessage on mobile

New `ClarificationMessage` React Native component visually distinguishes a triage-emitted clarifying question from a regular agent message.

### Acceptance Criteria

- ☐ User can see a clarification message visually distinct from normal agent messages (subtle accent + "Quick question" label)
- ☐ User can see the "Quick question" label in labelSmall Paper variant with accent color (semantic.color.primary.default)
- ☐ User can see the clarification question rendered as bodyMedium Paper Text
- ☐ User can see 2-4 quick-reply chips when provided with quickReplies prop
- ☐ User can see the clarification message render without quick-reply chips when none provided
- ☐ User can see the user's response threaded visually to the clarification (indent or connector)
- ☐ User can see chips become disabled (visually muted, accessibilityState.disabled = true) once the question has been answered
- ☐ Component uses semantic theme tokens only
- ☐ Component has `testID="clarification-message"` with sub-element testIDs (`clarification-question`, `quick-reply-chip-{index}`, `clarification-user-response`)
- ☐ Component has co-located Storybook stories: Default, WithQuickReplies, WithMaximumChips, Answered, WithUserResponse, LongQuestion
- ☐ Storybook play function for `ClickChip` interaction asserts `onQuickReply` callback called with correct label

---

## UC-CLR-10 — Tap quick-reply chip to answer clarification

`ClarificationQuickReplyChip` sub-component renders an individual chip; tapping it triggers `onQuickReply` callback which sends the chip label as a user message.

### Acceptance Criteria

- ☐ User can tap a quick-reply chip and trigger `onQuickReply` callback with the chip's label
- ☐ Component renders the label
- ☐ Component does NOT call onPress when disabled
- ☐ Component has `accessibilityState.disabled = true` when disabled
- ☐ Component uses semantic.color.primary.default / .pressed / .disabled for state colors
- ☐ Component has co-located Storybook stories: Default, Disabled, LongLabel
- ☐ ChatThread.tsx wires `onQuickReply` to `sendMessage` mutation so a chip tap sends a normal user message that visually continues the conversation thread
