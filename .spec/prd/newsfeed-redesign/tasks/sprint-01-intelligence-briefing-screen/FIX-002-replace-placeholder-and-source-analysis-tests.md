================================================================================
TASK: FIX-002 - Replace Placeholder Tests and Upgrade Source-Analysis Tests
================================================================================

TASK_TYPE: BUGFIX
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P1
EFFORT: M
TYPE: DEV
ITERATION: 1

Sprint: [Sprint 1: Intelligence Briefing Screen](./SPRINT.md)
Origin: Red-hat review 2026-04-19 — both reviewers flagged

--------------------------------------------------------------------------------
GOAL (1 sentence)
--------------------------------------------------------------------------------

Replace two `expect(true).toBe(true)` placeholder tests in NewsfeedFindingCard and upgrade the source-analysis test suites (NewsfeedHeader, NewsfeedHeroCard, NewsfeedFindingCard) to use the real-rendering pattern proven by NewsfeedFilterBar.

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

**Problem**: The red-hat review found:
1. Two placeholder tests in `NewsfeedFindingCard.test.tsx` (AC-4 onPress and AC-6 hairline separator) that always pass via `expect(true).toBe(true)`
2. Three test suites use `readFileSync` source-code string analysis instead of rendering components with `@testing-library/react-native`
3. `NewsfeedFilterBar.test.tsx` proves real rendering works fine with vitest — the "infrastructure limitation" claim is contradicted by working evidence

**Why it matters**: Source-analysis tests verify code *structure*, not *behavior*. A component could have correct class names and testIDs but crash at runtime, and these tests would still pass. Placeholder tests that always pass are test theatre — they provide false confidence.

**Current state**:
- `NewsfeedFilterBar.test.tsx` — uses `render()` + `screen.getByTestId()` from `@testing-library/react-native` — WORKS
- `NewsfeedHeader.test.tsx` — uses `readFileSync` string matching — DOES NOT verify behavior
- `NewsfeedHeroCard.test.tsx` — uses `readFileSync` string matching — DOES NOT verify behavior
- `NewsfeedFindingCard.test.tsx` — uses `readFileSync` + 2 placeholder `expect(true)` — WEAKEST

**Desired state**: All four test suites use the `render()` + `screen` pattern from NewsfeedFilterBar.

--------------------------------------------------------------------------------
CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

MUST:
- Follow the exact pattern from `NewsfeedFilterBar.test.tsx` (render, screen.getByTestId, fireEvent/props.onPress)
- Replace ALL `expect(true).toBe(true)` placeholders with real assertions
- Remove `readFileSync` and source-analysis approach from all three test files
- Each AC test must verify observable behavior (rendered text, style props, callback invocation), not source code strings

NEVER:
- Do not modify any component implementation files (.tsx) — only test files (.test.tsx)
- Do not add new test cases beyond what the ACs already define
- Do not import from `node:fs` in test files
- Do not use `readFileSync` anywhere in the rewritten tests

STRICTLY:
- Follow the `NewsfeedFilterBar.test.tsx` pattern exactly: `render(<Component {...props} />)` then `screen.getByTestId()`

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

Objective: All four newsfeed component test suites use real rendering via `@testing-library/react-native`.
Success state: `pnpm test` passes with 0 placeholder tests and 0 readFileSync calls in newsfeed test files.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: NewsfeedFindingCard AC-4 (onPress) uses real test
  GIVEN: NewsfeedFindingCard.test.tsx is rewritten
  WHEN: The AC-4 test block runs
  THEN: It renders NewsfeedFindingCard, fires onPress via Pressable props, and asserts the callback was called — no `expect(true).toBe(true)`

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: onPressFiresWhenTapped

AC-2: NewsfeedFindingCard AC-6 (hairline separator) uses real test
  GIVEN: NewsfeedFindingCard.test.tsx is rewritten
  WHEN: The AC-6 test block runs
  THEN: It renders NewsfeedFindingCard and asserts `borderBottomWidth` style value on root View — no `expect(true).toBe(true)`

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
  TEST_FUNCTION: hairlineSeparatorPresent

AC-3: NewsfeedHeader tests use real rendering
  GIVEN: NewsfeedHeader.test.tsx is rewritten
  WHEN: The test suite runs
  THEN: All 5 ACs use `render(<NewsfeedHeader report={...} />)` and `screen.getByTestId()` — no `readFileSync` calls

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedHeader.test.tsx
  TEST_FUNCTION: (all tests rewritten)

AC-4: NewsfeedHeroCard tests use real rendering
  GIVEN: NewsfeedHeroCard.test.tsx is rewritten
  WHEN: The test suite runs
  THEN: All ACs use `render(<NewsfeedHeroCard {...props} />)` and `screen.getByTestId()` — no `readFileSync` calls

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedHeroCard.test.tsx
  TEST_FUNCTION: (all tests rewritten)

AC-5: No readFileSync or expect(true) in any newsfeed test file
  GIVEN: All four test files have been rewritten
  WHEN: Running `grep -r "readFileSync\|expect(true)" components/whats-new/__tests__/`
  THEN: Zero matches

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: Verified via bash grep
  TEST_FUNCTION: grep verification

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. components/whats-new/__tests__/NewsfeedFilterBar.test.tsx
   - Lines: ALL
   - Focus: This is the GOLD STANDARD pattern to follow — render(), screen.getByTestId(), vi.fn(), props.onPress()

2. components/whats-new/__tests__/NewsfeedFindingCard.test.tsx
   - Lines: ALL
   - Focus: Current source-analysis + placeholder tests to replace

3. components/whats-new/__tests__/NewsfeedHeader.test.tsx
   - Lines: ALL
   - Focus: Current source-analysis tests to replace

4. components/whats-new/__tests__/NewsfeedHeroCard.test.tsx
   - Lines: ALL
   - Focus: Current source-analysis tests to replace

5. components/whats-new/NewsfeedFindingCard.tsx
   - Lines: ALL
   - Focus: Understand component props for constructing render fixtures

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- components/whats-new/__tests__/NewsfeedFindingCard.test.tsx (MODIFY — full rewrite)
- components/whats-new/__tests__/NewsfeedHeader.test.tsx (MODIFY — full rewrite)
- components/whats-new/__tests__/NewsfeedHeroCard.test.tsx (MODIFY — full rewrite)

WRITE-PROHIBITED:
- components/whats-new/NewsfeedFindingCard.tsx — no component changes
- components/whats-new/NewsfeedHeader.tsx — no component changes
- components/whats-new/NewsfeedHeroCard.tsx — no component changes
- components/whats-new/NewsfeedFilterBar.tsx — already uses correct pattern
- components/whats-new/__tests__/NewsfeedFilterBar.test.tsx — already correct, do not modify
- components/whats-new/__tests__/categoryColors.test.ts — pure unit test, no rendering needed
- components/whats-new/categoryColors.ts — no changes

MUST:
- [ ] Use `render()` and `screen` from `@testing-library/react-native`
- [ ] Use `vi.fn()` from vitest for callback assertions
- [ ] Construct realistic fixture data for each component's props
- [ ] Keep the same describe/it structure (AC-1 through AC-6) for traceability

MUST NOT:
- [ ] Import from `node:fs`
- [ ] Use `readFileSync` anywhere
- [ ] Use `expect(true).toBe(true)` or `expect(true)` patterns
- [ ] Modify any component implementation files

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

Correct pattern (from NewsfeedFilterBar.test.tsx):
```tsx
import { render, screen } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';
import { NewsfeedHeader } from '../NewsfeedHeader';

describe('NewsfeedHeader', () => {
  it('nullReportRendersWithoutCrash', () => {
    render(<NewsfeedHeader report={null} />);
    expect(screen.getByTestId('newsfeed-header')).toBeTruthy();
  });

  it('dateFormattedCorrectly', () => {
    const report = { createdAt: 1745078400000, findingsCount: 12 };
    render(<NewsfeedHeader report={report} />);
    const dateEl = screen.getByTestId('newsfeed-header-date');
    expect(dateEl.props.children).toMatch(/SAT, APR \d+/i);
  });

  it('freshnessDotGreenWhenRecent', () => {
    const report = { createdAt: Date.now() - 7200000, findingsCount: 5 };
    render(<NewsfeedHeader report={report} />);
    const dot = screen.getByTestId('newsfeed-header-freshness-dot');
    expect(dot.props.style).toMatchObject(
      expect.arrayContaining([
        expect.objectContaining({ backgroundColor: '#22C55E' })
      ])
    );
  });
});
```

Anti-pattern (DO NOT):
```tsx
// WRONG — source string analysis
const source = readFileSync(componentPath, 'utf-8');
expect(source).toContain('function formatDate');

// WRONG — placeholder that always passes
expect(true).toBe(true); // Placeholder

// WRONG — importing node:fs in test
import { readFileSync } from 'node:fs';
```

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Why the source-analysis pattern was used**: The original agent claimed "vitest configuration limitations with React Native components." This claim is contradicted by `NewsfeedFilterBar.test.tsx` which successfully uses `render()` and `screen.getByTestId()`. The real issue was likely agent rationalization under time pressure, not an actual infrastructure limitation.

**Why this matters for the sprint gate**: The sprint gate requires human testing of all components. If tests only verify source code strings, they provide no regression safety for behavior changes during NEWSFEED-005 (screen assembly) and NEWSFEED-006 (route swap).

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

AGENT: react-native-ui-implementer

FOR EACH TEST FILE (FindingCard, Header, HeroCard — in order):

### RED PHASE
  WRITE: New test file using render() + screen pattern (replacing old file)
  RUN: pnpm test -- {ComponentName}
  VERIFY: Tests should PASS if component already works correctly (this is a rewrite, not new functionality)
  NOTE: Since we're upgrading existing passing tests, RED may not apply — focus on ensuring the new tests actually render and assert on real output

### GREEN PHASE
  VERIFY: All tests pass with real rendering
  RUN: pnpm test
  EXPECT: Exit 0

### REFACTOR PHASE
  RUN: pnpm test
  VERIFY: All tests still pass

--------------------------------------------------------------------------------
ORCHESTRATOR VERIFICATION PROTOCOL
--------------------------------------------------------------------------------

AFTER ALL THREE FILES REWRITTEN:
  RUN: pnpm test
  EXPECT: Exit 0, all newsfeed suites pass

AFTER REFACTOR:
  RUN: pnpm test && pnpm tsgo --noEmit && pnpm biome check .
  EXPECT: All exit 0

GREP VERIFICATION:
  RUN: grep -r "readFileSync\|expect(true)" components/whats-new/__tests__/
  EXPECT: Zero matches (no output)

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: react-native-ui-implementer
**Rationale**: Test infrastructure work using @testing-library/react-native is core react-native-ui-implementer scope. The NewsfeedFilterBar test proves the pattern works.

**Review Agent**: react-native-ui-reviewer
**Rationale**: Confirms all tests use real rendering, no placeholders remain, and test coverage is equivalent to the original source-analysis tests.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

Gate 1: All Tests Pass
  Command: pnpm test
  Expected: Exit 0

Gate 2: No Placeholders
  Command: grep -r "expect(true)" components/whats-new/__tests__/
  Expected: Exit 1 (no matches)

Gate 3: No Source Analysis
  Command: grep -r "readFileSync" components/whats-new/__tests__/
  Expected: Exit 1 (no matches)

Gate 4: Type Check
  Command: pnpm tsgo --noEmit
  Expected: Exit 0

Gate 5: Lint
  Command: pnpm biome check .
  Expected: Exit 0

Gate 6: Scope Compliance
  Command: git diff --name-only
  Expected: Only the 3 test files (*.test.tsx)

--------------------------------------------------------------------------------
REVIEW CRITERIA
--------------------------------------------------------------------------------

Test Quality:
- [ ] Zero `expect(true).toBe(true)` in any test file
- [ ] Zero `readFileSync` in any test file
- [ ] All tests use `render()` from `@testing-library/react-native`
- [ ] All tests assert on rendered output (text, props, style), not source code
- [ ] Callback tests use `vi.fn()` and assert call count and arguments
- [ ] Fixture data is realistic (no lorem ipsum, no placeholder values)

Code Quality:
- [ ] Same describe/it structure preserved for AC traceability
- [ ] No component implementation files modified
- [ ] Imports from `@testing-library/react-native`, not `node:fs`

Review Verdict: [ ] APPROVED   [ ] NEEDS_FIXES

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends On:
- NEWSFEED-001 — NewsfeedHeader component must exist (completed)
- NEWSFEED-003 — NewsfeedFindingCard component must exist (completed)
- NEWSFEED-004 — NewsfeedHeroCard component must exist (completed)
- FIX-001 — Score calculation fix must be applied first (so tests match correct formula)

Blocks:
- NEWSFEED-005 — Screen assembly benefits from reliable component tests

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

- Start with NewsfeedFindingCard.test.tsx — it has the most issues (placeholders + source analysis)
- Then NewsfeedHeader.test.tsx and NewsfeedHeroCard.test.tsx
- The NewsfeedFilterBar.test.tsx is already correct — use it as the reference pattern
- For components that accept `report: null`, verify the null guard renders without crash
- For onPress tests, use Pressable's `props.onPress()` directly (same pattern as FilterBar)
- Some tests may need to mock `Date.now()` for deterministic freshness-dot color assertions

================================================================================
