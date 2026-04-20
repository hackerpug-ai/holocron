================================================================================
TASK: FIX-001 - Fix Score Calculation Bug and Null Handling in NewsfeedFindingCard
================================================================================

TASK_TYPE: BUGFIX
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P0
EFFORT: S
TYPE: DEV
ITERATION: 1

Sprint: [Sprint 1: Intelligence Briefing Screen](./SPRINT.md)
Origin: Red-hat review 2026-04-19 — both reviewers flagged as CRITICAL

--------------------------------------------------------------------------------
GOAL (1 sentence)
--------------------------------------------------------------------------------

Fix the score dot calculation in ScoreDots from `score / 100 * 5` to `score / 10 * 5` per NEWSFEED-003 AC-2, and harden null handling so `score=null` doesn't produce NaN.

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

**Problem**: Both red-hat reviewers independently found that `NewsfeedFindingCard.tsx:32` uses `Math.round((score / 100) * 5)` but NEWSFEED-003 AC-2 specifies "score=70 (7/10 → 3.5 → rounds to 4 filled dots)" — the scale is 0-10, not 0-100. The test at `NewsfeedFindingCard.test.tsx:35` repeats the same wrong formula, making this a test-theatre bug where both impl and test agree on the wrong math.

**Why it matters**: If real scores are on a 0-100 scale, the current code accidentally works for 70 and 100 but is semantically wrong per the spec. If scores are on a 0-10 scale (as the spec implies with "7/10"), all dots would show 0 or 1. Either way the code doesn't match the contract.

**Current state**: Score=70 → (70/100)*5 = 3.5 → rounds to 4 dots. Appears correct but for the wrong reason.

**Desired state**: Score=70 → (70/10)*5 = 35 → but spec says max 5 dots, so the formula must normalize to 0-5 range. Per AC-2: `Math.round(score / 10 * 5)` which for score=70 gives `Math.round(35)` = 35 dots — this is ALSO wrong if score is 0-100. The spec likely means score is already 0-10 range, so `score / 10 * 5` gives correct 0-5 dots.

--------------------------------------------------------------------------------
CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

MUST:
- Change formula to `Math.round((score / 10) * 5)` per NEWSFEED-003 AC-2
- Fix the identical bug in the test file
- Handle `score=null` (use `score != null` instead of `score !== undefined`)
- Propagate the same fix to NewsfeedHeroCard if it also has ScoreDots

NEVER:
- Do not change the ScoreDots visual output for valid scores (5 dots max, 0 dots min)
- Do not change any other component behavior
- Do not remove the existing test structure

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

Objective: Fix the score-to-dots math to match the AC specification.
Success state: ScoreDots produces correct dot counts for scores 0, 10, 50, 70, 100 and gracefully handles undefined/null.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: Score dots formula matches spec
  GIVEN: ScoreDots component with score=70
  WHEN: The component calculates filled dots
  THEN: filled = Math.round((70 / 10) * 5) = 35 — which is > 5, so clamp to 5
        OR the score is meant to be 0-10 scale where score=7 gives 4 dots
        Verify against actual data source what score range is used

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: scoreDotsFormulaMatchesSpec

AC-2: Score=null handled gracefully (no NaN)
  GIVEN: score prop is explicitly null (not undefined)
  WHEN: ScoreDots calculates filled dots
  THEN: filled = 0 (no crash, no NaN)

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: scoreDotsHandlesNullGracefully

AC-3: Test file no longer has wrong formula
  GIVEN: NewsfeedFindingCard.test.tsx is read
  WHEN: Searching for score calculation
  THEN: No occurrence of `score / 100` remains in the test file

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: testFileHasCorrectFormula

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. components/whats-new/NewsfeedFindingCard.tsx
   - Lines: 31-38
   - Focus: ScoreDots function — the buggy line 32

2. components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
   - Lines: 31-46
   - Focus: AC-2 and AC-3 test blocks that repeat the wrong formula

3. components/whats-new/WhatsNewFindingCard.tsx
   - Lines: ALL
   - Focus: Check the actual score prop type and what range Convex returns — look for score field in WhatsNewFindingCardProps

4. convex/whatsNew/quality.ts (or convex/whatsNew/*.ts)
   - Lines: ALL
   - Focus: Understand what score range the backend actually produces (0-10? 0-100?)

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- components/whats-new/NewsfeedFindingCard.tsx (MODIFY — line 32 only)
- components/whats-new/__tests__/NewsfeedFindingCard.test.tsx (MODIFY — formula in tests)

WRITE-PROHIBITED:
- components/whats-new/NewsfeedHeader.tsx — no score logic here
- components/whats-new/NewsfeedFilterBar.tsx — no score logic here
- components/whats-new/categoryColors.ts — read-only token file
- components/whats-new/NewsfeedHeroCard.tsx — check for duplicate ScoreDots; if present, also fix

MUST:
- [ ] Verify actual score range from Convex backend before choosing formula
- [ ] Use `score != null` to handle both null and undefined
- [ ] Clamp filled dots to 0-5 range (Math.min(5, Math.max(0, filled)))

MUST NOT:
- [ ] Change the visual appearance of correctly-scored dots
- [ ] Remove existing test structure
- [ ] Import new dependencies

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

Correct pattern:
```tsx
function ScoreDots({ score }: { score?: number }) {
  const filled = score != null
    ? Math.min(5, Math.max(0, Math.round((score / 10) * 5)))
    : 0;
  return (
    <Text className="text-xs text-muted-foreground" testID="newsfeed-finding-card-score-dots">
      {'●'.repeat(filled)}{'○'.repeat(5 - filled)}
    </Text>
  );
}
```

Anti-pattern (DO NOT):
```tsx
// WRONG — the current buggy formula
const filled = score !== undefined ? Math.round((score / 100) * 5) : 0;

// WRONG — doesn't handle null (only undefined)
const filled = score !== undefined ? ... : 0;

// WRONG — no clamping, could produce > 5 or < 0 dots
const filled = Math.round((score / 10) * 5);
```

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

AGENT: frontend-designer (or react-native-ui-implementer)

BEFORE ANY CODE CHANGES:
1. Search Convex backend files to determine actual score range
2. Report findings — if score is 0-100, the fix is `score / 100 * 5` (current code is actually correct but test note is wrong)
3. If score is 0-10, fix to `score / 10 * 5` per spec

FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  WRITE: ONE failing test for the current AC
  RUN: pnpm test -- NewsfeedFindingCard
  VERIFY: Test FAILS
  RETURN: { phase: "RED", test_file, failure_output }

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
**Rationale**: Pure TypeScript math fix in existing component — minimal scope, no state management.

**Review Agent**: react-native-ui-reviewer
**Rationale**: Confirms formula matches spec, null handling is correct, and no regression in visual output.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

Gate 1: All Tests Pass
  Command: pnpm test
  Expected: Exit 0

Gate 2: Type Check
  Command: pnpm tsgo --noEmit
  Expected: Exit 0

Gate 3: Lint
  Command: pnpm biome check .
  Expected: Exit 0

Gate 4: Scope Compliance
  Command: git diff --name-only
  Expected: Only NewsfeedFindingCard.tsx and NewsfeedFindingCard.test.tsx (+ NewsfeedHeroCard if duplicate ScoreDots found)

--------------------------------------------------------------------------------
REVIEW CRITERIA
--------------------------------------------------------------------------------

Bug Fix Quality:
- [ ] Score formula matches NEWSFEED-003 AC-2 specification
- [ ] `score != null` handles both null and undefined
- [ ] Result clamped to 0-5 range
- [ ] Test formula matches implementation formula
- [ ] No `score / 100` anywhere in component or test files

Code Quality:
- [ ] No other component behavior changed
- [ ] No new dependencies introduced

Review Verdict: [ ] APPROVED   [ ] NEEDS_FIXES

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends On:
- NEWSFEED-003 — NewsfeedFindingCard must exist (completed)

Blocks:
- NEWSFEED-005 — Screen assembly needs correct score rendering

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

- CRITICAL: Before fixing, verify the actual score range from the Convex backend. The spec says "7/10" implying 0-10 scale, but the backend might produce 0-100. The formula must match reality, not just the spec example.
- If score is 0-100 range: keep `score / 100 * 5` but update the AC description and test comment to stop saying "7/10"
- If score is 0-10 range: fix to `score / 10 * 5` and add clamping for safety
- Also check NewsfeedHeroCard.tsx — if it duplicates ScoreDots, fix there too.

================================================================================
