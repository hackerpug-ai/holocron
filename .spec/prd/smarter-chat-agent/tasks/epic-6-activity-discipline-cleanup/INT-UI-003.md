================================================================================
TASK: INT-UI-003 - ChatThread integration — DocumentDisciplineFooter wrap + save-to-KB wiring
================================================================================

TASK_TYPE: FEATURE
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P0
EFFORT: M
TYPE: DEV
AGENT: react-native-ui-implementer
ESTIMATE_MINUTES: 150
ITERATION: 1

--------------------------------------------------------------------------------
CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

MUST:
- MUST wrap each assistant-role message bubble and result_card with DocumentDisciplineFooter when the message is eligible (assistant role, not loading, not clarification)
- MUST read savedDocumentId from message.card_data?.savedDocumentId when present; else null
- MUST pass canSave=true for answer_question, find_recommendations, and plain text assistant messages; canSave=false for loading cards, clarifications, and messages that already created a document
- MUST forward onSaveToKB to a new optional ChatThreadProps prop onSaveMessageToKB(messageId: string)
- MUST add an integration test asserting Save tap calls onSaveMessageToKB with the correct messageId

NEVER:
- NEVER call a Convex mutation inside ChatThread
- NEVER render the footer under user-role messages
- NEVER wrap clarification messages with the footer

STRICTLY:
- STRICTLY the eligibility rule lives in a small pure helper 'isFooterEligible(message)' that is directly unit-tested

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective**: Wrap every eligible assistant message in `ChatThread` with `DocumentDisciplineFooter`, wire Save callback to a new `ChatThreadProps` prop, and surface the helper for testing.

**Success looks like**: Assistant messages render with the footer, user messages do not, clarifications do not, loading cards do not. Integration test asserts save wiring and helper unit tests cover eligibility.

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

**Problem**: REL-UI-003 built the footer component, but `ChatThread` doesn't yet wrap messages with it. Without this integration, the footer is dead code.

**Why it matters**: The footer must appear on every eligible assistant message automatically — the user shouldn't have to hunt for a save action. Wrapping at the dispatcher layer makes it uniform.

**Current state**: ChatThread dispatches messages to MessageBubble or result_card variants without any footer.

**Desired state**: A pure `isFooterEligible(message)` helper determines which messages get wrapped; the dispatcher wraps them; the Save callback routes to `onSaveMessageToKB(messageId)` passed from the chat screen.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: footer renders under assistant text
  GIVEN: an assistant-role plain text message
  WHEN: rendered by ChatThread
  THEN: testID='document-discipline-footer' is present
  VERIFY: `pnpm vitest run components/chat/ChatThread.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-2: no footer on user messages
  GIVEN: a user-role message
  WHEN: rendered
  THEN: testID='document-discipline-footer' is absent
  VERIFY: `pnpm vitest run components/chat/ChatThread.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-3: no footer on clarification
  GIVEN: a clarification card_data
  WHEN: rendered
  THEN: testID='document-discipline-footer' is absent
  VERIFY: `pnpm vitest run components/chat/ChatThread.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-4: save fires prop
  GIVEN: onSaveMessageToKB mock
  WHEN: user presses testID='document-discipline-save'
  THEN: onSaveMessageToKB is called once with the message id
  VERIFY: `pnpm vitest run components/chat/ChatThread.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-5: savedDocumentId surfaces Open link
  GIVEN: a message with card_data.savedDocumentId='doc1'
  WHEN: rendered
  THEN: testID='document-discipline-open' is present
  VERIFY: `pnpm vitest run components/chat/ChatThread.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-6: helper is pure and tested
  GIVEN: isFooterEligible(message)
  WHEN: called with each message shape
  THEN: returns the documented boolean per the eligibility table
  VERIFY: `pnpm vitest run components/chat/ChatThread.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

--------------------------------------------------------------------------------
TEST CRITERIA (Boolean Verification)
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | A plain assistant-role message exposes testID='document-discipline-footer' | AC-1 | `pnpm vitest run components/chat/ChatThread.test.tsx` | [ ] TRUE [ ] FALSE |
| 2 | A user-role message does not expose testID='document-discipline-footer' | AC-2 | `pnpm vitest run components/chat/ChatThread.test.tsx` | [ ] TRUE [ ] FALSE |
| 3 | A clarification message does not expose testID='document-discipline-footer' | AC-3 | `pnpm vitest run components/chat/ChatThread.test.tsx` | [ ] TRUE [ ] FALSE |
| 4 | Pressing testID='document-discipline-save' invokes onSaveMessageToKB once with the original message id | AC-4 | `pnpm vitest run components/chat/ChatThread.test.tsx` | [ ] TRUE [ ] FALSE |
| 5 | A message with card_data.savedDocumentId results in testID='document-discipline-open' being present | AC-5 | `pnpm vitest run components/chat/ChatThread.test.tsx` | [ ] TRUE [ ] FALSE |
| 6 | isFooterEligible returns false for role='user' and true for role='assistant' without savedDocumentId | AC-6 | `pnpm vitest run components/chat/ChatThread.test.tsx` | [ ] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `components/chat/ChatThread.tsx` (ALL) — message dispatching structure
2. `components/chat/DocumentDisciplineFooter.tsx` (ALL) — prop surface
3. `.spec/prd/smarter-chat-agent/07-uc-rel.md` (lines 150-166) — UC-REL-09 ACs

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `components/chat/ChatThread.tsx` (MODIFY)
- `components/chat/ChatThread.test.tsx` (MODIFY or NEW)

WRITE-PROHIBITED:
- `components/chat/DocumentDisciplineFooter.tsx`
- `convex/**` (save mutation already exists)

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

**Source**: `components/chat/ChatThread.tsx` existing dispatcher

```ts
export function isFooterEligible(m: ChatMessage): boolean {
  if (m.role !== 'assistant') return false
  const ct = m.card_data?.card_type
  if (ct === 'clarification') return false
  if (ct === 'deep_research_loading') return false
  return true
}

// In render
{isFooterEligible(m) && (
  <DocumentDisciplineFooter
    savedDocumentId={m.card_data?.savedDocumentId ?? null}
    canSave={!m.card_data?.savedDocumentId}
    onSaveToKB={() => onSaveMessageToKB?.(m.id)}
  />
)}
```

**Anti-pattern**: Calling `useMutation` inside ChatThread — couples presentation to backend.

**Interaction notes**:
- Wrap inline so the footer scrolls with the bubble
- `isFooterEligible` is a pure helper exported for tests

**Design references**:
- `.spec/prd/smarter-chat-agent/07-uc-rel.md` UC-REL-09

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
**Rationale**: Wrap assistant text messages and eligible result_cards with DocumentDisciplineFooter, wire save mutation via a new onSaveMessageToKB prop; covers both Task #28 and Task #30.

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

**Depends On**: REL-UI-003
**Blocks**: (none — leaf)

--------------------------------------------------------------------------------
PRD REFS
--------------------------------------------------------------------------------

- `.spec/prd/smarter-chat-agent/07-uc-rel.md` UC-REL-09
- `.spec/prd/smarter-chat-agent/09-technical-requirements.md` Task #28 and Task #30

================================================================================
