================================================================================
TASK: NEWSFEED-003 - Create NewsfeedFindingCard Component
================================================================================

TASK_TYPE: FEATURE
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P0
EFFORT: M
TYPE: DEV
ITERATION: 1

Sprint: [Sprint 1: Intelligence Briefing Screen](./SPRINT.md)

--------------------------------------------------------------------------------
GOAL (1 sentence)
--------------------------------------------------------------------------------

Build the NewsfeedFindingCard component as a list-row with a 3 px left-border accent colored by category, dot-score indicator, plain category text label (no pill), and hairline bottom separator — replacing the current heavy Card + pill badge visual language.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- components/whats-new/NewsfeedFindingCard.tsx (NEW): React.memo named export; reuses WhatsNewFindingCardProps interface verbatim; implements left-border accent, ScoreDots, and hairline separator.
- components/whats-new/__tests__/NewsfeedFindingCard.test.tsx (NEW): Vitest + @testing-library/react-native tests for render, border color, score dots, onPress, and separator presence.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] components/whats-new/NewsfeedFindingCard.tsx exists as a named export wrapped in React.memo
- [ ] Imports WhatsNewFindingCardProps from './WhatsNewFindingCard' — does not redefine the interface
- [ ] Imports CATEGORY_COLORS and CategoryKey from './categoryColors'
- [ ] Root View has inline style borderLeftWidth:3 and borderLeftColor:CATEGORY_COLORS[category]
- [ ] Bottom separator uses StyleSheet.hairlineWidth borderBottomWidth on the root View
- [ ] No Card wrapper component used
- [ ] No pill badge — category renders as plain Text with className='text-xs' and inline color
- [ ] ScoreDots sub-component: Math.round(score/10 * 5) filled (●) out of 5 total (○)
- [ ] Pressable has testID=`${testID}-pressable` and onPress wired correctly
- [ ] testID defaults to 'newsfeed-finding-card'
- [ ] `pnpm tsgo --noEmit` exits 0
- [ ] `pnpm biome check .` exits 0
- [ ] `pnpm test` exits 0 with NewsfeedFindingCard suite passing (6 tests)
- [ ] Only WRITE-ALLOWED files modified (git diff --name-only)

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Modifying WhatsNewFindingCard.tsx — existing component stays unchanged; NewsfeedFindingCard is a new parallel component
- Swipe-to-dismiss or long-press context menus
- Image thumbnails or hero treatment — that is NewsfeedHeroCard (NEWSFEED-004)
- Fetching article content — onPress callback only

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: Left border color matches category
  GIVEN: category='discovery'
  WHEN: NewsfeedFindingCard renders
  THEN: Root View style includes borderLeftColor:'#F59E0B' and borderLeftWidth:3

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: leftBorderColorMatchesCategory

AC-2: Score dots render correctly for score=70
  GIVEN: score=70 (7/10 → 3.5 → rounds to 4 filled dots out of 5)
  WHEN: NewsfeedFindingCard renders
  THEN: The score dot element shows text '●●●●○'

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: scoreDotsRenderCorrectly

AC-3: Score dots show all empty when score is undefined
  GIVEN: score is not provided
  WHEN: NewsfeedFindingCard renders
  THEN: Score dot element shows '○○○○○'

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: scoreDotsAllEmptyWhenUndefined

AC-4: onPress fires when pressable tapped
  GIVEN: onPress is a jest.fn()
  WHEN: User fires press on testID='newsfeed-finding-card-pressable'
  THEN: onPress is called exactly once

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: onPressFiresWhenTapped

AC-5: No Card or Badge component in the tree
  GIVEN: Any valid props
  WHEN: NewsfeedFindingCard renders
  THEN: The component file source does not import Card or Badge; rendered tree contains no testID matching 'card' or 'badge'

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: noCardOrBadgeInTree

AC-6: Hairline separator present
  GIVEN: Any valid props
  WHEN: NewsfeedFindingCard renders
  THEN: Root container View style includes borderBottomWidth equal to StyleSheet.hairlineWidth

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: hairlineSeparatorPresent

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. components/whats-new/WhatsNewFindingCard.tsx
   - Lines: ALL
   - Focus: WhatsNewFindingCardProps interface to import verbatim; formatRelativeTime helper to copy; existing visual pattern to understand what we are diverging from

2. components/whats-new/categoryColors.ts
   - Lines: ALL
   - Focus: CATEGORY_COLORS values and CategoryKey type — must be imported, not redefined

3. components/CLAUDE.md
   - Lines: ALL
   - Focus: Inline style exception for dynamic borderLeftColor; NativeWind className-first for everything else

4. components/subscriptions/FeedItemSkeleton.tsx
   - Lines: 1-30
   - Focus: StyleSheet.hairlineWidth usage pattern for separator borders

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- components/whats-new/NewsfeedFindingCard.tsx (NEW)
- components/whats-new/__tests__/NewsfeedFindingCard.test.tsx (NEW)

WRITE-PROHIBITED:
- components/whats-new/WhatsNewFindingCard.tsx — existing component must not be modified
- components/whats-new/categoryColors.ts — read-only; created by DESIGN-002
- components/ui/card.tsx — do not modify the shared Card primitive
- components/ui/badge.tsx — do not modify the shared Badge primitive
- components/whats-new/index.ts — barrel update deferred to NEWSFEED-005

MUST:
- [ ] Import WhatsNewFindingCardProps from './WhatsNewFindingCard' (not redefined)
- [ ] Import CATEGORY_COLORS from './categoryColors' (not hardcoded hex)
- [ ] Use StyleSheet.hairlineWidth for bottom separator
- [ ] No Card or Badge imports

MUST NOT:
- [ ] Redefine the props interface
- [ ] Import Card from '@/components/ui/card'
- [ ] Import Badge from '@/components/ui/badge'
- [ ] Use pill badge for category display

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

```tsx
import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/text'
import { CATEGORY_COLORS } from './categoryColors'
import type { WhatsNewFindingCardProps } from './WhatsNewFindingCard'

function ScoreDots({ score }: { score?: number }) {
  const filled = score !== undefined ? Math.round((score / 10) * 5) : 0
  return (
    <Text className="text-xs text-muted-foreground">
      {'●'.repeat(filled)}{'○'.repeat(5 - filled)}
    </Text>
  )
}

function NewsfeedFindingCardComponent({
  title, source, category, score, summary, publishedAt,
  engagementVelocity, testID = 'newsfeed-finding-card', onPress,
}: WhatsNewFindingCardProps) {
  return (
    <View
      testID={testID}
      style={[
        styles.container,
        { borderLeftColor: CATEGORY_COLORS[category], borderLeftWidth: 3 },
      ]}
    >
      <Pressable testID={`${testID}-pressable`} onPress={onPress}>
        {/* content */}
      </Pressable>
    </View>
  )
}

export const NewsfeedFindingCard = React.memo(NewsfeedFindingCardComponent)

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
})
```

Anti-pattern (DO NOT):
```tsx
// WRONG — importing Card wrapper (spec says no Card)
import { Card } from '@/components/ui/card'

// WRONG — redefining props interface instead of importing
export interface NewsfeedFindingCardProps { title: string; ... }

// WRONG — pill badge for category
<View className="rounded-full bg-warning/20 px-2 py-1"><Text>{category}</Text></View>

// WRONG — hardcoding hex without importing from categoryColors
style={{ borderLeftColor: '#F59E0B' }}
```

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** WhatsNewFindingCard.tsx wraps findings in a Card component and uses rounded pill badges for categories. The design is clean but visually generic — it does not communicate the 'signal intelligence briefing' aesthetic.

**Gap:** The Sprint 1 gate requires left-border accent cards for all non-hero findings. NewsfeedFindingCard achieves the editorial briefing aesthetic while keeping the exact same data interface (WhatsNewFindingCardProps) so the screen assembly task can swap them in without prop changes.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

AGENT: frontend-designer

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  WRITE: ONE failing test for the current AC
  RUN: pnpm test -- NewsfeedFindingCard
  VERIFY: Test FAILS
  RETURN: { phase: "RED", test_file, failure_output }
  MUST NOT: Write implementation code yet

### GREEN PHASE
  WRITE: Minimal code to pass the current AC test
  RUN: pnpm test -- NewsfeedFindingCard
  VERIFY: Test PASSES
  RETURN: { phase: "GREEN", files_changed, test_output }

### REFACTOR PHASE
  RUN: pnpm test
  VERIFY: All tests still pass
  RETURN: { phase: "REFACTOR", still_passing: true }

--------------------------------------------------------------------------------
ORCHESTRATOR VERIFICATION PROTOCOL
--------------------------------------------------------------------------------

AFTER RED PHASE:
  RUN: pnpm test -- NewsfeedFindingCard
  EXPECT: Exit code != 0

AFTER GREEN PHASE:
  RUN: pnpm test
  EXPECT: Exit code 0

AFTER REFACTOR PHASE:
  RUN: pnpm test && pnpm tsgo --noEmit && pnpm biome check .
  EXPECT: All exit 0

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: frontend-designer
**Rationale**: New component with different visual treatment but identical data contract — pure layout and styling work.

**Review Agent**: react-native-ui-reviewer
**Rationale**: Reviewer verifies no Card or Badge imports, inline style is restricted to the border color exception, and score dot math is correct.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

Gate 1: All Tests Pass
  Command: pnpm test
  Expected: Exit 0, NewsfeedFindingCard suite passes (6 tests)

Gate 2: Type Check
  Command: pnpm tsgo --noEmit
  Expected: Exit 0

Gate 3: Lint
  Command: pnpm biome check .
  Expected: Exit 0

Gate 4: Scope Compliance
  Command: git diff --name-only
  Expected: Only NewsfeedFindingCard.tsx and __tests__/NewsfeedFindingCard.test.tsx

--------------------------------------------------------------------------------
REVIEW CRITERIA
--------------------------------------------------------------------------------

TDD Quality:
- [ ] 6 tests — one per AC — with RED evidence
- [ ] Tests verify observable behavior (border color in style, dot text, onPress call count)

Code Quality:
- [ ] No Card or Badge import
- [ ] WhatsNewFindingCardProps imported (not redefined)
- [ ] CATEGORY_COLORS imported from './categoryColors'
- [ ] StyleSheet.hairlineWidth used for separator
- [ ] ScoreDots math: Math.round(score/10 * 5) filled out of 5

Review Verdict: [ ] APPROVED   [ ] NEEDS_FIXES

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends On:
- DESIGN-002 — CATEGORY_COLORS must exist

Blocks:
- NEWSFEED-005 — NewsfeedScreen renders NewsfeedFindingCard in FlatList
- DESIGN-001 — Storybook story requires the component to exist

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

- formatRelativeTime in WhatsNewFindingCard.tsx accepts an ISO date string; copy the function rather than writing a new implementation.
- ScoreDots sub-component: define inside NewsfeedFindingCard.tsx unless NewsfeedHeroCard also needs it — check NEWSFEED-004 and extract to a shared file if both need it.
- borderBottomColor for the separator should use the NativeWind 'border-border' class on the View rather than a hardcoded hex so it respects dark/light theme.
- category prop typed as 'discovery'|'release'|'trend'|'discussion' — TypeScript verifies the CATEGORY_COLORS lookup is exhaustive.

================================================================================
