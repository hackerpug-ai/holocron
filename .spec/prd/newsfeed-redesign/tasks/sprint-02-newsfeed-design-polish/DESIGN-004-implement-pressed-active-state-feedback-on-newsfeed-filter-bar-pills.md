================================================================================
TASK: DESIGN-004 - Implement pressed/active state feedback on NewsfeedFilterBar pills
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

Add visual press feedback to filter pills using Pressable's render callback so users perceive tactile response when tapping.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- components/whats-new/NewsfeedFilterBar.tsx (MODIFY): Add pressed state styling to Pressable components
- components/whats-new/__tests__/NewsfeedFilterBar.test.tsx (MODIFY): Add press state tests

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] ALL pill shows darker background when pressed — maps to AC-1
- [ ] Active (selected) category pill shows press feedback — maps to AC-2
- [ ] Inactive (unselected) category pill shows press feedback — maps to AC-3
- [ ] Press state uses render callback, not useState — maps to AC-4
- [ ] All existing testIDs remain unchanged — maps to AC-5
- [ ] pnpm test passes + pnpm tsgo --noEmit clean
- [ ] Only WRITE-ALLOWED files modified (git diff --name-only)

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Adding haptic feedback to presses
- Changing pill layout, spacing, or sizing
- Modifying filter selection logic or onChange callback
- Adding animation libraries for press feedback

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: ALL pill shows pressed state when tapped
  GIVEN: NewsfeedFilterBar is rendered with options and the ALL pill is visible
  WHEN: User taps the ALL pill (regardless of current selection state)
  THEN: The pill background darkens via opacity change (0.7) applied through pressed state styling

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFilterBar.test.tsx
  TEST_FUNCTION: allPillShowsPressedState

AC-2: Active category pill shows pressed state
  GIVEN: NewsfeedFilterBar is rendered with a selected category pill (e.g., 'discovery')
  WHEN: User taps the currently-selected discovery pill
  THEN: The pill shows visual press feedback (opacity dimming) distinct from its selected styling

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFilterBar.test.tsx
  TEST_FUNCTION: activePillShowsPressedState

AC-3: Inactive category pill shows pressed state
  GIVEN: NewsfeedFilterBar is rendered and 'release' pill is not selected
  WHEN: User taps the inactive release pill
  THEN: The pill shows visual press feedback (opacity dimming)

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFilterBar.test.tsx
  TEST_FUNCTION: inactivePillShowsPressedState

AC-4: Pressable render callback pattern is used
  GIVEN: NewsfeedFilterBar code is inspected
  WHEN: Looking at how press state is detected
  THEN: Pressable uses render callback function ({ pressed }) => ... and no useState for press tracking

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFilterBar.test.tsx
  TEST_FUNCTION: usesRenderCallbackPattern

AC-5: Existing testIDs remain unchanged
  GIVEN: NewsfeedFilterBar is rendered with press feedback
  WHEN: Querying elements by their testIDs
  THEN: All testIDs exist unchanged: 'filter-pill-all', 'filter-pill-{key}', 'filter-pill-{key}-count'

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFilterBar.test.tsx
  TEST_FUNCTION: preservesExistingTestIDs

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. components/whats-new/NewsfeedFilterBar.tsx
   - Lines: 33-55
   - Focus: ALL pill Pressable structure — first pill to add press feedback

2. components/whats-new/NewsfeedFilterBar.tsx
   - Lines: 70-97
   - Focus: Category pill Pressable structure — apply same pattern here

3. components/whats-new/__tests__/NewsfeedFilterBar.test.tsx
   - Lines: ALL
   - Focus: Existing filter bar test patterns

4. RULES.md
   - Lines: 705-724
   - Focus: Pressable interactive states pattern

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- components/whats-new/NewsfeedFilterBar.tsx (MODIFY)
- components/whats-new/__tests__/NewsfeedFilterBar.test.tsx (MODIFY)
- components/whats-new/NewsfeedFilterBar.stories.tsx (MODIFY)

WRITE-PROHIBITED:
- components/whats-new/NewsfeedHeader.tsx - Wrong component
- components/whats-new/NewsfeedFindingCard.tsx - Wrong component
- components/whats-new/NewsfeedHeroCard.tsx - Wrong component
- components/whats-new/categoryColors.ts - Do not modify
- Any new hook files - Use Pressable callback, not custom hooks

MUST:
- [ ] Use Pressable's render callback ({ pressed }) => ... for press detection
- [ ] Apply pressed styling to both ALL pill and category pills
- [ ] Press feedback must be immediate (no delayed transitions)
- [ ] Preserve existing accessibilityRole and accessibilityState props

MUST NOT:
- [ ] Add useState for press tracking
- [ ] Use TouchableWithoutFeedback or deprecated touch components
- [ ] Change pill layout structure
- [ ] Add haptic feedback

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

Pressable render callback pattern:
```tsx
<Pressable
  testID="filter-pill-all"
  onPress={() => onChange('all')}
  accessibilityRole="radio"
  accessibilityState={{ selected: selected === 'all' }}
>
  {({ pressed }) => (
    <View
      className={cn(
        'rounded-full px-3 py-1.5 flex-row items-center gap-1.5',
        selected === 'all'
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground',
        pressed && 'opacity-70'
      )}
    >
      <Text className="text-sm font-medium">ALL</Text>
      <View testID="filter-pill-all-count">
        <Text className="text-xs font-bold">{totalCount}</Text>
      </View>
    </View>
  )}
</Pressable>
```

Anti-pattern:
```tsx
// ❌ DON'T: Use useState for press tracking
const [isPressed, setIsPressed] = useState(false); // unnecessary re-renders

// ❌ DON'T: Apply pressed to Pressable className (doesn't work)
<Pressable className={pressed ? 'opacity-70' : ''}> // wrong level

// ❌ DON'T: Forget to move children inside the render callback
```

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** Pills use Pressable with direct className — no render callback, no pressed feedback.
**Gap:** Users need tactile visual confirmation when pressing a pill before selection activates.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

AGENT: frontend-designer

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  READ: Current AC definition, existing tests, NewsfeedFilterBar.tsx lines 33-97
  WRITE: ONE test that exercises GIVEN-WHEN-THEN
  RUN: pnpm test -- NewsfeedFilterBar.test.tsx -t '{test_function}'
  VERIFY: Test FAILS (not errors - fails)
  RETURN: { phase: "RED", test_file, test_function, failure_output }

### GREEN PHASE (after orchestrator VERIFY_RED passes)
  READ: Failing test, AC definition, code patterns above
  WRITE: MINIMAL code to make test pass
  RUN: pnpm test -- NewsfeedFilterBar.test.tsx
  VERIFY: Test PASSES
  RETURN: { phase: "GREEN", files_changed, test_output }

### REFACTOR PHASE (after orchestrator VERIFY_GREEN passes)
  READ: Implementation just written
  WRITE: Improved code (if needed — extract shared pill component?)
  RUN: pnpm test
  VERIFY: Tests still pass
  RETURN: { phase: "REFACTOR", files_changed, still_passing }

## AFTER ALL ACs COMPLETE:
  Update Storybook story to showcase press feedback with play function

--------------------------------------------------------------------------------
ORCHESTRATOR VERIFICATION PROTOCOL
--------------------------------------------------------------------------------

AFTER RED PHASE:
  RUN: pnpm test -- NewsfeedFilterBar.test.tsx -t '{test_function}'
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
**Rationale**: Pure visual feedback — Pressable styling work, no logic/state changes.

**Review Agent**: react-native-ui-reviewer
**Rationale**: Validates theme compliance, accessibility, and interaction patterns.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

Gate 1: All Tests Pass
  Command: pnpm test
  Expected: Exit 0

Gate 2: Each AC Has Test
  Verify: Test file contains one test per AC (5 tests)

Gate 3: RED Phase Evidence
  Required: TDD_STATE checkboxes show each test failed before implementation

Gate 4: Type Check
  Command: pnpm tsgo --noEmit
  Expected: Exit 0

Gate 5: Lint
  Command: pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error components/whats-new/NewsfeedFilterBar.tsx
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
- [ ] Pressable render callback used (not useState)
- [ ] Press feedback applied to ALL pills equally
- [ ] Existing testIDs preserved
- [ ] No unnecessary abstractions

Domain-Specific:
- [ ] Pressed state visually distinct from selected state
- [ ] Accessibility role and state unchanged
- [ ] No theme token violations
- [ ] Feedback is immediate (no delay)

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

- Press feedback is opacity-based (0.7) for simplicity and consistency
- All 4 sprint-02 tasks are independent and can run in parallel
- Consider extracting a shared Pill component during REFACTOR if both ALL and category pills share identical pressed logic

--------------------------------------------------------------------------------
TASK READINESS
--------------------------------------------------------------------------------

Prerequisites:
- [ ] Sprint 01 complete (NewsfeedFilterBar exists) (REQUIRED)

Can Execute In Parallel With: DESIGN-003, DESIGN-005, DESIGN-006

--------------------------------------------------------------------------------
APPROVAL
--------------------------------------------------------------------------------

Approved By: pending
Date: pending

================================================================================
