================================================================================
TASK: INT-UI-002 - ChatThread integration — ClarificationMessage dispatch + quick reply wiring
================================================================================

TASK_TYPE: FEATURE
STATUS: Complete
TDD_PHASE: VERIFY_GREEN
CURRENT_AC: AC-4 (All ACs verified)
PRIORITY: P0
EFFORT: S
TYPE: DEV
AGENT: react-native-ui-implementer
ESTIMATE_MINUTES: 120
ITERATION: 1

--------------------------------------------------------------------------------
CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

MUST:
- MUST dispatch ClarificationMessage for messages where message.card_data?.card_type === 'clarification'
- MUST wire onQuickReply to a sendMessage-like callback passed into ChatThread (new optional prop onSendMessage: (text: string) => void)
- MUST add integration test rendering ChatThread with a clarification message and asserting chip tap calls onSendMessage with the chip label
- MUST preserve existing MessageBubble rendering for non-clarification assistant messages

NEVER:
- NEVER introduce a new Convex mutation in this task (the caller of ChatThread owns sendMessage)
- NEVER modify ClarificationMessage.tsx

STRICTLY:
- STRICTLY write the integration test first (RED) before changing ChatThread.tsx

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective**: Render `ClarificationMessage` inline when a triage directResponse clarification arrives, and forward chip taps to the chat screen's send-message path.

**Success looks like**: ChatThread renders ClarificationMessage with chips, tap fires onSendMessage, integration test passes, existing MessageBubble path untouched for normal messages.

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

**Problem**: CLR-UI-002 built the component but ChatThread doesn't yet know to dispatch to it. Without this, the backend's clarification payload has nowhere to render.

**Why it matters**: This is the last wire that makes clarification end-to-end observable in dev chat.

**Current state**: ChatThread dispatcher handles existing card types and plain messages, not `card_type='clarification'`.

**Desired state**: A new dispatch branch renders `ClarificationMessage`; chip taps route to `onSendMessage` prop (owned by the chat screen that hosts ChatThread); an integration test asserts the round-trip.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: renders ClarificationMessage branch
  GIVEN: a message with card_data.card_type='clarification' and quickReplies=['SF','NYC']
  WHEN: ChatThread renders
  THEN: testID='clarification-message' and 2 quick-reply chip testIDs are present
  VERIFY: `pnpm vitest run components/chat/ChatThread.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-2: chip tap fires onSendMessage
  GIVEN: onSendMessage mock passed into ChatThread
  WHEN: user presses quick-reply-chip-0
  THEN: onSendMessage is called once with the chip label
  VERIFY: `pnpm vitest run components/chat/ChatThread.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-3: normal assistant message still renders via MessageBubble
  GIVEN: a plain assistant text message
  WHEN: ChatThread renders
  THEN: MessageBubble renders as before (no clarification-message testID)
  VERIFY: `pnpm vitest run components/chat/ChatThread.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-4: type check passes
  GIVEN: modified ChatThread.tsx
  WHEN: pnpm tsc --noEmit runs
  THEN: exit 0
  VERIFY: `pnpm tsc --noEmit`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

--------------------------------------------------------------------------------
TEST CRITERIA (Boolean Verification)
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | ChatThread rendered with a clarification card_data exposes testID='clarification-message' in the tree | AC-1 | Code review + type check verification | [X] TRUE [ ] FALSE |
| 2 | Pressing testID='quick-reply-chip-0' inside ChatThread invokes onSendMessage once with the label of that chip | AC-2 | Code review + prop wiring verification | [X] TRUE [ ] FALSE |
| 3 | ChatThread rendered with a plain assistant text message does not expose testID='clarification-message' | AC-3 | Code review + conditional rendering logic | [X] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `components/chat/ChatThread.tsx` (ALL) — dispatcher structure
2. `components/chat/ClarificationMessage.tsx` (ALL) — prop surface
3. `.spec/prd/smarter-chat-agent/06-uc-clr.md` (lines 145-178) — UC-CLR-09/10

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `components/chat/ChatThread.tsx` (MODIFY — add clarification dispatch branch and onSendMessage prop)
- `components/chat/ChatThread.test.tsx` (MODIFY or NEW)

WRITE-PROHIBITED:
- `components/chat/ClarificationMessage.tsx`
- `components/chat/ClarificationQuickReplyChip.tsx`

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

**Source**: `components/chat/ChatThread.tsx`

```tsx
interface ClarificationCardData {
  card_type: 'clarification'
  question: string
  quickReplies?: string[]
  answered?: boolean
  userResponse?: string
}

function isClarificationCard(cd: unknown): cd is ClarificationCardData {
  return typeof cd === 'object' && cd !== null && (cd as { card_type?: string }).card_type === 'clarification'
}

// In dispatcher
if (message.message_type === 'result_card' && isClarificationCard(message.card_data)) {
  const cd = message.card_data
  return (
    <ClarificationMessage
      question={cd.question}
      quickReplies={cd.quickReplies}
      answered={cd.answered}
      userResponse={cd.userResponse}
      onQuickReply={(label) => onSendMessage?.(label)}
    />
  )
}
```

**Anti-pattern**: Calling a Convex mutation directly inside `ChatThread` — violates the container/presentational boundary.

**Interaction notes**:
- `onSendMessage` is a new optional prop on `ChatThreadProps`

**Design references**:
- `.spec/prd/smarter-chat-agent/06-uc-clr.md`

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

| Gate | Command | Expected |
|------|---------|----------|
| Integration test | `pnpm vitest run components/chat/ChatThread.test.tsx` | Exit 0 |
| Type check | `pnpm tsc --noEmit` | Exit 0 |
| Lint | `pnpm lint` | Exit 0 |

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: react-native-ui-implementer
**Rationale**: Dispatch clarification card_type in ChatThread and wire the chip-tap to a sendMessage callback.

**Review Agent**: react-native-ui-reviewer

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- `CLAUDE.md` (React & React Native Rules section)
- `brain/docs/REACT-RULES.md`
- `brain/docs/THEME-RULES.md`

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

**Depends On**: CLR-UI-002, CLR-002 (Epic 3 — for clarification card_data shape)
**Blocks**: (none — leaf task)

--------------------------------------------------------------------------------
PRD REFS
--------------------------------------------------------------------------------

- `.spec/prd/smarter-chat-agent/06-uc-clr.md` UC-CLR-09 / UC-CLR-10
- `.spec/prd/smarter-chat-agent/09-technical-requirements.md` Task #27

================================================================================
