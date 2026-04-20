================================================================================
TASK: DESIGN-005 - Implement skeleton loading states for FindingCard and HeroCard
================================================================================

TASK_TYPE: DESIGN
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P0
EFFORT: S
TYPE: DEV
ITERATION: 1

--------------------------------------------------------------------------------
GOAL (1 sentence)
--------------------------------------------------------------------------------

Create animated skeleton loading states for NewsfeedFindingCard and NewsfeedHeroCard so users see shaped placeholders instead of blank flashes during data fetch.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- components/whats-new/SkeletonCard.tsx (NEW): Shared skeleton component with shimmer animation
- components/whats-new/NewsfeedFindingCard.tsx (MODIFY): Add isLoading prop, conditional skeleton render
- components/whats-new/NewsfeedHeroCard.tsx (MODIFY): Add isLoading prop, conditional skeleton render
- components/whats-new/__tests__/NewsfeedFindingCard.test.tsx (MODIFY): Add skeleton rendering tests
- components/whats-new/__tests__/NewsfeedHeroCard.test.tsx (MODIFY): Add skeleton rendering tests

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] Shared SkeletonCard component exists with shimmer animation — maps to AC-1
- [ ] FindingCard renders skeleton when isLoading=true — maps to AC-2
- [ ] HeroCard renders skeleton when isLoading=true — maps to AC-3
- [ ] Skeleton preserves exact card layout to prevent shift — maps to AC-4
- [ ] Shimmer uses useNativeDriver for performance — maps to AC-5
- [ ] Normal rendering unaffected when isLoading is false/undefined — maps to AC-6
- [ ] pnpm test passes + pnpm tsgo --noEmit clean
- [ ] Only WRITE-ALLOWED files modified (git diff --name-only)

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Modifying Convex hooks or data-fetching logic
- Adding network request handling
- Creating skeleton states for other components (header, filter bar)
- Fade-in/fade-out transitions between skeleton and content

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: Shared SkeletonCard component with shimmer exists
  GIVEN: SkeletonCard is created as a new component
  WHEN: It is imported and rendered with variant='finding'
  THEN: It renders placeholder elements with opacity-based shimmer animation looping infinitely

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: skeletonCardComponentExists

AC-2: FindingCard renders skeleton when isLoading=true
  GIVEN: NewsfeedFindingCard is rendered with isLoading={true}
  WHEN: The component renders
  THEN: It shows SkeletonCard placeholder with testID='newsfeed-finding-card-skeleton' instead of real content

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: findingCardRendersSkeletonWhenLoading

AC-3: HeroCard renders skeleton when isLoading=true
  GIVEN: NewsfeedHeroCard is rendered with isLoading={true}
  WHEN: The component renders
  THEN: It shows SkeletonCard placeholder with testID='newsfeed-hero-card-skeleton' instead of real content

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedHeroCard.test.tsx
  TEST_FUNCTION: heroCardRendersSkeletonWhenLoading

AC-4: Skeleton preserves card layout
  GIVEN: NewsfeedFindingCard skeleton is rendered
  WHEN: Comparing skeleton placeholder structure to real card
  THEN: Skeleton has matching elements: left border bar, category badge area, title line, summary lines, score dots row

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: skeletonPreservesFindingCardLayout

AC-5: Shimmer uses native driver
  GIVEN: SkeletonCard shimmer animation is configured
  WHEN: Inspecting the Animated API setup
  THEN: useNativeDriver={true} is set for smooth 60fps rendering

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: skeletonUsesNativeDriver

AC-6: Normal rendering unaffected when not loading
  GIVEN: NewsfeedFindingCard is rendered without isLoading or with isLoading={false}
  WHEN: The component renders
  THEN: It shows real content exactly as before, no skeleton elements in the tree

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: normalRenderingUnaffectedWhenNotLoading

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. components/whats-new/NewsfeedFindingCard.tsx
   - Lines: 53-94
   - Focus: FindingCard layout structure — skeleton must match this exactly

2. components/whats-new/NewsfeedHeroCard.tsx
   - Lines: 49-79
   - Focus: HeroCard layout structure — skeleton must match this exactly

3. components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
   - Lines: ALL
   - Focus: Existing FindingCard test patterns

4. components/whats-new/__tests__/NewsfeedHeroCard.test.tsx
   - Lines: ALL
   - Focus: Existing HeroCard test patterns

5. RULES.md
   - Lines: 633-691
   - Focus: Theme tokens for skeleton colors (bg-muted, etc.)

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- components/whats-new/SkeletonCard.tsx (NEW)
- components/whats-new/NewsfeedFindingCard.tsx (MODIFY)
- components/whats-new/NewsfeedHeroCard.tsx (MODIFY)
- components/whats-new/__tests__/NewsfeedFindingCard.test.tsx (MODIFY)
- components/whats-new/__tests__/NewsfeedHeroCard.test.tsx (MODIFY)
- components/whats-new/NewsfeedFindingCard.stories.tsx (MODIFY)
- components/whats-new/NewsfeedHeroCard.stories.tsx (MODIFY)

WRITE-PROHIBITED:
- components/whats-new/NewsfeedHeader.tsx - Wrong component
- components/whats-new/NewsfeedFilterBar.tsx - Wrong component
- components/whats-new/categoryColors.ts - Do not modify
- Any Convex hooks or data-fetching logic - Skeletons are visual-only
- app/ or screens/ directories - Components only

MUST:
- [ ] Create shared SkeletonCard component (not duplicate per card)
- [ ] Use React Native Animated API with useNativeDriver={true}
- [ ] Skeleton must have accessibilityLabel='Loading content'
- [ ] Skeleton testID follows pattern: '{card-testID}-skeleton'
- [ ] Clean up animations on unmount via useEffect return

MUST NOT:
- [ ] Use CSS animations — React Native requires Animated API
- [ ] Hardcode colors — use bg-muted via NativeWind className
- [ ] Make skeleton tappable (no Pressable wrapper)
- [ ] Remove or break existing card functionality

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

Skeleton component pattern:
```tsx
import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { Text } from '@/components/ui/text';

const SHIMMER_MIN = 0.3;
const SHIMMER_MAX = 0.6;
const SHIMMER_DURATION = 1000;

interface SkeletonCardProps {
  testID?: string;
  variant: 'finding' | 'hero';
}

export function SkeletonCard({ testID = 'skeleton-card', variant }: SkeletonCardProps) {
  const shimmerAnim = useRef(new Animated.Value(SHIMMER_MIN)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: SHIMMER_MAX,
          duration: SHIMMER_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: SHIMMER_MIN,
          duration: SHIMMER_DURATION,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <View testID={testID} accessibilityLabel="Loading content">
      <Animated.View style={{ opacity: shimmerAnim }}>
        {/* Placeholder shapes matching card layout */}
        <View className="h-3 w-16 rounded bg-muted" />
        <View className="h-4 w-3/4 rounded bg-muted mt-2" />
        <View className="h-3 w-full rounded bg-muted mt-1" />
      </Animated.View>
    </View>
  );
}

// Usage in FindingCard:
if (isLoading) {
  return (
    <View style={[styles.container]}>
      <SkeletonCard testID={`${testID}-skeleton`} variant="finding" />
    </View>
  );
}
```

Anti-pattern:
```tsx
// ❌ DON'T: Use text placeholders like "Loading..."
// ❌ DON'T: Duplicate skeleton code per card
// ❌ DON'T: Forget useNativeDriver — will be janky
// ❌ DON'T: Make skeleton tappable
```

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** Cards render nothing during loading — blank flash before data arrives.
**Gap:** Need shaped, animated placeholders that match card layouts to provide visual continuity.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

AGENT: frontend-designer

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  READ: Current AC definition, existing tests, both card component layouts
  WRITE: ONE test that exercises GIVEN-WHEN-THEN
  RUN: pnpm test -- NewsfeedFindingCard.test.tsx -t '{test_function}'
  VERIFY: Test FAILS (not errors - fails)
  RETURN: { phase: "RED", test_file, test_function, failure_output }

### GREEN PHASE (after orchestrator VERIFY_RED passes)
  READ: Failing test, AC definition, code patterns above
  WRITE: MINIMAL code to make test pass
  RUN: pnpm test
  VERIFY: Test PASSES
  RETURN: { phase: "GREEN", files_changed, test_output }

### REFACTOR PHASE (after orchestrator VERIFY_GREEN passes)
  READ: Implementation — check if skeleton layouts can be simplified
  WRITE: Improved code (if needed)
  RUN: pnpm test
  VERIFY: Tests still pass
  RETURN: { phase: "REFACTOR", files_changed, still_passing }

## AFTER ALL ACs COMPLETE:
  Add skeleton variant to both Storybook stories

--------------------------------------------------------------------------------
ORCHESTRATOR VERIFICATION PROTOCOL
--------------------------------------------------------------------------------

AFTER RED PHASE:
  RUN: pnpm test -- NewsfeedFindingCard.test.tsx -t '{test_function}'
  EXPECT: Exit code != 0, test failure for new test
  IF PASS: Reject "Vanity test"
  IF ERROR: Reject "Test has syntax/import error"

AFTER GREEN PHASE:
  RUN: pnpm test
  EXPECT: Exit code 0, all tests pass
  IF FAIL: Return to agent with failure output

AFTER REFACTOR PHASE:
  RUN: pnpm test
  EXPECT: Exit code 0, all tests still pass
  IF FAIL: Return to agent with failure output

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: frontend-designer
**Rationale**: Visual loading states — skeleton layout and animation, no data logic.

**Review Agent**: react-native-ui-reviewer
**Rationale**: Validates layout fidelity, animation performance, and accessibility.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

Gate 1: All Tests Pass
  Command: pnpm test
  Expected: Exit 0

Gate 2: Each AC Has Test
  Verify: Test files contain one test per AC (6 tests total across 2 files)

Gate 3: RED Phase Evidence
  Required: TDD_STATE checkboxes show each test failed before implementation

Gate 4: Type Check
  Command: pnpm tsgo --noEmit
  Expected: Exit 0

Gate 5: Lint
  Command: pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error components/whats-new/SkeletonCard.tsx components/whats-new/NewsfeedFindingCard.tsx components/whats-new/NewsfeedHeroCard.tsx
  Expected: Exit 0

Gate 6: Scope Compliance
  Command: git diff --name-only
  Expected: Only WRITE-ALLOWED files modified

--------------------------------------------------------------------------------
REVIEW CRITERIA (for react-native-ui-reviewer)
--------------------------------------------------------------------------------

TDD Quality:
- [ ] One test per acceptance criterion
- [ ] Tests verify behavior, not implementation
- [ ] RED evidence in TDD_STATE checkboxes
- [ ] Minimal implementation

Code Quality:
- [ ] Shared SkeletonCard (not duplicated per card)
- [ ] Animation cleanup on unmount
- [ ] No hardcoded colors — uses bg-muted via NativeWind
- [ ] TypeScript types for isLoading prop

Domain-Specific:
- [ ] Skeleton layout matches real card (no layout shift)
- [ ] Shimmer is subtle (0.3-0.6 opacity range)
- [ ] accessibilityLabel on skeleton
- [ ] Skeleton not tappable

Review Verdict: [ ] APPROVED   [ ] NEEDS_FIXES

Feedback (required if NEEDS_FIXES):
```
[Reviewer documents specific, actionable issues here]
```

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends On:
- None

Blocks:
- None

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

- Skeleton uses opacity shimmer (not position-based shimmer) for simplicity
- variant prop drives layout differences between finding and hero cards
- The NewsfeedScreen in Sprint 01 would need to pass isLoading={true} during fetch — that wiring is deferred to integration, not this task
- All 4 sprint-02 tasks are independent and can run in parallel

--------------------------------------------------------------------------------
TASK READINESS
--------------------------------------------------------------------------------

Prerequisites:
- [ ] Sprint 01 complete (both card components exist) (REQUIRED)

Can Execute In Parallel With: DESIGN-003, DESIGN-004, DESIGN-006

--------------------------------------------------------------------------------
APPROVAL
--------------------------------------------------------------------------------

Approved By: pending
Date: pending

================================================================================
