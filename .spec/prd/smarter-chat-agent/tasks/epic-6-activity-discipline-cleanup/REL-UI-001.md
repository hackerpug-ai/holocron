================================================================================
TASK: REL-UI-001 - useAgentActivity hook (phase subscription)
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
- MUST subscribe via useQuery to a Convex query exposing the current conversation's agent phase (read-only) — api.chat.telemetryQueries.getCurrentPhase from INT-007
- MUST return query data directly — no useState + useEffect sync (see CLAUDE.md 'State Syncing Anti-Pattern')
- MUST return a phase of 'idle' | 'triage' | 'clarifying' | 'dispatching' | 'tool_execution' | 'synthesis' and an optional toolName string
- MUST return the shape { phase, toolName, loading, error }

NEVER:
- NEVER introduce local useState to mirror query data
- NEVER write to any Convex mutation from this hook (read-only)

STRICTLY:
- STRICTLY file is hooks/use-agent-activity.ts with matching kebab-case test hooks/use-agent-activity.test.ts
- STRICTLY mock Convex useQuery with a test helper — do not require a live backend

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective**: Provide a lightweight React hook that components can call to get the live agent phase for the current conversation, mirroring the telemetry produced by INT-006 and queried by INT-007.

**Success looks like**: Hook returns typed `{phase, toolName, loading, error}`, tests mock `useQuery` to assert each phase value is passed through unchanged, no state sync pattern present.

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

**Problem**: The `AgentActivityIndicator` component (REL-UI-002) needs a data source. Without a dedicated hook, it would have to call `useQuery` directly, mixing presentation and data concerns.

**Why it matters**: A clean hook boundary makes the indicator trivially testable (just mock the hook return value) and keeps the Convex query coupling in one place.

**Current state**: No hook exists for subscribing to agent phase.

**Desired state**: A read-only hook that returns the query result shape directly, with `phase='idle'` as the null/loading default.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: returns phase directly from query
  GIVEN: useQuery returns { phase: 'triage', toolName: null }
  WHEN: hook runs
  THEN: result.phase equals 'triage' on first render without additional re-renders
  VERIFY: `pnpm vitest run hooks/use-agent-activity.test.ts`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-2: propagates toolName
  GIVEN: useQuery returns { phase: 'tool_execution', toolName: 'find_recommendations' }
  WHEN: hook runs
  THEN: result.toolName equals 'find_recommendations'
  VERIFY: `pnpm vitest run hooks/use-agent-activity.test.ts`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-3: idle when query undefined
  GIVEN: useQuery returns undefined
  WHEN: hook runs
  THEN: result.phase equals 'idle' and loading is true
  VERIFY: `pnpm vitest run hooks/use-agent-activity.test.ts`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-4: no useState sync
  GIVEN: the source file
  WHEN: searched for 'useState'
  THEN: no occurrence of useState exists
  VERIFY: `! grep -q 'useState' hooks/use-agent-activity.ts && pnpm lint`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

--------------------------------------------------------------------------------
TEST CRITERIA (Boolean Verification)
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | useAgentActivity returns result.phase equal to the phase string from mocked useQuery on the first render | AC-1 | `pnpm vitest run hooks/use-agent-activity.test.ts` | [ ] TRUE [ ] FALSE |
| 2 | useAgentActivity returns result.toolName equal to mocked query.toolName when tool_execution phase is active | AC-2 | `pnpm vitest run hooks/use-agent-activity.test.ts` | [ ] TRUE [ ] FALSE |
| 3 | useAgentActivity returns phase='idle' and loading=true when useQuery returns undefined | AC-3 | `pnpm vitest run hooks/use-agent-activity.test.ts` | [ ] TRUE [ ] FALSE |
| 4 | The hook source file contains no useState import | AC-4 | `! grep -q 'useState' hooks/use-agent-activity.ts` | [ ] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `.spec/prd/smarter-chat-agent/07-uc-rel.md` (lines 128-148) — UC-REL-08 hook contract
2. `hooks/use-chat-history.ts` (ALL) — existing useQuery pattern in this project
3. `CLAUDE.md` (ALL) — State Syncing Anti-Pattern section

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `hooks/use-agent-activity.ts` (NEW)
- `hooks/use-agent-activity.test.ts` (NEW)

WRITE-PROHIBITED:
- `convex/**` (backend is INT-007 territory)
- `components/**` (components depend on this hook but are separate tasks)

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

**Source**: `hooks/use-chat-history.ts`

```ts
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

export type AgentPhase = 'idle' | 'triage' | 'clarifying' | 'dispatching' | 'tool_execution' | 'synthesis'

export interface UseAgentActivityResult {
  phase: AgentPhase
  toolName: string | null
  loading: boolean
  error: Error | null
}

export function useAgentActivity(conversationId: Id<'conversations'> | null): UseAgentActivityResult {
  const result = useQuery(
    api.chat.telemetryQueries.getCurrentPhase,
    conversationId ? { conversationId } : 'skip',
  )
  return {
    phase: (result?.phase as AgentPhase) ?? 'idle',
    toolName: result?.toolName ?? null,
    loading: result === undefined && conversationId !== null,
    error: null,
  }
}
```

**Anti-pattern**: `const [phase, setPhase] = useState('idle'); useEffect(() => { if (result) setPhase(result.phase) }, [result])` — stale-state trap.

**Interaction notes**:
- Read-only
- Polled/pushed via Convex reactive subscription
- Return default `phase='idle'` when conversationId is null

**Design references**:
- `.spec/prd/smarter-chat-agent/07-uc-rel.md` UC-REL-08

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

| Gate | Command | Expected |
|------|---------|----------|
| Unit tests | `pnpm vitest run hooks/use-agent-activity.test.ts` | Exit 0 |
| Type check | `pnpm tsc --noEmit` | Exit 0 |
| Lint | `pnpm lint` | Exit 0 |

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: react-native-ui-implementer
**Rationale**: Custom Convex query hook that returns {phase, toolName}; strict return-directly pattern (no state syncing anti-pattern).

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

**Depends On**: INT-007 (for getCurrentPhase query)
**Blocks**: REL-UI-002, INT-UI-004

--------------------------------------------------------------------------------
PRD REFS
--------------------------------------------------------------------------------

- `.spec/prd/smarter-chat-agent/07-uc-rel.md` UC-REL-08
- `.spec/prd/smarter-chat-agent/09-technical-requirements.md` Task #25

================================================================================
