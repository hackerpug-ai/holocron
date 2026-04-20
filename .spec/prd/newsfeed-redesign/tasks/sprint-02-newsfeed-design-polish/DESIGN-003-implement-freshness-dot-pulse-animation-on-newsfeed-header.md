================================================================================
TASK: DESIGN-003 - Implement freshness dot pulse animation on NewsfeedHeader
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

Add a subtle breathing pulse animation to the freshness dot in NewsfeedHeader to draw attention to report recency without being distracting.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- components/whats-new/NewsfeedHeader.tsx (MODIFY): Add Animated.View wrapper with breathing pulse
- components/whats-new/__tests__/NewsfeedHeader.test.tsx (MODIFY): Add animation tests

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] Freshness dot animates with opacity breathing (0.4 → 1.0 → 0.4) on mount — maps to AC-1
- [ ] Animation uses useNativeDriver={true} for 60fps performance — maps to AC-2
- [ ] testID and accessibilityLabel preserved — maps to AC-3
- [ ] Animation cleans up on unmount — maps to AC-4
- [ ] Pulse timing is subtle (1500ms, ease-in-out) — maps to AC-5
- [ ] pnpm test passes + pnpm tsgo --noEmit clean
- [ ] Only WRITE-ALLOWED files modified (git diff --name-only)

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Changing freshness color logic (green/amber/red thresholds)
- Adding haptic or sound feedback
- Animating any element other than the freshness dot
- Using react-native-reanimated (use RN Animated API for zero-dependency approach)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: Freshness dot has infinite pulse loop
  GIVEN: NewsfeedHeader renders with a valid report having a createdAt timestamp
  WHEN: Component mounts and the freshness dot is displayed
  THEN: The dot animates with a breathing pulse (opacity 0.4 → 1.0 → 0.4) repeating infinitely using Animated.loop with 1500ms total duration

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedHeader.test.tsx
  TEST_FUNCTION: pulseAnimationLoopsInfinitely

AC-2: Animation uses native driver
  GIVEN: NewsfeedHeader renders and the pulse animation starts
  WHEN: The animation sequence is created
  THEN: useNativeDriver={true} is set on all animated operations

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedHeader.test.tsx
  TEST_FUNCTION: animationUsesNativeDriver

AC-3: testID and accessibilityLabel preserved
  GIVEN: NewsfeedHeader renders with an animated freshness dot
  WHEN: Querying the component via testID and accessibility properties
  THEN: testID='newsfeed-header-freshness-dot' exists and accessibilityLabel contains 'Report freshness: {state}'

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedHeader.test.tsx
  TEST_FUNCTION: preservesTestIdAndAccessibility

AC-4: Animation cleans up on unmount
  GIVEN: NewsfeedHeader with pulse animation is rendered
  WHEN: The component unmounts
  THEN: Animation is stopped via useEffect cleanup to prevent memory leaks

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedHeader.test.tsx
  TEST_FUNCTION: animationCleansUpOnUnmount

AC-5: Pulse timing is subtle
  GIVEN: The pulse animation is configured
  WHEN: Observing the animation timing
  THEN: Duration is 1500ms (750ms in + 750ms out) using Easing.inOut(Easing.ease)

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedHeader.test.tsx
  TEST_FUNCTION: pulseTimingIsSubtle

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. components/whats-new/NewsfeedHeader.tsx
   - Lines: 14-25
   - Focus: FRESHNESS_COLORS constant and freshnessColor function

2. components/whats-new/NewsfeedHeader.tsx
   - Lines: 73-84
   - Focus: Current freshness dot View — wrap this with Animated.View

3. components/whats-new/__tests__/NewsfeedHeader.test.tsx
   - Lines: ALL
   - Focus: Existing test patterns for header rendering

4. RULES.md
   - Lines: 633-691
   - Focus: Theme tokens and interactive state patterns

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- components/whats-new/NewsfeedHeader.tsx (MODIFY)
- components/whats-new/__tests__/NewsfeedHeader.test.tsx (MODIFY)
- components/whats-new/NewsfeedHeader.stories.tsx (MODIFY)

WRITE-PROHIBITED:
- components/whats-new/NewsfeedFilterBar.tsx - Wrong component
- components/whats-new/NewsfeedFindingCard.tsx - Wrong component
- components/whats-new/NewsfeedHeroCard.tsx - Wrong component
- components/whats-new/categoryColors.ts - Do not modify
- Any .css files - React Native does not use CSS

MUST:
- [ ] Use React Native Animated API (not CSS or web-only animations)
- [ ] Wrap only the dot in Animated.View — not entire header
- [ ] Start animation on mount automatically
- [ ] Clean up animation on unmount via useEffect return
- [ ] Preserve existing testID and accessibilityLabel

MUST NOT:
- [ ] Use react-native-reanimated (keep zero new deps)
- [ ] Modify FRESHNESS_COLORS or freshness color thresholds
- [ ] Add haptic or sound feedback
- [ ] Hardcode animation timing values — define as named constants

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

Animation pattern:
```tsx
import { Animated, Easing } from 'react-native';

const PULSE_DURATION = 750; // ms per half-cycle (1500ms total)
const OPACITY_MIN = 0.4;
const OPACITY_MAX = 1.0;

const pulseAnim = useRef(new Animated.Value(OPACITY_MIN)).current;

useEffect(() => {
  const animation = Animated.loop(
    Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: OPACITY_MAX,
        duration: PULSE_DURATION,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.ease),
      }),
      Animated.timing(pulseAnim, {
        toValue: OPACITY_MIN,
        duration: PULSE_DURATION,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.ease),
      }),
    ])
  );
  animation.start();
  return () => animation.stop();
}, []);

// Replace the static View:
<Animated.View
  testID="newsfeed-header-freshness-dot"
  className="h-2 w-2 rounded-full"
  style={{ backgroundColor: freshColor, opacity: pulseAnim }}
  accessibilityLabel={...}
/>
```

Anti-pattern:
```tsx
// ❌ DON'T: Wrap entire header in Animated.View
// ❌ DON'T: Use useNativeDriver={false}
// ❌ DON'T: Forget cleanup — causes memory leaks
```

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** Freshness dot is a static View with bg color only — no animation.
**Gap:** Dot needs a subtle breathing pulse to feel alive and draw attention to recency.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

AGENT: frontend-designer

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  READ: Current AC definition, existing tests, NewsfeedHeader.tsx lines 73-84
  WRITE: ONE test that exercises GIVEN-WHEN-THEN
  RUN: pnpm test -- NewsfeedHeader.test.tsx -t '{test_function}'
  VERIFY: Test FAILS (not errors - fails)
  RETURN: { phase: "RED", test_file, test_function, failure_output }

  MUST: Show actual test failure output
  MUST NOT: Write ANY implementation code yet

### GREEN PHASE (after orchestrator VERIFY_RED passes)
  READ: Failing test, AC definition, code patterns above
  WRITE: MINIMAL code to make test pass
  RUN: pnpm test -- NewsfeedHeader.test.tsx
  VERIFY: Test PASSES
  RETURN: { phase: "GREEN", files_changed, test_output }

  MUST: Only write enough code to pass
  MUST NOT: Add features beyond test requirements

### REFACTOR PHASE (after orchestrator VERIFY_GREEN passes)
  READ: Implementation just written
  WRITE: Improved code (if needed)
  RUN: pnpm test
  VERIFY: Tests still pass
  RETURN: { phase: "REFACTOR", files_changed, still_passing }

  MUST: Keep tests green
  MUST NOT: Add new behavior

## AFTER ALL ACs COMPLETE:
  Update Storybook story to showcase pulse animation

--------------------------------------------------------------------------------
ORCHESTRATOR VERIFICATION PROTOCOL
--------------------------------------------------------------------------------

AFTER RED PHASE:
  RUN: pnpm test -- NewsfeedHeader.test.tsx -t '{test_function}'
  EXPECT: Exit code != 0, test failure for new test
  IF PASS: Reject "Vanity test - test passes without implementation"
  IF ERROR: Reject "Test has syntax/import error, not valid failure"

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
**Rationale**: Pure visual presentation — animation and styling work, no logic/state changes.

**Review Agent**: react-native-ui-reviewer
**Rationale**: Validates theme compliance, accessibility, and animation patterns.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

Gate 1: All Tests Pass
  Command: pnpm test
  Expected: Exit 0, all tests pass

Gate 2: Each AC Has Test
  Verify: Test file contains one test per AC (5 tests)

Gate 3: RED Phase Evidence
  Required: TDD_STATE checkboxes show each test failed before implementation

Gate 4: Type Check
  Command: pnpm tsgo --noEmit
  Expected: Exit 0

Gate 5: Lint
  Command: pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error components/whats-new/NewsfeedHeader.tsx
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
- [ ] Minimal implementation (no gold-plating)

Code Quality:
- [ ] Animation uses useNativeDriver={true}
- [ ] Cleanup on unmount via useEffect return
- [ ] No hardcoded timing values (named constants)
- [ ] Pattern consistent with existing code

Domain-Specific:
- [ ] Pulse is subtle (0.4-1.0 opacity, 1500ms cycle)
- [ ] testID preserved for E2E
- [ ] accessibilityLabel preserved for VoiceOver
- [ ] No theme token violations (uses existing FRESHNESS_COLORS)

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

- Animation is opacity-only (not scale) for subtlety and native driver compatibility
- All 4 sprint-02 tasks are independent and can run in parallel
- Score dots (DESIGN-006) may benefit from similar pulse but that's out of scope here

--------------------------------------------------------------------------------
TASK READINESS
--------------------------------------------------------------------------------

Prerequisites:
- [ ] Sprint 01 complete (NewsfeedHeader exists) (REQUIRED)

Can Execute In Parallel With: DESIGN-004, DESIGN-005, DESIGN-006

--------------------------------------------------------------------------------
APPROVAL
--------------------------------------------------------------------------------

Approved By: pending
Date: pending

================================================================================
