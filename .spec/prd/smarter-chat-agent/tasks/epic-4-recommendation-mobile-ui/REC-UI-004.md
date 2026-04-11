================================================================================
TASK: REC-UI-004 - RecommendationActionSheet (long-press menu)
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
- MUST import Text from '@/components/ui/text'
- MUST render Save to KB, Share, and Dismiss actions with testIDs 'recommendation-action-save', '-share', '-dismiss'
- MUST call Share.share({ message }) with the item's formatted summary when Share is pressed
- MUST call onSaveRecommendation(item) and close the sheet when Save to KB is pressed
- MUST dismiss on backdrop tap

NEVER:
- NEVER import Text from 'react-native' or 'react-native-paper'
- NEVER block the parent scroll gesture when closed

STRICTLY:
- STRICTLY use components/ui/dialog.tsx or a Modal with NativeWind styling — do not introduce a new bottom-sheet dependency

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective**: Provide a reusable action sheet that presents Save to KB / Share / Dismiss actions for a single recommendation, opened via long-press from RecommendationItem.

**Success looks like**: ActionSheet renders in 3 stories (Closed, Open, LongItemName), tests cover each action path, Share.share is mocked and asserted.

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

**Problem**: Users need a way to act on a single item (save just that one, share it) without having to save the whole list. Long-press is the standard mobile pattern; a controlled action sheet is the standard visual.

**Why it matters**: Per-item save is a high-value user action. Without it, the user must choose between "save everything" and "save nothing".

**Current state**: No reusable action sheet for list items exists in components/cards/.

**Desired state**: A controlled component (parent owns visible state) with 3 actions wired to callbacks and Share.share.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: renders actions when visible
  GIVEN: visible=true
  WHEN: rendered
  THEN: Save to KB, Share, and Dismiss are all visible
  VERIFY: `pnpm vitest run components/cards/RecommendationActionSheet.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-2: renders nothing when not visible
  GIVEN: visible=false
  WHEN: rendered
  THEN: no action testIDs exist in the tree
  VERIFY: `pnpm vitest run components/cards/RecommendationActionSheet.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-3: save fires callback
  GIVEN: visible sheet
  WHEN: user presses Save to KB
  THEN: onSaveRecommendation is called with the item and onDismiss is called
  VERIFY: `pnpm vitest run components/cards/RecommendationActionSheet.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-4: share fires Share.share
  GIVEN: visible sheet
  WHEN: user presses Share
  THEN: Share.share is called with an object containing a message string derived from the item
  VERIFY: `pnpm vitest run components/cards/RecommendationActionSheet.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

--------------------------------------------------------------------------------
TEST CRITERIA (Boolean Verification)
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | When visible=true the sheet renders elements with testIDs 'recommendation-action-save', '-share', '-dismiss' | AC-1 | `pnpm vitest run components/cards/RecommendationActionSheet.test.tsx` | [ ] TRUE [ ] FALSE |
| 2 | When visible=false no element with testID matching /recommendation-action-/ exists | AC-2 | `pnpm vitest run components/cards/RecommendationActionSheet.test.tsx` | [ ] TRUE [ ] FALSE |
| 3 | Pressing Save to KB calls onSaveRecommendation once with the exact item prop value | AC-3 | `pnpm vitest run components/cards/RecommendationActionSheet.test.tsx` | [ ] TRUE [ ] FALSE |
| 4 | Pressing Save to KB subsequently calls onDismiss once | AC-3 | `pnpm vitest run components/cards/RecommendationActionSheet.test.tsx` | [ ] TRUE [ ] FALSE |
| 5 | Pressing Share calls Share.share with an object whose message field contains the item name | AC-4 | `pnpm vitest run components/cards/RecommendationActionSheet.test.tsx` | [ ] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `.spec/prd/smarter-chat-agent/05-uc-rec.md` (lines 158-174) — UC-REC-09
2. `components/ui/dialog.tsx` (ALL) — Modal/Dialog primitive pattern in this project
3. `components/chat/MessageActionsSheet.tsx` (ALL) — existing action-sheet layout for chat messages

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `components/cards/RecommendationActionSheet.tsx` (NEW)
- `components/cards/RecommendationActionSheet.stories.tsx` (NEW)
- `components/cards/RecommendationActionSheet.test.tsx` (NEW)

WRITE-PROHIBITED:
- `components/cards/RecommendationListCard.tsx` (REC-UI-005)
- `components/cards/RecommendationItem.tsx` (REC-UI-002)

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

**Source**: `components/chat/MessageActionsSheet.tsx`

```tsx
import { Share, View, Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { RecommendationActionSheetProps } from './types/recommendation'

export function RecommendationActionSheet({ item, visible, onDismiss, onSaveRecommendation }: RecommendationActionSheetProps) {
  if (!visible || !item) return null
  return (
    <Dialog open={visible} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="p-0">
        <View className="py-2">
          <Pressable
            testID="recommendation-action-save"
            onPress={() => { onSaveRecommendation(item); onDismiss() }}
            className="px-4 py-3 active:bg-muted"
          >
            <Text className="text-base text-foreground">Save to KB</Text>
          </Pressable>
          <Pressable
            testID="recommendation-action-share"
            onPress={async () => {
              await Share.share({ message: `${item.name} — ${item.whyRecommended ?? ''}` })
              onDismiss()
            }}
            className="px-4 py-3 active:bg-muted"
          >
            <Text className="text-base text-foreground">Share</Text>
          </Pressable>
          <Pressable
            testID="recommendation-action-dismiss"
            onPress={onDismiss}
            className="px-4 py-3 active:bg-muted border-t border-border"
          >
            <Text className="text-base text-muted-foreground">Dismiss</Text>
          </Pressable>
        </View>
      </DialogContent>
    </Dialog>
  )
}
```

**Anti-pattern**: Importing `@gorhom/bottom-sheet` (new dependency) when `dialog.tsx` primitive already exists.

**Interaction notes**:
- Controlled component — parent owns visible state
- Backdrop press dismisses (via Dialog's onOpenChange)
- Use `components/ui/dialog.tsx` as base primitive

**Design references**:
- `.spec/prd/smarter-chat-agent/05-uc-rec.md` UC-REC-09

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

| Gate | Command | Expected |
|------|---------|----------|
| Unit tests | `pnpm vitest run components/cards/RecommendationActionSheet.test.tsx` | Exit 0 |
| Type check | `pnpm tsc --noEmit` | Exit 0 |
| Lint | `pnpm lint` | Exit 0 |
| Storybook | `vitest --project=storybook --run` | Exit 0 |

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: react-native-ui-implementer
**Rationale**: Modal/bottom-sheet with Save to KB, Share, Dismiss actions and Share.share wiring.

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

**Depends On**: REC-UI-001
**Blocks**: REC-UI-005

--------------------------------------------------------------------------------
PRD REFS
--------------------------------------------------------------------------------

- `.spec/prd/smarter-chat-agent/05-uc-rec.md` UC-REC-09
- `.spec/prd/smarter-chat-agent/09-technical-requirements.md` Task #21

================================================================================
