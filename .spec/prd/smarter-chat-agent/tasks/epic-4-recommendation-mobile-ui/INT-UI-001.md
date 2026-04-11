================================================================================
TASK: INT-UI-001 - ChatThread integration — RecommendationListCard dispatch
================================================================================

TASK_TYPE: FEATURE
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
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
- MUST add a new branch to the ChatThread result_card dispatcher for card_data.card_type === 'recommendation_list'
- MUST import RecommendationListCardData from components/cards/types/recommendation.ts and narrow via a type guard (no `as` casts on card_data)
- MUST leave all existing card_type branches (article, stats, category_list, no_results, category_not_found, deep_research_loading) unchanged
- MUST add an integration test that renders ChatThread with a recommendation_list message and asserts testID='recommendation-list-card' is present

NEVER:
- NEVER modify RecommendationListCard.tsx (it is owned by REC-UI-005)
- NEVER use `any` casts on card_data

STRICTLY:
- STRICTLY keep the change scoped — do not touch unrelated dispatcher branches

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective**: Wire `RecommendationListCard` into the `ChatThread` result_card dispatcher so messages with `card_type='recommendation_list'` render the new card inline.

**Success looks like**: ChatThread renders the new card type end-to-end, an integration test asserts the render, existing card tests still pass, full gates pass.

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

**Problem**: REC-UI-005 built the composite card, but `ChatThread.tsx` doesn't yet know about the new `card_type`. Without this dispatch, the backend sends a payload the UI ignores.

**Why it matters**: This is the glue that actually shows the card to the user.

**Current state**: `ChatThread.tsx` has a switch on `card_data.card_type` with cases for existing types.

**Desired state**: New case for `recommendation_list` renders `RecommendationListCard`, with type-narrowed props and integration-test coverage.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: renders recommendation_list card
  GIVEN: a message with message_type='result_card' and card_data.card_type='recommendation_list'
  WHEN: ChatThread renders it
  THEN: testID='recommendation-list-card' is present
  VERIFY: `pnpm vitest run components/chat/ChatThread.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-2: existing card types still render
  GIVEN: a message with card_data.card_type='article'
  WHEN: ChatThread renders it
  THEN: testID matching /result-card-article/ is present
  VERIFY: `pnpm vitest run components/chat/ChatThread.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-3: type check passes
  GIVEN: the modified ChatThread.tsx
  WHEN: pnpm tsc --noEmit runs
  THEN: exit 0 and no `any` narrowing errors
  VERIFY: `pnpm tsc --noEmit`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-4: onSaveAllToKB callback wired
  GIVEN: a user pressing Save list to KB
  WHEN: the dispatcher is invoked
  THEN: the onSaveRecommendationList prop passed to ChatThread is called with the items array
  VERIFY: `pnpm vitest run components/chat/ChatThread.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

--------------------------------------------------------------------------------
TEST CRITERIA (Boolean Verification)
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | ChatThread rendered with a recommendation_list message exposes testID='recommendation-list-card' | AC-1 | `pnpm vitest run components/chat/ChatThread.test.tsx` | [ ] TRUE [ ] FALSE |
| 2 | ChatThread rendered with an article result_card message still renders the existing article card | AC-2 | `pnpm vitest run components/chat/ChatThread.test.tsx` | [ ] TRUE [ ] FALSE |
| 3 | ChatThread.tsx contains no `as any` casts on card_data after the change | AC-3 | `pnpm tsc --noEmit` | [ ] TRUE [ ] FALSE |
| 4 | Pressing save-all inside RecommendationListCard invokes onSaveRecommendationList prop exactly once | AC-4 | `pnpm vitest run components/chat/ChatThread.test.tsx` | [ ] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `components/chat/ChatThread.tsx` (ALL) — existing dispatcher structure
2. `components/cards/types/recommendation.ts` (ALL) — type guard target
3. `components/cards/RecommendationListCard.tsx` (ALL) — prop surface

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `components/chat/ChatThread.tsx` (MODIFY — add recommendation_list dispatch branch only)
- `components/chat/ChatThread.test.tsx` (MODIFY or NEW — add integration test)

WRITE-PROHIBITED:
- `components/cards/RecommendationListCard.tsx`
- `components/cards/RecommendationItem.tsx`

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

**Source**: `components/chat/ChatThread.tsx` (existing dispatcher)

```tsx
import { RecommendationListCard } from '@/components/cards/RecommendationListCard'
import type { RecommendationListCardData } from '@/components/cards/types/recommendation'

function isRecommendationListCard(cd: unknown): cd is RecommendationListCardData {
  return typeof cd === 'object' && cd !== null && (cd as { card_type?: string }).card_type === 'recommendation_list'
}

// In the dispatcher switch
if (message.message_type === 'result_card' && isRecommendationListCard(message.card_data)) {
  return (
    <RecommendationListCard
      payload={message.card_data}
      onSaveAllToKB={onSaveRecommendationList}
      onSaveRecommendation={onSaveRecommendation}
    />
  )
}
```

**Anti-pattern**: `const cd = message.card_data as any; if (cd.card_type === ...)` — loses type safety.

**Interaction notes**:
- Dispatch via type guard function, not `as` cast
- Callbacks forwarded via new optional ChatThreadProps

**Design references**:
- `.spec/prd/smarter-chat-agent/05-uc-rec.md` UC-REC-04

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

| Gate | Command | Expected |
|------|---------|----------|
| Integration test | `pnpm vitest run components/chat/ChatThread.test.tsx` | Exit 0 |
| Type check | `pnpm tsc --noEmit` | Exit 0 |
| Lint | `pnpm lint` | Exit 0 |
| Full test suite | `pnpm vitest run` | Exit 0 |

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: react-native-ui-implementer
**Rationale**: Modify ChatThread to dispatch new card_type, integration test verifying the branch renders without regressing existing card_types.

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

**Depends On**: REC-UI-005, REC-UI-001
**Blocks**: REC-UI-006

--------------------------------------------------------------------------------
PRD REFS
--------------------------------------------------------------------------------

- `.spec/prd/smarter-chat-agent/05-uc-rec.md` UC-REC-04
- `.spec/prd/smarter-chat-agent/09-technical-requirements.md` Task #26

================================================================================
