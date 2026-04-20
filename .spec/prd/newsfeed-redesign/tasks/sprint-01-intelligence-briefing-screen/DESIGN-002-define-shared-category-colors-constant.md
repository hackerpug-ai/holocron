================================================================================
TASK: DESIGN-002 - Define Shared CATEGORY_COLORS Constant and CategoryKey Type
================================================================================

TASK_TYPE: INFRA
STATUS: ✅ Completed
TDD_PHASE: REFACTOR
CURRENT_AC: AC-4
PRIORITY: P0
EFFORT: S
TYPE: DEV
ITERATION: 1
> Completed: 2026-04-19T11:06:29Z
> Commit: 204c6feec5330bb048eb590bc6de87821d412c1b
> Reviewer: react-native-ui-reviewer

Sprint: [Sprint 1: Intelligence Briefing Screen](./SPRINT.md)

--------------------------------------------------------------------------------
GOAL (1 sentence)
--------------------------------------------------------------------------------

Create the single source of truth for category accent colors so every component in the newsfeed uses identical hex values and TypeScript narrows the allowed keys.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- components/whats-new/categoryColors.ts (NEW): Exports CATEGORY_COLORS const object and CategoryKey type derived from its keys.
- components/whats-new/__tests__/categoryColors.test.ts (NEW): Unit tests confirming hex values, const assertion, type narrowing, and exact key count.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [x] components/whats-new/categoryColors.ts exists and exports CATEGORY_COLORS and CategoryKey ← PASS: File exists at components/whats-new/categoryColors.ts:1
- [x] CATEGORY_COLORS contains exactly four keys: discovery, release, trend, discussion with the hex values from PRD S3a ← PASS: Hex strings '#F59E0B', '#10B981', '#3B82F6', '#6B7280' confirmed (evidence: categoryColors.ts:11-14)
- [x] CategoryKey is `keyof typeof CATEGORY_COLORS` — not a separately maintained string union ← PASS: Uses keyof typeof pattern (evidence: categoryColors.ts:30)
- [x] `pnpm tsgo --noEmit` exits 0 ← PASS: Typecheck passes (evidence: tsc exit code 0)
- [x] `pnpm biome check .` exits 0 with no suppressions ← PASS: Lint passes on clean baseline
- [x] `pnpm test` exits 0 with categoryColors suite passing ← PASS: 10/10 tests passing (evidence: categoryColors.test.ts created)
- [x] Only WRITE-ALLOWED files modified (git diff --name-only) ← PASS: Only categoryColors.ts and test file created

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Any React component or JSX — this file is pure TypeScript constants only
- CSS variables or NativeWind classes — hex values only as specified in PRD S3a
- Icon mapping or label mapping — those belong in each consuming component
- Modifications to existing WhatsNewFindingCard or any other existing file

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

Each AC is a RED → GREEN → REFACTOR micro-cycle.

AC-1: Correct hex values
  GIVEN: A developer imports CATEGORY_COLORS from components/whats-new/categoryColors.ts
  WHEN: They access CATEGORY_COLORS.discovery, .release, .trend, .discussion
  THEN: Values are '#F59E0B', '#10B981', '#3B82F6', '#6B7280' respectively

  TDD_STATE: [x] RED  [x] VERIFY_RED  [x] GREEN  [x] VERIFY_GREEN  [x] REFACTOR
  TEST_FILE: components/whats-new/__tests__/categoryColors.test.ts
  TEST_FUNCTION: correctHexValues

AC-2: Object is const-asserted — TypeScript literal types
  GIVEN: TypeScript compiles the module
  WHEN: Code attempts to assign a new value to CATEGORY_COLORS.discovery
  THEN: TypeScript emits a type error (cannot assign to read-only property)

  TDD_STATE: [x] RED  [x] VERIFY_RED  [x] GREEN  [x] VERIFY_GREEN  [x] REFACTOR
  TEST_FILE: components/whats-new/__tests__/categoryColors.test.ts
  TEST_FUNCTION: isReadonly — verified by pnpm tsgo --noEmit

AC-3: CategoryKey narrows correctly
  GIVEN: A function accepts a parameter typed CategoryKey
  WHEN: String literals 'discovery' | 'release' | 'trend' | 'discussion' are passed
  THEN: TypeScript accepts all four and rejects any other string (e.g. 'breaking')

  TDD_STATE: [x] RED  [x] VERIFY_RED  [x] GREEN  [x] VERIFY_GREEN  [x] REFACTOR
  TEST_FILE: components/whats-new/__tests__/categoryColors.test.ts
  TEST_FUNCTION: categoryKeyType

AC-4: Exactly four keys — no extras
  GIVEN: Object.keys is called on CATEGORY_COLORS at runtime
  WHEN: The result is inspected
  THEN: Length is exactly 4 and set equals {discovery, release, trend, discussion}

  TDD_STATE: [x] RED  [x] VERIFY_RED  [x] GREEN  [x] VERIFY_GREEN  [x] REFACTOR
  TEST_FILE: components/whats-new/__tests__/categoryColors.test.ts
  TEST_FUNCTION: exactlyFourKeys

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. components/whats-new/WhatsNewFindingCard.tsx
   - Lines: 47-72
   - Focus: Existing CATEGORY_CONFIG shape — understand what we are replacing; do NOT copy its structure, only reuse the hex color values

2. components/CLAUDE.md
   - Lines: ALL
   - Focus: Project component conventions and import rules

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- components/whats-new/categoryColors.ts (NEW)
- components/whats-new/__tests__/categoryColors.test.ts (NEW)

WRITE-PROHIBITED:
- components/whats-new/WhatsNewFindingCard.tsx — do not modify existing card in this task
- components/whats-new/index.ts — barrel export update is a separate concern
- Any file outside components/whats-new/ — token file is scoped to this feature directory

MUST:
- [ ] Use `as const` assertion on the CATEGORY_COLORS object
- [ ] Derive CategoryKey as `keyof typeof CATEGORY_COLORS` (not a separate string union)
- [ ] Match hex values exactly: discovery=#F59E0B, release=#10B981, trend=#3B82F6, discussion=#6B7280

MUST NOT:
- [ ] Write any JSX or React components
- [ ] Import from react-native or NativeWind
- [ ] Redefine hex values differently from PRD S3a

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

Correct pattern:
```ts
export const CATEGORY_COLORS = {
  discovery: '#F59E0B',
  release:   '#10B981',
  trend:     '#3B82F6',
  discussion: '#6B7280',
} as const

export type CategoryKey = keyof typeof CATEGORY_COLORS
```

Anti-pattern (DO NOT):
```ts
// WRONG — separate string union duplicates the source of truth and drifts
export type CategoryKey = 'discovery' | 'release' | 'trend' | 'discussion'

// WRONG — object without `as const` allows mutation and loses literal types
export const CATEGORY_COLORS = { discovery: '#F59E0B', ... }
```

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** Color intent for categories is currently embedded inline inside WhatsNewFindingCard.tsx as a CATEGORY_CONFIG object that bundles pillClass, textClass, and Icon together. There is no standalone hex constant exportable by multiple components.

**Gap:** NewsfeedFindingCard, NewsfeedHeroCard, and NewsfeedFilterBar all need the same four hex accent colors. Without a shared constant each component would hardcode its own values, creating a drift risk.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

AGENT: frontend-designer

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  WRITE: ONE test that imports from categoryColors.ts (file doesn't exist yet — test will error/fail)
  RUN: pnpm test -- categoryColors
  VERIFY: Test FAILS (import error counts as failure)
  RETURN: { phase: "RED", test_file, failure_output }

### GREEN PHASE
  WRITE: categoryColors.ts with CATEGORY_COLORS and CategoryKey
  RUN: pnpm test -- categoryColors
  VERIFY: Tests PASS
  RETURN: { phase: "GREEN", files_changed, test_output }

### REFACTOR PHASE
  VERIFY: Tests still pass after any cleanup
  RETURN: { phase: "REFACTOR", still_passing: true }

--------------------------------------------------------------------------------
ORCHESTRATOR VERIFICATION PROTOCOL
--------------------------------------------------------------------------------

AFTER RED PHASE:
  RUN: pnpm test -- categoryColors
  EXPECT: Exit code != 0 (import error or assertion failure)

AFTER GREEN PHASE:
  RUN: pnpm test
  EXPECT: Exit code 0, all tests pass

AFTER REFACTOR PHASE:
  RUN: pnpm test && pnpm tsgo --noEmit && pnpm biome check .
  EXPECT: All exit 0

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: frontend-designer
**Rationale**: Token file requires only TypeScript authoring and design-system awareness — no state, no network, no native APIs.

**Review Agent**: react-native-ui-reviewer
**Rationale**: Reviewer confirms hex values match the Signal Intelligence aesthetic direction and that the type export is idiomatic for the project's TypeScript conventions.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

Gate 1: All Tests Pass
  Command: pnpm test
  Expected: Exit 0, categoryColors suite passes

Gate 2: Type Check
  Command: pnpm tsgo --noEmit
  Expected: Exit 0

Gate 3: Lint
  Command: pnpm biome check .
  Expected: Exit 0

Gate 4: Scope Compliance
  Command: git diff --name-only
  Expected: Only components/whats-new/categoryColors.ts and __tests__/categoryColors.test.ts

--------------------------------------------------------------------------------
REVIEW CRITERIA
--------------------------------------------------------------------------------

TDD Quality:
- [ ] Test exists before implementation (RED evidence in TDD_STATE)
- [ ] Tests verify the hex values and type behavior, not implementation details

Code Quality:
- [ ] `as const` present on CATEGORY_COLORS
- [ ] CategoryKey derives from CATEGORY_COLORS (not independently defined)
- [ ] No JSX, React, or NativeWind imports
- [ ] Hex values match PRD S3a exactly

Review Verdict: [ ] APPROVED   [ ] NEEDS_FIXES

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends On: (none)

Blocks:
- NEWSFEED-001 — NewsfeedHeader needs accent colors for freshness dot styling reference
- NEWSFEED-002 — NewsfeedFilterBar imports CategoryKey
- NEWSFEED-003 — NewsfeedFindingCard imports CATEGORY_COLORS for left border
- NEWSFEED-004 — NewsfeedHeroCard imports CATEGORY_COLORS for left border

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

- File lives in components/whats-new/ (not components/ui/) — feature-scoped, not a cross-app design token.
- The existing WhatsNewFindingCard CATEGORY_CONFIG is intentionally NOT modified in this task.
- Hex values must match S3a verbatim: amber #F59E0B, emerald #10B981, blue #3B82F6, slate #6B7280.

================================================================================
