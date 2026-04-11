================================================================================
TASK: REC-UI-005 - RecommendationListCard container composition
================================================================================

TASK_TYPE: FEATURE
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P0
EFFORT: M
TYPE: DEV
AGENT: react-native-ui-implementer
ESTIMATE_MINUTES: 180
ITERATION: 1

--------------------------------------------------------------------------------
CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

MUST:
- MUST import Text from '@/components/ui/text'
- MUST render 3 items when given a 3-item payload and 7 items when given a 7-item payload (no truncation, no pagination)
- MUST render RecommendationSources beneath the items when sources.length > 0
- MUST render a 'Save list to KB' footer button that calls onSaveAllToKB(items) with testID='recommendation-list-save-all'
- MUST expose testID='recommendation-list-card' at the root
- MUST wire onLongPress on each RecommendationItem to open the shared RecommendationActionSheet

NEVER:
- NEVER import Text from 'react-native' or 'react-native-paper'
- NEVER hardcode item count limits (count comes from backend)

STRICTLY:
- STRICTLY include 8 co-located stories: Default, MinimumItems (3), MaximumItems (7), WithMissingFields, NoSources, DarkMode, LongQuery, ActionSheetOpen

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective**: Compose `RecommendationItem`, `RecommendationSources`, and `RecommendationActionSheet` into a single list card that renders a `recommendation_list` cardData payload end-to-end.

**Success looks like**: RecommendationListCard renders 8 Storybook stories, unit tests cover 3 and 7 item cases plus save-all, full gates pass.

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

**Problem**: Individual sub-components exist but nothing composes them into a single renderable card. `ChatThread` expects a single component to dispatch to.

**Why it matters**: This is the component that actually appears in chat when the user's query routes to `find_recommendations`. Its correctness matters most to the user.

**Current state**: REC-UI-002, 003, 004 built the pieces but no container exists.

**Desired state**: A single container that manages the active-item state for the action sheet, renders the item list, and composes the sources and save-all footer.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: renders 3 items for 3-item payload
  GIVEN: payload.items.length=3
  WHEN: rendered
  THEN: 3 elements with testID pattern /recommendation-item-\d+/ exist
  VERIFY: `pnpm vitest run components/cards/RecommendationListCard.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-2: renders 7 items for 7-item payload
  GIVEN: payload.items.length=7
  WHEN: rendered
  THEN: 7 elements with testID pattern /recommendation-item-\d+/ exist
  VERIFY: `pnpm vitest run components/cards/RecommendationListCard.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-3: save-all button fires callback
  GIVEN: rendered card with onSaveAllToKB mock
  WHEN: user presses the save-all footer button
  THEN: onSaveAllToKB is called once with the full items array
  VERIFY: `pnpm vitest run components/cards/RecommendationListCard.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-4: long-press opens action sheet
  GIVEN: rendered card
  WHEN: user long-presses the first item
  THEN: the element with testID='recommendation-action-save' becomes present
  VERIFY: `pnpm vitest run components/cards/RecommendationListCard.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-5: sources hidden when empty
  GIVEN: sources=[]
  WHEN: rendered
  THEN: no element with testID='recommendation-list-sources' exists
  VERIFY: `pnpm vitest run components/cards/RecommendationListCard.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-6: stories render
  GIVEN: 8 stories
  WHEN: storybook runs
  THEN: all stories render without throwing
  VERIFY: `vitest --project=storybook --run`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

--------------------------------------------------------------------------------
TEST CRITERIA (Boolean Verification)
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | RecommendationListCard renders exactly 3 RecommendationItem children when payload.items.length equals 3 | AC-1 | `pnpm vitest run components/cards/RecommendationListCard.test.tsx` | [ ] TRUE [ ] FALSE |
| 2 | RecommendationListCard renders exactly 7 RecommendationItem children when payload.items.length equals 7 | AC-2 | `pnpm vitest run components/cards/RecommendationListCard.test.tsx` | [ ] TRUE [ ] FALSE |
| 3 | Pressing testID='recommendation-list-save-all' calls onSaveAllToKB once with the items array | AC-3 | `pnpm vitest run components/cards/RecommendationListCard.test.tsx` | [ ] TRUE [ ] FALSE |
| 4 | Long-pressing the first item makes testID='recommendation-action-save' appear in the tree | AC-4 | `pnpm vitest run components/cards/RecommendationListCard.test.tsx` | [ ] TRUE [ ] FALSE |
| 5 | testID='recommendation-list-sources' is absent when payload.sources is an empty array | AC-5 | `pnpm vitest run components/cards/RecommendationListCard.test.tsx` | [ ] TRUE [ ] FALSE |
| 6 | Storybook MaximumItems story renders 7 item elements without throwing | AC-6 | `vitest --project=storybook --run` | [ ] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `.spec/prd/smarter-chat-agent/05-uc-rec.md` (lines 124-188) — UC-REC-07/09/10
2. `components/cards/types/recommendation.ts` (ALL) — payload shape
3. `components/ui/card.tsx` (ALL) — container pattern

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `components/cards/RecommendationListCard.tsx` (NEW)
- `components/cards/RecommendationListCard.stories.tsx` (NEW)
- `components/cards/RecommendationListCard.test.tsx` (NEW)

WRITE-PROHIBITED:
- `components/cards/RecommendationItem.tsx` (REC-UI-002)
- `components/cards/RecommendationSources.tsx` (REC-UI-003)
- `components/cards/RecommendationActionSheet.tsx` (REC-UI-004)
- `components/chat/ChatThread.tsx` (INT-UI-001)

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

**Source**: `components/ui/result-card.tsx`

```tsx
import { useState } from 'react'
import { View, Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { RecommendationItem } from './RecommendationItem'
import { RecommendationSources } from './RecommendationSources'
import { RecommendationActionSheet } from './RecommendationActionSheet'
import type { RecommendationListCardProps, RecommendationItemData } from './types/recommendation'

export function RecommendationListCard({ payload, onSaveAllToKB, onSaveRecommendation }: RecommendationListCardProps) {
  const [activeItem, setActiveItem] = useState<RecommendationItemData | null>(null)
  return (
    <Card testID="recommendation-list-card" className="py-4">
      <View className="px-6 pb-2">
        <Text className="text-xs uppercase text-muted-foreground">Recommendations for</Text>
        <Text className="text-base text-foreground font-semibold">{payload.query}</Text>
      </View>
      {payload.items.map((item, i) => (
        <RecommendationItem
          key={`${item.name}-${i}`}
          index={i}
          item={item}
          onLongPress={setActiveItem}
        />
      ))}
      {payload.sources.length > 0 && <RecommendationSources sources={payload.sources} />}
      <View className="px-4 pt-3">
        <Pressable
          testID="recommendation-list-save-all"
          onPress={() => onSaveAllToKB?.(payload.items)}
          className="py-2 rounded bg-secondary items-center"
        >
          <Text className="text-sm text-secondary-foreground">Save list to KB</Text>
        </Pressable>
      </View>
      <RecommendationActionSheet
        visible={!!activeItem}
        item={activeItem}
        onDismiss={() => setActiveItem(null)}
        onSaveRecommendation={(i) => { onSaveRecommendation?.(i); setActiveItem(null) }}
      />
    </Card>
  )
}
```

**Anti-pattern**: Passing `onLongPress` from a parent scroll container — would conflict with ScrollView gestures.

**Interaction notes**:
- Long-press on item opens shared ActionSheet with that item as active
- Save-all footer button uses bg-secondary variant
- Query header shows 'Recommendations for: {query}' in muted type

**Design references**:
- `.spec/prd/smarter-chat-agent/05-uc-rec.md` UC-REC-07

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

| Gate | Command | Expected |
|------|---------|----------|
| Unit tests | `pnpm vitest run components/cards/RecommendationListCard.test.tsx` | Exit 0 |
| Type check | `pnpm tsc --noEmit` | Exit 0 |
| Lint | `pnpm lint` | Exit 0 |
| Storybook | `vitest --project=storybook --run` | Exit 0 |

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: react-native-ui-implementer
**Rationale**: Composition of RecommendationItem x N + RecommendationSources + RecommendationActionSheet + save-all footer; min/max items; dark mode stories.

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

**Depends On**: REC-UI-002, REC-UI-003, REC-UI-004
**Blocks**: INT-UI-001

--------------------------------------------------------------------------------
PRD REFS
--------------------------------------------------------------------------------

- `.spec/prd/smarter-chat-agent/05-uc-rec.md` UC-REC-07 / UC-REC-09 / UC-REC-10
- `.spec/prd/smarter-chat-agent/09-technical-requirements.md` Task #22

================================================================================
