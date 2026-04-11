================================================================================
TASK: REC-UI-006 - Recommendation save-to-KB wiring (per-item + whole list)
================================================================================

TASK_TYPE: FEATURE
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P1
EFFORT: S
TYPE: DEV
AGENT: react-native-ui-implementer
ESTIMATE_MINUTES: 120
ITERATION: 1

--------------------------------------------------------------------------------
CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

MUST:
- MUST add ChatThreadProps.onSaveRecommendation?(item) and onSaveRecommendationList?(items) optional callbacks
- MUST thread both callbacks from ChatThread into RecommendationListCard via the existing dispatch branch (INT-UI-001)
- MUST add an integration test: mock both callbacks, press per-item Save from action sheet, press list-level Save, assert each is called once with correct args
- MUST leave the Convex save mutation ownership in the calling screen (app/chat/[id].tsx or equivalent) — do not call convex mutations inside ChatThread

NEVER:
- NEVER call useMutation inside ChatThread
- NEVER duplicate save logic across the two callbacks

STRICTLY:
- STRICTLY keep the change scoped to callback wiring; do not alter RecommendationItem or RecommendationListCard internals

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective**: Wire per-recommendation and save-all callbacks from the chat screen caller through `ChatThread` and `RecommendationListCard`, so Save actions reach the existing Convex mutation without `ChatThread` owning backend knowledge.

**Success looks like**: Both callbacks are typed, plumbed end-to-end, and asserted in an integration test. Pressing Save to KB in the action sheet invokes `onSaveRecommendation`; pressing Save list to KB invokes `onSaveRecommendationList`.

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

**Problem**: INT-UI-001 rendered the card but didn't wire save callbacks end-to-end. Per-item save (from action sheet) and save-all (from footer) need two separate callbacks threaded through ChatThreadProps.

**Why it matters**: Without this wiring, the action sheet's Save button is a no-op. Users can't actually save recommendations.

**Current state**: `RecommendationListCard` accepts callbacks but `ChatThread` doesn't forward them.

**Desired state**: `ChatThreadProps` exposes `onSaveRecommendation` and `onSaveRecommendationList`; both thread through to the card; the chat screen (app/chat/[id].tsx) owns the Convex mutation.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: per-item save wires through
  GIVEN: ChatThread rendered with onSaveRecommendation mock and a recommendation_list message
  WHEN: user long-presses an item and presses Save to KB
  THEN: onSaveRecommendation is called once with that item
  VERIFY: `pnpm vitest run components/chat/ChatThread.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-2: save-all wires through
  GIVEN: onSaveRecommendationList mock
  WHEN: user presses the save-all footer button
  THEN: onSaveRecommendationList is called once with the full items array
  VERIFY: `pnpm vitest run components/chat/ChatThread.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-3: type check
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
| 1 | Pressing Save to KB in the action sheet calls onSaveRecommendation once with the same RecommendationItemData object that was long-pressed | AC-1 | `pnpm vitest run components/chat/ChatThread.test.tsx` | [ ] TRUE [ ] FALSE |
| 2 | Pressing the list-level save button calls onSaveRecommendationList once with an array whose length equals payload.items.length | AC-2 | `pnpm vitest run components/chat/ChatThread.test.tsx` | [ ] TRUE [ ] FALSE |
| 3 | ChatThreadProps exposes onSaveRecommendation and onSaveRecommendationList as optional props in the TypeScript type | AC-3 | `pnpm tsc --noEmit` | [ ] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `components/chat/ChatThread.tsx` (ALL) — prop surface and dispatch
2. `components/cards/RecommendationListCard.tsx` (ALL) — callback props
3. `.spec/prd/smarter-chat-agent/05-uc-rec.md` (lines 158-174) — UC-REC-09

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `components/chat/ChatThread.tsx` (MODIFY)
- `components/chat/ChatThread.test.tsx` (MODIFY)

WRITE-PROHIBITED:
- `components/cards/RecommendationListCard.tsx`
- `components/cards/RecommendationItem.tsx`
- `components/cards/RecommendationActionSheet.tsx`
- `convex/**`

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

**Source**: `components/chat/ChatThread.tsx`

```tsx
interface ChatThreadProps {
  // ...existing props
  onSaveRecommendation?: (item: RecommendationItemData) => void
  onSaveRecommendationList?: (items: RecommendationItemData[]) => void
}

// In dispatch branch from INT-UI-001 — already exists
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

**Anti-pattern**: `const save = useMutation(api.documents.create)` inside ChatThread — couples presentation to backend.

**Interaction notes**:
- Callback ownership: the chat screen (`app/chat/[id].tsx` or similar) owns `useMutation` and passes the bound callback into `ChatThread`

**Design references**:
- `.spec/prd/smarter-chat-agent/05-uc-rec.md` UC-REC-09

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

| Gate | Command | Expected |
|------|---------|----------|
| Integration test | `pnpm vitest run components/chat/ChatThread.test.tsx` | Exit 0 |
| Type check | `pnpm tsc --noEmit` | Exit 0 |
| Lint | `pnpm lint` | Exit 0 |
| Full test suite | `pnpm tsc --noEmit && pnpm lint && pnpm vitest run` | Exit 0 |

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: react-native-ui-implementer
**Rationale**: Thread onSaveRecommendation and onSaveRecommendationList from the chat screen caller through ChatThread to RecommendationListCard; integration test mocks the mutation.

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

**Depends On**: INT-UI-001
**Blocks**: (none — leaf task)

--------------------------------------------------------------------------------
PRD REFS
--------------------------------------------------------------------------------

- `.spec/prd/smarter-chat-agent/05-uc-rec.md` UC-REC-09
- `.spec/prd/smarter-chat-agent/09-technical-requirements.md` Task #31

================================================================================
