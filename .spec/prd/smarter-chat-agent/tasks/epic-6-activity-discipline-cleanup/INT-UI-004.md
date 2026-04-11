================================================================================
TASK: INT-UI-004 - ChatThread integration — AgentActivityIndicator placement
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
- MUST mount AgentActivityIndicator inside ChatThread driven by useAgentActivity(conversationId)
- MUST accept conversationId via ChatThreadProps (new optional prop)
- MUST suppress the existing TypingIndicator when AgentActivityIndicator phase is non-idle (avoid double loaders, mirroring existing hasActiveResearchCard logic)
- MUST add an integration test that mocks useAgentActivity to return phase='tool_execution', toolName='find_recommendations' and asserts 'Finding recommendations…' is visible
- MUST preserve streamingMessageId behavior

NEVER:
- NEVER break existing TypingIndicator tests
- NEVER call useQuery directly inside ChatThread — use useAgentActivity

STRICTLY:
- STRICTLY indicator sits at the visual bottom (top of inverted FlatList) of the message list

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective**: Integrate `AgentActivityIndicator` into `ChatThread` so the user sees live phase-aware progress during agent turns, suppressing `TypingIndicator` when AAI is active.

**Success looks like**: ChatThread mounts AAI via `useAgentActivity`, integration test passes for find_recommendations phase, existing TypingIndicator regression tests still pass.

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

**Problem**: The hook and the component exist but nothing mounts them. Without this integration, users don't see the phase-aware feedback.

**Why it matters**: Closing the loop on the activity indicator epic. Without this wire the whole epic is dead code.

**Current state**: ChatThread shows TypingIndicator based on `showTypingIndicator && !hasActiveResearchCard && !streamingMessageId`.

**Desired state**: ChatThread also calls `useAgentActivity(conversationId)`, renders `AgentActivityIndicator` when phase is non-idle, and suppresses TypingIndicator when AAI is visible.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: renders tool-specific text
  GIVEN: useAgentActivity mocked to { phase: 'tool_execution', toolName: 'find_recommendations' }
  WHEN: ChatThread renders
  THEN: the text 'Finding recommendations…' is visible
  VERIFY: `pnpm vitest run components/chat/ChatThread.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-2: suppresses TypingIndicator when active
  GIVEN: useAgentActivity returns phase='triage' and showTypingIndicator=true
  WHEN: rendered
  THEN: AgentActivityIndicator is visible and TypingIndicator is not
  VERIFY: `pnpm vitest run components/chat/ChatThread.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-3: idle hides indicator
  GIVEN: phase='idle'
  WHEN: rendered
  THEN: testID='agent-activity-indicator' is absent
  VERIFY: `pnpm vitest run components/chat/ChatThread.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-4: streamingMessageId behavior preserved
  GIVEN: streamingMessageId set
  WHEN: rendered
  THEN: the streaming cursor still appears on the target message
  VERIFY: `pnpm vitest run components/chat/ChatThread.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

--------------------------------------------------------------------------------
TEST CRITERIA (Boolean Verification)
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | With useAgentActivity mocked to phase='tool_execution'+toolName='find_recommendations', 'Finding recommendations…' is present | AC-1 | `pnpm vitest run components/chat/ChatThread.test.tsx` | [ ] TRUE [ ] FALSE |
| 2 | With phase='triage' and showTypingIndicator=true, testID='agent-activity-indicator' is present AND testID='typing-indicator' is absent | AC-2 | `pnpm vitest run components/chat/ChatThread.test.tsx` | [ ] TRUE [ ] FALSE |
| 3 | With phase='idle', no element with testID='agent-activity-indicator' exists | AC-3 | `pnpm vitest run components/chat/ChatThread.test.tsx` | [ ] TRUE [ ] FALSE |
| 4 | With streamingMessageId set, the existing streaming cursor on the target message still renders | AC-4 | `pnpm vitest run components/chat/ChatThread.test.tsx` | [ ] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `components/chat/ChatThread.tsx` (ALL) — existing hasActiveResearchCard and TypingIndicator logic
2. `components/chat/AgentActivityIndicator.tsx` (ALL) — prop surface
3. `hooks/use-agent-activity.ts` (ALL) — hook return shape

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `components/chat/ChatThread.tsx` (MODIFY)
- `components/chat/ChatThread.test.tsx` (MODIFY)

WRITE-PROHIBITED:
- `components/chat/AgentActivityIndicator.tsx`
- `components/chat/TypingIndicator.tsx`
- `hooks/use-agent-activity.ts`

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

**Source**: `components/chat/ChatThread.tsx` existing FlatList usage

```tsx
const { phase, toolName } = useAgentActivity(conversationId ?? null)
const aaiActive = phase !== 'idle'
const effectiveShowTypingIndicator =
  showTypingIndicator && !hasActiveResearchCard && !streamingMessageId && !aaiActive

// inverted FlatList → ListHeaderComponent appears at visual bottom
<FlatList
  inverted
  ListHeaderComponent={<AgentActivityIndicator phase={phase} toolName={toolName} />}
  // ...
/>
{effectiveShowTypingIndicator && <TypingIndicator />}
```

**Anti-pattern**: Passing `showTypingIndicator=true` concurrently with `phase='triage'` — double loaders.

**Interaction notes**:
- Mount the indicator at FlatList `ListHeaderComponent` position (inverted FlatList → visual bottom)
- Suppress TypingIndicator when AAI phase is non-idle

**Design references**:
- `.spec/prd/smarter-chat-agent/07-uc-rel.md` UC-REL-08

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
**Rationale**: Mount AgentActivityIndicator at the bottom of the inverted FlatList, driven by useAgentActivity, replacing/augmenting TypingIndicator while preserving existing streamingMessageId behavior.

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

**Depends On**: REL-UI-002, REL-UI-001
**Blocks**: (none — leaf)

--------------------------------------------------------------------------------
PRD REFS
--------------------------------------------------------------------------------

- `.spec/prd/smarter-chat-agent/07-uc-rel.md` UC-REL-08
- `.spec/prd/smarter-chat-agent/09-technical-requirements.md` Task #29

================================================================================
