================================================================================
TASK: DESIGN-006 - Score dot color tiers and accessibility labels on NewsfeedFindingCard
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

Add color-coded quality tiers to score dots and meaningful VoiceOver labels so users quickly assess finding quality at a glance.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- components/whats-new/NewsfeedFindingCard.tsx (MODIFY): Add color tiers to ScoreDots, add accessibilityLabel
- components/whats-new/__tests__/NewsfeedFindingCard.test.tsx (MODIFY): Add color tier and a11y tests

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] High scores (>=80) show green/success dots — maps to AC-1
- [ ] Medium scores (>=50) show amber/warning dots — maps to AC-2
- [ ] Low scores (<50) show red/danger dots — maps to AC-3
- [ ] Empty dots remain neutral muted-foreground — maps to AC-4
- [ ] accessibilityLabel announces score and tier — maps to AC-5
- [ ] Colors use theme tokens, not hardcoded hex — maps to AC-6
- [ ] pnpm test passes + pnpm tsgo --noEmit clean
- [ ] Only WRITE-ALLOWED files modified (git diff --name-only)

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Changing score calculation logic (score/10 * 5 → 5 dots)
- Adding animation to score dots
- Modifying NewsfeedHeroCard score display
- Creating new color constant files (use theme tokens)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: Score dots show green for high scores (>=80)
  GIVEN: NewsfeedFindingCard renders with score={85}
  WHEN: The ScoreDots component renders
  THEN: Filled dots use success/green color class (text-success), empty dots remain muted

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: scoreDotsGreenForHighScores

AC-2: Score dots show amber for medium scores (>=50)
  GIVEN: NewsfeedFindingCard renders with score={65}
  WHEN: The ScoreDots component renders
  THEN: Filled dots use warning/amber color class (text-warning)

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: scoreDotsAmberForMediumScores

AC-3: Score dots show red for low scores (<50)
  GIVEN: NewsfeedFindingCard renders with score={30}
  WHEN: The ScoreDots component renders
  THEN: Filled dots use danger/red color class (text-destructive)

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: scoreDotsRedForLowScores

AC-4: Empty dots remain neutral color
  GIVEN: NewsfeedFindingCard renders with score={40} (2 filled, 3 empty)
  WHEN: The ScoreDots component renders
  THEN: Empty dots (○) have text-muted-foreground color, unchanged from before

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: emptyDotsNeutralColor

AC-5: Score dots have accessibility label with tier description
  GIVEN: NewsfeedFindingCard renders with score={85}
  WHEN: Inspecting the score dots container accessibility properties
  THEN: accessibilityLabel reads 'Score: 85, high quality' (or 'medium quality' / 'low quality' based on tier)

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: scoreDotsHaveAccessibilityLabel

AC-6: Colors use theme tokens not hardcoded hex
  GIVEN: ScoreDots component code is inspected
  WHEN: Looking at how colors are applied
  THEN: Colors use NativeWind classes (text-success, text-warning, text-destructive) not hex values

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: colorsUseThemeTokens

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. components/whats-new/NewsfeedFindingCard.tsx
   - Lines: 31-39
   - Focus: ScoreDots component — add color tiers and a11y here

2. components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
   - Lines: ALL
   - Focus: Existing score dots test patterns

3. RULES.md
   - Lines: 633-691
   - Focus: Theme token structure for success/warning/danger colors

4. RULES.md
   - Lines: 757-764
   - Focus: Accessibility standards for labels

5. global.css
   - Lines: ALL
   - Focus: Verify text-success, text-warning, text-destructive tokens exist

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- components/whats-new/NewsfeedFindingCard.tsx (MODIFY)
- components/whats-new/__tests__/NewsfeedFindingCard.test.tsx (MODIFY)
- components/whats-new/NewsfeedFindingCard.stories.tsx (MODIFY)

WRITE-PROHIBITED:
- components/whats-new/NewsfeedHeader.tsx - Wrong component
- components/whats-new/NewsfeedFilterBar.tsx - Wrong component
- components/whats-new/NewsfeedHeroCard.tsx - Wrong component
- components/whats-new/categoryColors.ts - Do not modify (score colors are separate)
- Any new constants files - Use theme tokens

MUST:
- [ ] Use semantic theme tokens: text-success, text-warning, text-destructive
- [ ] Tier thresholds: high (>=80), medium (>=50), low (<50)
- [ ] Add accessibilityLabel to ScoreDots container with score + tier label
- [ ] Preserve existing testID='newsfeed-finding-card-score-dots'
- [ ] Empty dots always use text-muted-foreground

MUST NOT:
- [ ] Hardcode hex colors (#22C55E, #F59E0B, #EF4444, etc.)
- [ ] Change the dot count calculation logic
- [ ] Add animation to dots (that's a future enhancement)
- [ ] Create new color constant files

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

Color tier pattern:
```tsx
function getScoreTier(score: number | undefined): {
  colorClass: string;
  tierLabel: string;
} {
  if (score == null) return { colorClass: 'text-muted-foreground', tierLabel: 'not available' };
  if (score >= 80) return { colorClass: 'text-success', tierLabel: 'high quality' };
  if (score >= 50) return { colorClass: 'text-warning', tierLabel: 'medium quality' };
  return { colorClass: 'text-destructive', tierLabel: 'low quality' };
}

function ScoreDots({ score }: { score?: number }) {
  const filled = score != null ? Math.min(5, Math.max(0, Math.round((score / 10) * 5))) : 0;
  const { colorClass, tierLabel } = getScoreTier(score);
  const a11yLabel = score != null
    ? `Score: ${score}, ${tierLabel}`
    : 'Score not available';

  return (
    <View
      testID="newsfeed-finding-card-score-dots"
      accessibilityLabel={a11yLabel}
      className="flex-row items-center"
    >
      <Text className={`text-xs ${colorClass}`}>{'●'.repeat(filled)}</Text>
      <Text className="text-xs text-muted-foreground">{'○'.repeat(5 - filled)}</Text>
    </View>
  );
}
```

Anti-pattern:
```tsx
// ❌ DON'T: Hardcode hex colors
const colors = { high: '#22C55E', medium: '#F59E0B', low: '#EF4444' };

// ❌ DON'T: Apply color to container only — each dot group needs its own color
<Text style={{ color: tierColor }}>{dots}</Text>

// ❌ DON'T: Forget a11y — VoiceOver users need score context
// ❌ DON'T: Change the dot calculation (score / 10 * 5)
```

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** ScoreDots renders ●○ as plain text-muted-foreground — no color variation, no tier labels.
**Gap:** Users need quick visual quality assessment via colors and VoiceOver users need meaningful labels.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

AGENT: frontend-designer

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  READ: Current AC definition, existing tests, NewsfeedFindingCard.tsx lines 31-39
  WRITE: ONE test that exercises GIVEN-WHEN-THEN
  RUN: pnpm test -- NewsfeedFindingCard.test.tsx -t '{test_function}'
  VERIFY: Test FAILS (not errors - fails)
  RETURN: { phase: "RED", test_file, test_function, failure_output }

### GREEN PHASE (after orchestrator VERIFY_RED passes)
  READ: Failing test, AC definition, code patterns above
  WRITE: MINIMAL code to make test pass
  RUN: pnpm test -- NewsfeedFindingCard.test.tsx
  VERIFY: Test PASSES
  RETURN: { phase: "GREEN", files_changed, test_output }

### REFACTOR PHASE (after orchestrator VERIFY_GREEN passes)
  READ: Implementation — extract getScoreTier helper if inline
  WRITE: Improved code (if needed)
  RUN: pnpm test
  VERIFY: Tests still pass
  RETURN: { phase: "REFACTOR", files_changed, still_passing }

## AFTER ALL ACs COMPLETE:
  Add AllVariants story showing high/medium/low/missing score dots

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
**Rationale**: Visual color tiers and accessibility labels — pure presentation work.

**Review Agent**: react-native-ui-reviewer
**Rationale**: Validates theme token usage, color contrast, and accessibility compliance.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

Gate 1: All Tests Pass
  Command: pnpm test
  Expected: Exit 0

Gate 2: Each AC Has Test
  Verify: Test file contains one test per AC (6 tests)

Gate 3: RED Phase Evidence
  Required: TDD_STATE checkboxes show each test failed before implementation

Gate 4: Type Check
  Command: pnpm tsgo --noEmit
  Expected: Exit 0

Gate 5: Lint
  Command: pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error components/whats-new/NewsfeedFindingCard.tsx
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
- [ ] Theme tokens used (text-success, text-warning, text-destructive)
- [ ] No hardcoded hex colors
- [ ] getScoreTier helper is pure and testable
- [ ] accessibilityLabel is concise and informative

Domain-Specific:
- [ ] Color tiers match spec (>=80 high, >=50 medium, <50 low)
- [ ] Empty dots remain muted-foreground
- [ ] VoiceOver label format: "Score: {N}, {tier}"
- [ ] Colors readable in both light and dark modes

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

- Score dots change from single Text to View with two Text children (filled vs empty)
- Tier thresholds are 80/50/0 — aligned with PRD "high/medium/low" quality grading
- NativeWind tokens text-success, text-warning, text-destructive must exist in global.css — verify before implementation
- All 4 sprint-02 tasks are independent and can run in parallel

--------------------------------------------------------------------------------
TASK READINESS
--------------------------------------------------------------------------------

Prerequisites:
- [ ] Sprint 01 complete (NewsfeedFindingCard exists) (REQUIRED)
- [ ] Verify text-success, text-warning, text-destructive tokens exist in global.css (REQUIRED)

Can Execute In Parallel With: DESIGN-003, DESIGN-004, DESIGN-005

--------------------------------------------------------------------------------
APPROVAL
--------------------------------------------------------------------------------

Approved By: pending
Date: pending

================================================================================
