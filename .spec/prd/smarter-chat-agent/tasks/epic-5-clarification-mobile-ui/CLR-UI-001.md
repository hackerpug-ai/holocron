================================================================================
TASK: CLR-UI-001 - ClarificationQuickReplyChip leaf component
================================================================================

TASK_TYPE: FEATURE
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P0
EFFORT: S
TYPE: DEV
AGENT: react-native-ui-implementer
ESTIMATE_MINUTES: 90
ITERATION: 1

--------------------------------------------------------------------------------
CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

MUST:
- MUST import Text from '@/components/ui/text' (project uses NativeWind, not react-native-paper)
- MUST use Tailwind className tokens (text-primary, bg-muted, border-border, text-muted-foreground) — no hardcoded colors, hex, rgba, or inline fontSize
- MUST expose testID prop with pattern 'quick-reply-chip-{index}' and wire it to the root Pressable
- MUST set accessibilityState.disabled=true and skip onPress when disabled prop is true
- MUST co-locate ClarificationQuickReplyChip.stories.tsx with Default, Disabled, LongLabel stories and a play function that asserts onQuickReply is called with the label on tap

NEVER:
- NEVER import Text from 'react-native' or 'react-native-paper'
- NEVER hardcode hex colors, rgba, or pixel spacing values
- NEVER call onQuickReply when disabled is true

STRICTLY:
- STRICTLY write test first (RED) using @testing-library/react-native before implementation
- STRICTLY use Pressable from react-native (not Button) so the chip can accept NativeWind className

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective**: Ship a pressable pill chip that renders a clarification quick-reply label and fires onQuickReply with the label on tap, respecting disabled state and accessibility.

**Success looks like**: ClarificationQuickReplyChip renders in Storybook (3 stories), play function passes, unit tests exercise tap + disabled paths, tsc and lint pass.

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

**Problem**: Clarification messages need optional quick-reply chips so the user can answer a clarification in one tap ("SF", "NYC", "LA") instead of typing. Without a dedicated leaf component, each consumer would reimplement the pill with drifted styling.

**Why it matters**: CLR-UI-002 (the bubble) composes this chip. Building it as a standalone testable leaf keeps tests fast and the composite simple.

**Current state**: No chip component exists.

**Desired state**: A single-responsibility pressable pill with testID, accessibility state, disabled path, and Storybook coverage.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: renders label
  GIVEN: a chip with label='San Francisco'
  WHEN: rendered
  THEN: screen.getByText('San Francisco') resolves
  VERIFY: `pnpm vitest run components/chat/ClarificationQuickReplyChip.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-2: fires onQuickReply on press
  GIVEN: an enabled chip with testID='quick-reply-chip-0'
  WHEN: user presses it
  THEN: onQuickReply mock is called once with 'San Francisco'
  VERIFY: `pnpm vitest run components/chat/ClarificationQuickReplyChip.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-3: does not fire when disabled
  GIVEN: disabled=true
  WHEN: user presses
  THEN: onQuickReply is not called and accessibilityState.disabled is true
  VERIFY: `pnpm vitest run components/chat/ClarificationQuickReplyChip.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-4: storybook play function passes
  GIVEN: the Default story
  WHEN: vitest storybook project runs
  THEN: ClickChip play asserts callback invocation and exits 0
  VERIFY: `vitest --project=storybook --run`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

--------------------------------------------------------------------------------
TEST CRITERIA (Boolean Verification)
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | ClarificationQuickReplyChip renders the label prop as visible Text | AC-1 | `pnpm vitest run components/chat/ClarificationQuickReplyChip.test.tsx` | [ ] TRUE [ ] FALSE |
| 2 | onQuickReply callback receives label string when chip is pressed in enabled state | AC-2 | `pnpm vitest run components/chat/ClarificationQuickReplyChip.test.tsx` | [ ] TRUE [ ] FALSE |
| 3 | onQuickReply is not invoked when disabled prop is true | AC-3 | `pnpm vitest run components/chat/ClarificationQuickReplyChip.test.tsx` | [ ] TRUE [ ] FALSE |
| 4 | accessibilityState.disabled equals true when disabled prop is true | AC-3 | `pnpm vitest run components/chat/ClarificationQuickReplyChip.test.tsx` | [ ] TRUE [ ] FALSE |
| 5 | Storybook Default story play function exits 0 and asserts onQuickReply call | AC-4 | `vitest --project=storybook --run` | [ ] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `.spec/prd/smarter-chat-agent/06-uc-clr.md` (lines 165-178) — UC-CLR-10 acceptance criteria
2. `components/ui/button.tsx` (ALL) — NativeWind pressable variant pattern with className forwarding
3. `components/ui/badge.tsx` (ALL) — pill/chip styling with cn() and variants
4. `components/ui/result-card.stories.tsx` (lines 1-40) — storybook meta and story shape in this project

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `components/chat/ClarificationQuickReplyChip.tsx` (NEW)
- `components/chat/ClarificationQuickReplyChip.stories.tsx` (NEW)
- `components/chat/ClarificationQuickReplyChip.test.tsx` (NEW)

WRITE-PROHIBITED:
- `components/chat/ChatThread.tsx` (integration is INT-UI-002)
- `components/chat/ClarificationMessage.tsx` (separate task CLR-UI-002)

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

**Source**: `components/ui/button.tsx` + `components/ui/badge.tsx`

```tsx
import { Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

interface Props {
  label: string
  onQuickReply: (label: string) => void
  disabled?: boolean
  testID?: string
}

export function ClarificationQuickReplyChip({ label, onQuickReply, disabled, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => !disabled && onQuickReply(label)}
      className={cn(
        'rounded-full border border-border bg-muted px-3 py-1.5 active:opacity-80',
        disabled && 'opacity-50',
      )}
    >
      <Text className="text-sm text-foreground">{label}</Text>
    </Pressable>
  )
}
```

**Anti-pattern**: `import { Button } from 'react-native-paper'` — WRONG, project is NativeWind.

**Interaction notes**:
- Pill shape — `rounded-full`, border, `px-3 py-1.5`
- Pressed state uses `active:opacity-80`
- Disabled visually muted (`opacity-50`) and `accessibilityState.disabled=true`

**Design references**:
- `.spec/prd/smarter-chat-agent/06-uc-clr.md` UC-CLR-10

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

| Gate | Command | Expected |
|------|---------|----------|
| Unit tests | `pnpm vitest run components/chat/ClarificationQuickReplyChip.test.tsx` | Exit 0 |
| Type check | `pnpm tsc --noEmit` | Exit 0 |
| Lint | `pnpm lint` | Exit 0 |
| Storybook play | `vitest --project=storybook --run` | Exit 0 |

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: react-native-ui-implementer
**Rationale**: Small pressable leaf with TDD, NativeWind styling, testID, Storybook story with play function, disabled-state accessibility.

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

**Depends On**: (none — leaf, can run in parallel with Epic 1)
**Blocks**: CLR-UI-002

--------------------------------------------------------------------------------
PRD REFS
--------------------------------------------------------------------------------

- `.spec/prd/smarter-chat-agent/06-uc-clr.md` UC-CLR-10
- `.spec/prd/smarter-chat-agent/09-technical-requirements.md` Task #17

================================================================================
