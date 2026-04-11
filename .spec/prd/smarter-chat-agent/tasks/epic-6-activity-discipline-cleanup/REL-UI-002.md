================================================================================
TASK: REL-UI-002 - AgentActivityIndicator phase-aware component
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
- MUST import Text from '@/components/ui/text'
- MUST render nothing (return null) when phase==='idle'
- MUST map phase -> text: triage='Thinking…', dispatching='Deciding approach…', tool_execution=tool-specific ('Finding recommendations…','Searching your knowledge base…','Researching…'), synthesis='Writing…', clarifying='Asking for details…'
- MUST check AccessibilityInfo.isReduceMotionEnabled() on mount and skip Animated pulse when true
- MUST call AccessibilityInfo.announceForAccessibility on phase transitions
- MUST expose testID='agent-activity-indicator' with sub-testID 'agent-activity-label'
- MUST use Tailwind className for colors (text-muted-foreground, bg-muted)

NEVER:
- NEVER import Text from 'react-native' or 'react-native-paper'
- NEVER hardcode color values or rgba()
- NEVER render when phase is idle

STRICTLY:
- STRICTLY include 6 co-located stories: Idle, Triage, Clarifying, Dispatching, ToolExecutionFindRecommendations, ToolExecutionKB, Synthesis

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective**: Render a phase-aware activity indicator at the bottom of the chat message list so the user sees what the agent is doing, with accessibility-aware animation and screen-reader announcements.

**Success looks like**: Component ships with 6 stories, unit tests cover phase mapping and reduce-motion path, tool-specific copy for find_recommendations is asserted.

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

**Problem**: During tool execution (which can take 15-30s), the user has no feedback about what the agent is doing. The existing `TypingIndicator` shows generic animated dots and doesn't differentiate phases.

**Why it matters**: Phase-aware feedback builds user trust and reduces perceived latency. "Finding recommendations…" is concrete; ellipsis dots are not.

**Current state**: Only `TypingIndicator` exists.

**Desired state**: A phase-mapped indicator that disappears when idle, shows tool-specific copy during tool_execution, and respects reduce-motion + screen-reader accessibility.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: returns null when idle
  GIVEN: phase='idle'
  WHEN: rendered
  THEN: queryByTestId('agent-activity-indicator') is null
  VERIFY: `pnpm vitest run components/chat/AgentActivityIndicator.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-2: shows Thinking during triage
  GIVEN: phase='triage'
  WHEN: rendered
  THEN: text 'Thinking…' is visible
  VERIFY: `pnpm vitest run components/chat/AgentActivityIndicator.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-3: shows tool-specific text during find_recommendations
  GIVEN: phase='tool_execution' and toolName='find_recommendations'
  WHEN: rendered
  THEN: text 'Finding recommendations…' is visible
  VERIFY: `pnpm vitest run components/chat/AgentActivityIndicator.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-4: disables animation on reduce-motion
  GIVEN: AccessibilityInfo.isReduceMotionEnabled resolves true
  WHEN: rendered
  THEN: the Animated.Value interpolation is not started (pulse opacity stays at 1)
  VERIFY: `pnpm vitest run components/chat/AgentActivityIndicator.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-5: announces on phase change
  GIVEN: phase transitions from triage to synthesis
  WHEN: re-rendered
  THEN: AccessibilityInfo.announceForAccessibility is called with the new label
  VERIFY: `pnpm vitest run components/chat/AgentActivityIndicator.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

--------------------------------------------------------------------------------
TEST CRITERIA (Boolean Verification)
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | AgentActivityIndicator returns null when phase='idle' | AC-1 | `pnpm vitest run components/chat/AgentActivityIndicator.test.tsx` | [ ] TRUE [ ] FALSE |
| 2 | The exact string 'Thinking…' is present when phase='triage' | AC-2 | `pnpm vitest run components/chat/AgentActivityIndicator.test.tsx` | [ ] TRUE [ ] FALSE |
| 3 | The exact string 'Finding recommendations…' is present when phase='tool_execution' and toolName='find_recommendations' | AC-3 | `pnpm vitest run components/chat/AgentActivityIndicator.test.tsx` | [ ] TRUE [ ] FALSE |
| 4 | Animated.loop is not invoked when AccessibilityInfo.isReduceMotionEnabled resolves true | AC-4 | `pnpm vitest run components/chat/AgentActivityIndicator.test.tsx` | [ ] TRUE [ ] FALSE |
| 5 | AccessibilityInfo.announceForAccessibility is called with the new label exactly once per phase transition | AC-5 | `pnpm vitest run components/chat/AgentActivityIndicator.test.tsx` | [ ] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `.spec/prd/smarter-chat-agent/07-uc-rel.md` (lines 128-148) — UC-REL-08 ACs
2. `components/chat/TypingIndicator.tsx` (ALL) — existing pulse animation pattern

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `components/chat/AgentActivityIndicator.tsx` (NEW)
- `components/chat/AgentActivityIndicator.stories.tsx` (NEW)
- `components/chat/AgentActivityIndicator.test.tsx` (NEW)

WRITE-PROHIBITED:
- `components/chat/ChatThread.tsx` (INT-UI-004)
- `hooks/use-agent-activity.ts` (REL-UI-001)

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

**Source**: `components/chat/TypingIndicator.tsx`

```tsx
import { useEffect, useRef } from 'react'
import { View, AccessibilityInfo, Animated } from 'react-native'
import { Text } from '@/components/ui/text'

const PHASE_COPY: Record<string, string> = {
  triage: 'Thinking…',
  clarifying: 'Asking for details…',
  dispatching: 'Deciding approach…',
  synthesis: 'Writing…',
}

const TOOL_COPY: Record<string, string> = {
  find_recommendations: 'Finding recommendations…',
  kb_search: 'Searching your knowledge base…',
  quick_research: 'Researching…',
  deep_research: 'Researching…',
}

interface Props {
  phase: 'idle' | 'triage' | 'clarifying' | 'dispatching' | 'tool_execution' | 'synthesis'
  toolName: string | null
}

export function AgentActivityIndicator({ phase, toolName }: Props) {
  const opacity = useRef(new Animated.Value(1)).current
  const prevLabel = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      ).start()
    })
    return () => { cancelled = true }
  }, [opacity])

  if (phase === 'idle') return null

  const label = phase === 'tool_execution' && toolName
    ? TOOL_COPY[toolName] ?? 'Working…'
    : PHASE_COPY[phase] ?? 'Working…'

  useEffect(() => {
    if (label !== prevLabel.current) {
      AccessibilityInfo.announceForAccessibility(label)
      prevLabel.current = label
    }
  }, [label])

  return (
    <View testID="agent-activity-indicator" className="px-4 py-2 bg-muted/50">
      <Animated.View style={{ opacity }}>
        <Text testID="agent-activity-label" className="text-sm text-muted-foreground">{label}</Text>
      </Animated.View>
    </View>
  )
}
```

**Anti-pattern**: `const [label, setLabel] = useState(''); useEffect(() => setLabel(getLabel(phase)), [phase])` — unnecessary sync.

**Interaction notes**:
- Stateless visual driven by phase+toolName props
- Subtle horizontal pulse via Animated.loop + interpolate
- Respect reduce-motion
- Tool copy map lives in a const object for easy extension

**Design references**:
- `.spec/prd/smarter-chat-agent/07-uc-rel.md` UC-REL-08

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

| Gate | Command | Expected |
|------|---------|----------|
| Unit tests | `pnpm vitest run components/chat/AgentActivityIndicator.test.tsx` | Exit 0 |
| Type check | `pnpm tsc --noEmit` | Exit 0 |
| Lint | `pnpm lint` | Exit 0 |
| Storybook | `vitest --project=storybook --run` | Exit 0 |

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: react-native-ui-implementer
**Rationale**: Stateful visual with Animated.Value pulse, AccessibilityInfo check, phase-switch copy map, 6+ stories.

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

**Depends On**: REL-UI-001
**Blocks**: INT-UI-004

--------------------------------------------------------------------------------
PRD REFS
--------------------------------------------------------------------------------

- `.spec/prd/smarter-chat-agent/07-uc-rel.md` UC-REL-08
- `.spec/prd/smarter-chat-agent/09-technical-requirements.md` Task #23

================================================================================
