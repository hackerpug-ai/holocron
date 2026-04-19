================================================================================
TASK: NEWSFEED-004 - Create NewsfeedHeroCard Component
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

Build the NewsfeedHeroCard that visually elevates the highest-scored finding with a Card wrapper, 4 px left border, extra-bold enlarged title, 4-line summary, 'TOP SIGNAL' eyebrow, and a bottom metadata row — communicating editorial priority without any data interface changes.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- components/whats-new/NewsfeedHeroCard.tsx (NEW): React.memo named export; uses Card wrapper, 4 px left border, font-extrabold text-xl title, TOP SIGNAL eyebrow, required onPress.
- components/whats-new/__tests__/NewsfeedHeroCard.test.tsx (NEW): Vitest + @testing-library/react-native tests covering hero-specific traits: eyebrow label, border width, title class, bottom row, and onPress required constraint.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] components/whats-new/NewsfeedHeroCard.tsx exists as a named export wrapped in React.memo
- [ ] Imports and uses Card from '@/components/ui/card' as the root container
- [ ] Imports WhatsNewFindingCardProps from './WhatsNewFindingCard' — does not redefine the interface
- [ ] Imports CATEGORY_COLORS from './categoryColors'
- [ ] Left border is 4px wide (borderLeftWidth:4) — NOT 3px like NewsfeedFindingCard
- [ ] 'TOP SIGNAL' eyebrow Text has className='text-xs uppercase text-muted-foreground'
- [ ] Title Text has className containing 'font-extrabold' and 'text-xl', numberOfLines={3}
- [ ] Summary Text has numberOfLines={4}
- [ ] Bottom row is flex-row View with className='flex-row justify-between' containing velocity, source, time
- [ ] onPress prop is typed as required (not optional) — TypeScript enforces this
- [ ] testID defaults to 'newsfeed-hero-card'; Pressable has testID=`${testID}-pressable`
- [ ] `pnpm tsgo --noEmit` exits 0
- [ ] `pnpm biome check .` exits 0
- [ ] `pnpm test` exits 0 with NewsfeedHeroCard suite passing (5 tests)
- [ ] Only WRITE-ALLOWED files modified (git diff --name-only)

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Rendering a hero image or background photo
- Animated entrance or shimmer on load
- Sharing or bookmarking actions
- Determining WHICH finding is the hero — that logic belongs to screen assembly (NEWSFEED-005)
- Modifying NewsfeedFindingCard or any existing component

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: TOP SIGNAL eyebrow is present
  GIVEN: Any valid WhatsNewFindingCardProps
  WHEN: NewsfeedHeroCard renders
  THEN: A Text element with testID='newsfeed-hero-card-eyebrow' contains exactly 'TOP SIGNAL' and has uppercase text-xs styling

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedHeroCard.test.tsx
  TEST_FUNCTION: topSignalEyebrowPresent

AC-2: Left border is 4 px wide
  GIVEN: category='release'
  WHEN: NewsfeedHeroCard renders
  THEN: The outer Card or inner View has style borderLeftWidth:4 and borderLeftColor:'#10B981'

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedHeroCard.test.tsx
  TEST_FUNCTION: leftBorderIs4pxWide

AC-3: Title is extrabold xl with 3-line cap
  GIVEN: title='A very long article title that exceeds three lines when rendered'
  WHEN: NewsfeedHeroCard renders
  THEN: Title Text has className containing 'font-extrabold' and 'text-xl', and numberOfLines=3

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedHeroCard.test.tsx
  TEST_FUNCTION: titleIsExtraboldXlWith3LineCap

AC-4: Bottom row has velocity, source, and time
  GIVEN: engagementVelocity=42, source='Hacker News', publishedAt='2026-04-19T12:00:00Z'
  WHEN: NewsfeedHeroCard renders
  THEN: A View with testID='newsfeed-hero-card-meta-row' exists and contains children showing velocity (42), source ('Hacker News'), and relative time

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedHeroCard.test.tsx
  TEST_FUNCTION: bottomRowHasVelocitySourceAndTime

AC-5: onPress is required — TypeScript errors without it
  GIVEN: NewsfeedHeroCard is used without an onPress prop
  WHEN: TypeScript type-checks the usage
  THEN: TypeScript emits a type error (Property 'onPress' is missing in type)

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedHeroCard.test.tsx
  TEST_FUNCTION: onPressIsRequiredTypeCheck — verified via pnpm tsgo --noEmit on a test fixture

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. components/whats-new/WhatsNewFindingCard.tsx
   - Lines: ALL
   - Focus: WhatsNewFindingCardProps interface to import; bottom-row pattern (source, author, velocity) to adapt for hero meta row

2. components/whats-new/categoryColors.ts
   - Lines: ALL
   - Focus: CATEGORY_COLORS values for the 4px border color

3. components/ui/card.tsx
   - Lines: ALL
   - Focus: Card component API — understand className prop passthrough for 'px-5 py-5' override

4. components/whats-new/NewsfeedFindingCard.tsx
   - Lines: ALL
   - Focus: ScoreDots sub-component — if already defined there, import it rather than duplicating

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- components/whats-new/NewsfeedHeroCard.tsx (NEW)
- components/whats-new/__tests__/NewsfeedHeroCard.test.tsx (NEW)

WRITE-PROHIBITED:
- components/whats-new/WhatsNewFindingCard.tsx — existing component must not be modified
- components/whats-new/NewsfeedFindingCard.tsx — do not modify sibling to accommodate hero needs
- components/whats-new/categoryColors.ts — read-only token file
- components/ui/card.tsx — do not modify the shared Card primitive
- components/whats-new/index.ts — barrel update deferred to NEWSFEED-005

MUST:
- [ ] Use `Omit<WhatsNewFindingCardProps, 'onPress'> & { onPress: () => void }` to make onPress required
- [ ] Use Card wrapper from '@/components/ui/card'
- [ ] borderLeftWidth: 4 (not 3)
- [ ] numberOfLines={3} on title, numberOfLines={4} on summary

MUST NOT:
- [ ] Use borderLeftWidth: 3 (that's the regular card)
- [ ] Make onPress optional
- [ ] Use numberOfLines={2} on title

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

```tsx
import React from 'react'
import { Pressable, View } from 'react-native'
import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { CATEGORY_COLORS } from './categoryColors'
import type { WhatsNewFindingCardProps } from './WhatsNewFindingCard'

// onPress is required on HeroCard (override the optional from base props)
type NewsfeedHeroCardProps = Omit<WhatsNewFindingCardProps, 'onPress'> & { onPress: () => void }

function NewsfeedHeroCardComponent({
  title, source, category, score, summary,
  publishedAt, engagementVelocity,
  testID = 'newsfeed-hero-card', onPress,
}: NewsfeedHeroCardProps) {
  return (
    <Card
      testID={testID}
      className="px-5 py-5"
      style={{ borderLeftColor: CATEGORY_COLORS[category], borderLeftWidth: 4 }}
    >
      <Pressable testID={`${testID}-pressable`} onPress={onPress}>
        <Text testID={`${testID}-eyebrow`} className="text-xs uppercase text-muted-foreground">
          TOP SIGNAL
        </Text>
        <Text className="font-extrabold text-xl" numberOfLines={3}>{title}</Text>
        {summary && <Text numberOfLines={4}>{summary}</Text>}
        <View testID={`${testID}-meta-row`} className="flex-row justify-between">
          {/* velocity, source, time */}
        </View>
      </Pressable>
    </Card>
  )
}

export const NewsfeedHeroCard = React.memo(NewsfeedHeroCardComponent)
```

Anti-pattern (DO NOT):
```tsx
// WRONG — 3px border (must be 4px on hero)
style={{ borderLeftWidth: 3 }}

// WRONG — onPress as optional, defeating the required contract
onPress?: () => void

// WRONG — numberOfLines={2} on title (spec says 3)
numberOfLines={2}

// WRONG — using View instead of Card wrapper
<View> ... </View>
```

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** All findings render with the same WhatsNewFindingCard — the highest-scored finding receives no special visual elevation. The 'signal' hierarchy is invisible.

**Gap:** Sprint 1 gate requires the top-scored finding to receive distinct hero treatment. NewsfeedHeroCard provides this elevated presentation while keeping the data contract identical to NewsfeedFindingCard, allowing NEWSFEED-005 to simply render the first finding with HeroCard and the rest with FindingCard.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

AGENT: frontend-designer

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  WRITE: ONE failing test for the current AC
  RUN: pnpm test -- NewsfeedHeroCard
  VERIFY: Test FAILS
  RETURN: { phase: "RED", test_file, failure_output }
  MUST NOT: Write implementation code yet

### GREEN PHASE
  WRITE: Minimal code to pass the current AC test
  RUN: pnpm test -- NewsfeedHeroCard
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
  RUN: pnpm test -- NewsfeedHeroCard
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
**Rationale**: Visual elevation treatment — Card wrapper, enlarged typography, wider border — pure layout work within frontend-designer scope.

**Review Agent**: react-native-ui-reviewer
**Rationale**: Reviewer confirms the 4px vs 3px border distinction is implemented, onPress is required at the type level, and the TOP SIGNAL eyebrow uses exactly the specified class list.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

Gate 1: All Tests Pass
  Command: pnpm test
  Expected: Exit 0, NewsfeedHeroCard suite passes (5 tests)

Gate 2: Type Check
  Command: pnpm tsgo --noEmit
  Expected: Exit 0

Gate 3: Lint
  Command: pnpm biome check .
  Expected: Exit 0

Gate 4: Scope Compliance
  Command: git diff --name-only
  Expected: Only NewsfeedHeroCard.tsx and __tests__/NewsfeedHeroCard.test.tsx

--------------------------------------------------------------------------------
REVIEW CRITERIA
--------------------------------------------------------------------------------

TDD Quality:
- [ ] 5 tests — one per AC — with RED evidence
- [ ] Tests verify observable props (borderLeftWidth:4, numberOfLines:3, eyebrow text)

Code Quality:
- [ ] Omit<WhatsNewFindingCardProps, 'onPress'> & { onPress: () => void } for required onPress
- [ ] Card wrapper present (not View)
- [ ] borderLeftWidth: 4 confirmed
- [ ] Title: font-extrabold text-xl numberOfLines={3}
- [ ] Summary: numberOfLines={4}

Review Verdict: [ ] APPROVED   [ ] NEEDS_FIXES

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends On:
- DESIGN-002 — CATEGORY_COLORS must exist

Blocks:
- NEWSFEED-005 — NewsfeedScreen renders NewsfeedHeroCard in ListHeaderComponent
- DESIGN-001 — Storybook story requires the component to exist

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

- Use `Omit<WhatsNewFindingCardProps, 'onPress'> & { onPress: () => void }` to make onPress required without duplicating the entire interface.
- ScoreDots is defined in NewsfeedFindingCard.tsx — if both tasks run as separate agents, duplicate for now and flag for extraction. If in the same session, extract to a shared file.
- The Card component's className prop merges via cn() — passing 'px-5 py-5' overrides the default padding. Verify Card in components/ui/card.tsx supports className override.
- Bottom meta row should gracefully omit velocity if engagementVelocity is 0 or undefined — match behavior in WhatsNewFindingCard lines 191-198.

================================================================================
