================================================================================
TASK: CLR-UI-002 - ClarificationMessage bubble with quick-reply chips
================================================================================

TASK_TYPE: FEATURE
STATUS: Complete
TDD_PHASE: VERIFY_GREEN
CURRENT_AC: AC-6 (All ACs verified)
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
- MUST import Text from '@/components/ui/text'
- MUST render 'Quick question' label in small muted type with a primary accent (text-primary)
- MUST render the question body as Text with Tailwind class text-base text-foreground
- MUST accept quickReplies?: string[] prop and render 0-4 chips via ClarificationQuickReplyChip (index-based testIDs)
- MUST apply a left-edge accent stripe using a bordered View className='border-l-2 border-primary pl-3'
- MUST expose testID='clarification-message' plus sub-testIDs 'clarification-question', 'clarification-user-response', and per-chip testIDs

NEVER:
- NEVER import from react-native-paper
- NEVER hardcode colors or spacing (use Tailwind tokens)
- NEVER call onQuickReply after the question has been answered (answered=true must render chips disabled)

STRICTLY:
- STRICTLY TDD — test file drives implementation
- STRICTLY include co-located stories Default, WithQuickReplies, WithMaximumChips, Answered, WithUserResponse, LongQuestion

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective**: Render a visually-distinct clarification bubble with optional quick-reply chips, an answered/disabled state, and optional threaded user response beneath.

**Success looks like**: ClarificationMessage renders in 6 Storybook stories, unit tests exercise each prop combination, play function for WithQuickReplies asserts chip tap, full gates pass.

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

**Problem**: Clarification bubbles need to look visually distinct from regular assistant messages so the user knows the agent is asking a question, not answering. Without a dedicated component, clarifications would look like ordinary messages and lose their affordance.

**Why it matters**: The left-edge accent stripe + "Quick question" label + optional chips encode the clarification affordance in a way users can learn once and recognize forever.

**Current state**: Existing assistant messages render via `MessageBubble.tsx` with no clarification styling.

**Desired state**: A single dedicated component with the accent stripe, label, question, optional chips, optional threaded user response, and answered-state handling.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: renders question and label
  GIVEN: question='Where are you located?'
  WHEN: rendered
  THEN: both 'Quick question' and the question are visible
  VERIFY: `pnpm vitest run components/chat/ClarificationMessage.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-2: renders chips when provided
  GIVEN: quickReplies=['SF','NYC','LA']
  WHEN: rendered
  THEN: 3 chips render with testIDs quick-reply-chip-0..2
  VERIFY: `pnpm vitest run components/chat/ClarificationMessage.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-3: chips disabled when answered
  GIVEN: answered=true
  WHEN: rendered
  THEN: each chip has accessibilityState.disabled=true and onQuickReply is not invoked on press
  VERIFY: `pnpm vitest run components/chat/ClarificationMessage.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-4: threaded user response renders when provided
  GIVEN: userResponse='SF'
  WHEN: rendered
  THEN: a View with testID='clarification-user-response' renders the response indented beneath the question
  VERIFY: `pnpm vitest run components/chat/ClarificationMessage.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-5: hides chips when none provided
  GIVEN: quickReplies=undefined
  WHEN: rendered
  THEN: no quick-reply-chip testIDs are present
  VERIFY: `pnpm vitest run components/chat/ClarificationMessage.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-6: storybook stories render
  GIVEN: all 6 stories
  WHEN: vitest storybook project runs
  THEN: all stories render without errors and the WithQuickReplies play function passes
  VERIFY: `vitest --project=storybook --run`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

--------------------------------------------------------------------------------
TEST CRITERIA (Boolean Verification)
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | ClarificationMessage renders the 'Quick question' label as visible Text | AC-1 | Code review + Storybook visual verification | [X] TRUE [ ] FALSE |
| 2 | ClarificationMessage renders 3 ClarificationQuickReplyChip children when quickReplies length=3 | AC-2 | Code review + Storybook visual verification | [X] TRUE [ ] FALSE |
| 3 | Pressing a chip when answered=true does not invoke onQuickReply | AC-3 | Code review + disabled prop handling | [X] TRUE [ ] FALSE |
| 4 | testID='clarification-user-response' is present when userResponse prop is non-empty | AC-4 | Code review + testID prop verification | [X] TRUE [ ] FALSE |
| 5 | No element with testID matching /^quick-reply-chip-/ when quickReplies is undefined | AC-5 | Code review + conditional rendering logic | [X] TRUE [ ] FALSE |
| 6 | Storybook WithQuickReplies play function asserts onQuickReply was called with the tapped chip label | AC-6 | Storybook play function implemented | [X] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `.spec/prd/smarter-chat-agent/06-uc-clr.md` (lines 145-178) — UC-CLR-09 and UC-CLR-10 ACs
2. `components/chat/MessageBubble.tsx` (ALL) — existing assistant message bubble layout pattern
3. `components/ui/card.tsx` (ALL) — NativeWind container pattern

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `components/chat/ClarificationMessage.tsx` (NEW)
- `components/chat/ClarificationMessage.stories.tsx` (NEW)
- `components/chat/ClarificationMessage.test.tsx` (NEW)

WRITE-PROHIBITED:
- `components/chat/ChatThread.tsx` (integration in INT-UI-002)
- `components/chat/ClarificationQuickReplyChip.tsx` (completed in CLR-UI-001)

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

**Source**: `components/chat/MessageBubble.tsx` + `components/ui/card.tsx`

```tsx
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { ClarificationQuickReplyChip } from './ClarificationQuickReplyChip'

interface Props {
  question: string
  quickReplies?: string[]
  answered?: boolean
  userResponse?: string
  onQuickReply?: (label: string) => void
}

export function ClarificationMessage({ question, quickReplies, answered, userResponse, onQuickReply }: Props) {
  return (
    <View testID="clarification-message" className="border-l-2 border-primary pl-3 py-2 my-2">
      <Text className="text-xs uppercase tracking-wide text-primary mb-1">Quick question</Text>
      <Text testID="clarification-question" className="text-base text-foreground">{question}</Text>
      {quickReplies && quickReplies.length > 0 && (
        <View className="flex-row flex-wrap gap-2 mt-2">
          {quickReplies.map((label, i) => (
            <ClarificationQuickReplyChip
              key={label}
              label={label}
              disabled={answered}
              onQuickReply={(l) => onQuickReply?.(l)}
              testID={`quick-reply-chip-${i}`}
            />
          ))}
        </View>
      )}
      {userResponse && (
        <View testID="clarification-user-response" className="mt-2 ml-2 pl-2 border-l border-border">
          <Text className="text-sm text-muted-foreground">{userResponse}</Text>
        </View>
      )}
    </View>
  )
}
```

**Anti-pattern**: Using `StyleSheet.create` with hardcoded `borderColor='#6750A4'` instead of `className='border-primary'`.

**Interaction notes**:
- Left accent stripe via `border-l-2 border-primary`
- Label 'Quick question' in `text-xs uppercase tracking-wide text-primary`
- Chips wrap in a `flex-row flex-wrap gap-2`
- User response, if present, is rendered inside an indented View under the question

**Design references**:
- `.spec/prd/smarter-chat-agent/06-uc-clr.md` UC-CLR-09

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

| Gate | Command | Expected |
|------|---------|----------|
| Unit tests | `pnpm vitest run components/chat/ClarificationMessage.test.tsx` | Exit 0 |
| Type check | `pnpm tsc --noEmit` | Exit 0 |
| Lint | `pnpm lint` | Exit 0 |
| Storybook | `vitest --project=storybook --run` | Exit 0 |

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: react-native-ui-implementer
**Rationale**: Composite chat bubble with subtle accent, optional chip row, user-response threading, 6+ stories, answered state logic.

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

**Depends On**: CLR-UI-001, INT-001
**Blocks**: INT-UI-002

--------------------------------------------------------------------------------
PRD REFS
--------------------------------------------------------------------------------

- `.spec/prd/smarter-chat-agent/06-uc-clr.md` UC-CLR-09
- `.spec/prd/smarter-chat-agent/09-technical-requirements.md` Task #18

================================================================================
