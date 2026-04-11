================================================================================
TASK: REL-UI-003 - DocumentDisciplineFooter component
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
- MUST render 'Saved to KB · Open →' when savedDocumentId is provided and press navigates via expo-router to the document detail route
- MUST render 'Save this to KB' when savedDocumentId is null and canSave is true; press calls onSaveToKB()
- MUST render null when savedDocumentId is null AND canSave is false
- MUST show a saving-in-progress indicator while onSaveToKB is pending (isSaving prop)
- MUST expose testID='document-discipline-footer' plus 'document-discipline-open' and 'document-discipline-save' sub-testIDs
- MUST use text-muted-foreground Tailwind class for subtle visual weight

NEVER:
- NEVER import Text from 'react-native' or 'react-native-paper'
- NEVER show both buttons simultaneously
- NEVER hardcode route paths — use router.push with the documents route constant

STRICTLY:
- STRICTLY include co-located stories Saved, NotSavedCanSave, NeitherState, SavingInProgress

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective**: Provide an inline footer under assistant messages that either shows a tappable "Saved to KB" link or a "Save this to KB" quick-action, enforcing document discipline across chat bubbles.

**Success looks like**: Component has 4 stories, tests cover all four render paths (saved / can-save / neither / saving), navigation and save callbacks fire correctly.

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

**Problem**: Without a visible discipline footer, the user has no fast way to save an `answer_question` or `find_recommendations` response to their KB, and no clear indication when a tool (like `deep_research`) already saved one.

**Why it matters**: This footer is the UI manifestation of the document discipline policy from Epic 3's HOLOCRON_SYSTEM_PROMPT additions. It makes the policy visible.

**Current state**: No discipline footer exists.

**Desired state**: A dual-state footer that renders "Saved to KB · Open →" or "Save this to KB", respects `isSaving` state, and is null when neither state applies.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: renders Open link when saved
  GIVEN: savedDocumentId='doc123'
  WHEN: rendered
  THEN: 'Saved to KB' text and an element with testID='document-discipline-open' are visible
  VERIFY: `pnpm vitest run components/chat/DocumentDisciplineFooter.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-2: press Open navigates
  GIVEN: savedDocumentId='doc123' and a mocked router
  WHEN: user presses the Open link
  THEN: router.push is called with a path containing 'doc123'
  VERIFY: `pnpm vitest run components/chat/DocumentDisciplineFooter.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-3: renders Save when not saved and canSave
  GIVEN: savedDocumentId=null, canSave=true
  WHEN: rendered
  THEN: element with testID='document-discipline-save' and 'Save this to KB' text are visible
  VERIFY: `pnpm vitest run components/chat/DocumentDisciplineFooter.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-4: press Save fires callback
  GIVEN: savedDocumentId=null, canSave=true, onSaveToKB mock
  WHEN: user presses the Save button
  THEN: onSaveToKB is called once
  VERIFY: `pnpm vitest run components/chat/DocumentDisciplineFooter.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-5: renders null when neither
  GIVEN: savedDocumentId=null, canSave=false
  WHEN: rendered
  THEN: no element with testID='document-discipline-footer' exists
  VERIFY: `pnpm vitest run components/chat/DocumentDisciplineFooter.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-6: shows saving state
  GIVEN: isSaving=true
  WHEN: rendered
  THEN: the Save button is disabled and an ActivityIndicator is present
  VERIFY: `pnpm vitest run components/chat/DocumentDisciplineFooter.test.tsx`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

--------------------------------------------------------------------------------
TEST CRITERIA (Boolean Verification)
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | When savedDocumentId is a string, testID='document-discipline-open' is present and 'Saved to KB' is visible | AC-1 | `pnpm vitest run components/chat/DocumentDisciplineFooter.test.tsx` | [ ] TRUE [ ] FALSE |
| 2 | Pressing testID='document-discipline-open' calls router.push with a path containing savedDocumentId | AC-2 | `pnpm vitest run components/chat/DocumentDisciplineFooter.test.tsx` | [ ] TRUE [ ] FALSE |
| 3 | When savedDocumentId is null and canSave is true, testID='document-discipline-save' is present | AC-3 | `pnpm vitest run components/chat/DocumentDisciplineFooter.test.tsx` | [ ] TRUE [ ] FALSE |
| 4 | Pressing testID='document-discipline-save' calls onSaveToKB exactly once | AC-4 | `pnpm vitest run components/chat/DocumentDisciplineFooter.test.tsx` | [ ] TRUE [ ] FALSE |
| 5 | When savedDocumentId null and canSave false, no element with testID='document-discipline-footer' is present | AC-5 | `pnpm vitest run components/chat/DocumentDisciplineFooter.test.tsx` | [ ] TRUE [ ] FALSE |
| 6 | When isSaving true the save button has accessibilityState.disabled=true | AC-6 | `pnpm vitest run components/chat/DocumentDisciplineFooter.test.tsx` | [ ] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `.spec/prd/smarter-chat-agent/07-uc-rel.md` (lines 150-166) — UC-REL-09 ACs
2. `components/ui/button.tsx` (ALL) — inline button pattern with icon
3. `app/(drawer)/articles.tsx` (ALL) — expo-router navigation pattern to a document detail

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `components/chat/DocumentDisciplineFooter.tsx` (NEW)
- `components/chat/DocumentDisciplineFooter.stories.tsx` (NEW)
- `components/chat/DocumentDisciplineFooter.test.tsx` (NEW)

WRITE-PROHIBITED:
- `components/chat/ChatThread.tsx` (INT-UI-003)
- `convex/**` (save mutation already exists and is wired by INT-UI-003)

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

**Source**: `components/ui/button.tsx`

```tsx
import { View, Pressable, ActivityIndicator } from 'react-native'
import { Text } from '@/components/ui/text'
import { useRouter } from 'expo-router'

interface Props {
  savedDocumentId: string | null
  canSave: boolean
  isSaving?: boolean
  onSaveToKB?: () => void
}

export function DocumentDisciplineFooter({ savedDocumentId, canSave, isSaving, onSaveToKB }: Props) {
  const router = useRouter()
  if (!savedDocumentId && !canSave) return null
  return (
    <View testID="document-discipline-footer" className="flex-row items-center gap-2 mt-1 px-3">
      {savedDocumentId ? (
        <Pressable
          testID="document-discipline-open"
          onPress={() => router.push(`/documents/${savedDocumentId}`)}
          className="flex-row items-center gap-1"
        >
          <Text className="text-xs text-muted-foreground">Saved to KB · Open →</Text>
        </Pressable>
      ) : (
        <Pressable
          testID="document-discipline-save"
          accessibilityState={{ disabled: isSaving }}
          disabled={isSaving}
          onPress={onSaveToKB}
          className="flex-row items-center gap-1"
        >
          {isSaving && <ActivityIndicator size="small" />}
          <Text className="text-xs text-muted-foreground">Save this to KB</Text>
        </Pressable>
      )}
    </View>
  )
}
```

**Anti-pattern**: Always rendering the container so layout shifts when `savedDocumentId` arrives.

**Interaction notes**:
- Compact horizontal strip under the message bubble
- `router.push(`/documents/${savedDocumentId}`)` — adjust path if project convention differs (read `app/` first)

**Design references**:
- `.spec/prd/smarter-chat-agent/07-uc-rel.md` UC-REL-09

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

| Gate | Command | Expected |
|------|---------|----------|
| Unit tests | `pnpm vitest run components/chat/DocumentDisciplineFooter.test.tsx` | Exit 0 |
| Type check | `pnpm tsc --noEmit` | Exit 0 |
| Lint | `pnpm lint` | Exit 0 |
| Storybook | `vitest --project=storybook --run` | Exit 0 |

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: react-native-ui-implementer
**Rationale**: Dual-state inline footer (Saved vs Save-this) with router navigation, saving-in-progress animation, 4+ stories.

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

**Depends On**: (none — leaf, runs in parallel)
**Blocks**: INT-UI-003

--------------------------------------------------------------------------------
PRD REFS
--------------------------------------------------------------------------------

- `.spec/prd/smarter-chat-agent/07-uc-rel.md` UC-REL-09
- `.spec/prd/smarter-chat-agent/09-technical-requirements.md` Task #24

================================================================================
