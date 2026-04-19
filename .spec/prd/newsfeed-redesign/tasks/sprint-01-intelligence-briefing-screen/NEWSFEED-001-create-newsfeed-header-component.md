================================================================================
TASK: NEWSFEED-001 - Create NewsfeedHeader Component
================================================================================

TASK_TYPE: FEATURE
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P0
EFFORT: S
TYPE: DEV
ITERATION: 1

Sprint: [Sprint 1: Intelligence Briefing Screen](./SPRINT.md)

--------------------------------------------------------------------------------
GOAL (1 sentence)
--------------------------------------------------------------------------------

Build the editorial date-and-stats header that gives the Intelligence Briefing its authoritative, data-forward first impression — displaying the report date, a color-coded freshness dot, finding count, source count, and relative generation time.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- components/whats-new/NewsfeedHeader.tsx (NEW): React.memo named export; accepts nullable report prop; renders date label, freshness dot, and stats line.
- components/whats-new/__tests__/NewsfeedHeader.test.tsx (NEW): Vitest + @testing-library/react-native tests covering null state, freshness colors, date format, and stat text.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] components/whats-new/NewsfeedHeader.tsx exists as a named export wrapped in React.memo
- [ ] When report is null, component renders without crashing; testID='newsfeed-header' present
- [ ] Date label renders in 'SAT, APR 19' format derived from report.createdAt (Unix ms)
- [ ] Freshness dot is green when report age < 6 h, amber when < 24 h, red when >= 24 h
- [ ] Stats line shows '{findingsCount} findings · {sourceCount} sources · Generated {relativeTime}'
- [ ] sourceCount derived from summaryJson?.sources?.length ?? 0
- [ ] Text uses `import { Text } from '@/components/ui/text'` — no bare React Native Text
- [ ] testID='newsfeed-header' on root View; 'newsfeed-header-freshness-dot', 'newsfeed-header-date', 'newsfeed-header-stats' on key elements
- [ ] `pnpm tsgo --noEmit` exits 0
- [ ] `pnpm biome check .` exits 0
- [ ] `pnpm test` exits 0 with NewsfeedHeader suite passing (5 tests)
- [ ] Only WRITE-ALLOWED files modified (git diff --name-only)

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Fetching or subscribing to report data — props only
- Refresh / pull-to-refresh affordance — belongs to screen assembly task
- Navigation or routing
- Any modification to existing components

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: Null report renders without crash
  GIVEN: report prop is null
  WHEN: NewsfeedHeader renders
  THEN: Component mounts without throwing; root testID='newsfeed-header' is present in the tree

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedHeader.test.tsx
  TEST_FUNCTION: nullReportRendersWithoutCrash

AC-2: Date formatted correctly
  GIVEN: report.createdAt = 1745078400000 (a Saturday in April 2026)
  WHEN: NewsfeedHeader renders
  THEN: Element with testID='newsfeed-header-date' has text matching /SAT, APR \d+/i

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedHeader.test.tsx
  TEST_FUNCTION: dateFormattedCorrectly

AC-3: Freshness dot is green for recent report
  GIVEN: report.createdAt is Date.now() - 2 hours
  WHEN: NewsfeedHeader renders
  THEN: The freshness dot element has style or className mapping to green (e.g. '#22C55E')

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedHeader.test.tsx
  TEST_FUNCTION: freshnessDotGreenWhenRecent

AC-4: Freshness dot is amber for report aged 8 h
  GIVEN: report.createdAt is Date.now() - 8 hours
  WHEN: NewsfeedHeader renders
  THEN: The freshness dot uses amber color token (#F59E0B)

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedHeader.test.tsx
  TEST_FUNCTION: freshnessDotAmberWhenAged

AC-5: Stats line shows correct counts
  GIVEN: report = { createdAt: Date.now() - 60000, findingsCount: 12, summaryJson: { sources: [{}, {}, {}] } }
  WHEN: NewsfeedHeader renders
  THEN: Element testID='newsfeed-header-stats' contains text '12 findings' and '3 sources'

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedHeader.test.tsx
  TEST_FUNCTION: statsLineShowsCorrectCounts

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. components/whats-new/WhatsNewFindingCard.tsx
   - Lines: 1-45
   - Focus: Import style conventions (Text from ui/text, icon imports), formatRelativeTime pattern to replicate for report timestamps

2. components/CLAUDE.md
   - Lines: ALL
   - Focus: NativeWind className-first styling rules, Text import requirement

3. components/subscriptions/SubscriptionFeedScreen.tsx
   - Lines: 46-57
   - Focus: formatRelativeTime helper for Unix ms timestamp (report.createdAt is ms not ISO string)

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- components/whats-new/NewsfeedHeader.tsx (NEW)
- components/whats-new/__tests__/NewsfeedHeader.test.tsx (NEW)

WRITE-PROHIBITED:
- components/whats-new/WhatsNewFindingCard.tsx — do not touch existing card
- components/whats-new/index.ts — barrel exports updated in assembly task
- app/(drawer)/whats-new/index.tsx — screen wiring is out of scope
- components/ui/* — do not modify shared UI primitives

MUST:
- [ ] Use `React.memo` wrapping on the component function
- [ ] Named export only (not default export)
- [ ] Text from '@/components/ui/text' — never from 'react-native'
- [ ] testID on all key elements: root, freshness-dot, date, stats

MUST NOT:
- [ ] Hardcode colors as hex in className — use NativeWind tokens where possible; use inline style for dynamic freshness color only
- [ ] Fetch data or use useQuery — props only
- [ ] Use Paper Text component (react-native-paper)

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

```tsx
import React from 'react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'

const FRESHNESS_COLORS = {
  fresh:  '#22C55E', // < 6 h
  aging:  '#F59E0B', // < 24 h
  stale:  '#EF4444', // >= 24 h
} as const

function freshnessColor(createdAt: number): string {
  const ageHours = (Date.now() - createdAt) / 3_600_000
  if (ageHours < 6) return FRESHNESS_COLORS.fresh
  if (ageHours < 24) return FRESHNESS_COLORS.aging
  return FRESHNESS_COLORS.stale
}

interface NewsfeedHeaderProps {
  report: { createdAt: number; findingsCount: number; summaryJson?: { sources?: unknown[] } } | null
}

function NewsfeedHeaderComponent({ report }: NewsfeedHeaderProps) {
  if (!report) return <View testID="newsfeed-header" />
  const sourceCount = (report.summaryJson as { sources?: unknown[] } | undefined)?.sources?.length ?? 0
  // format date, stats line, etc.
}

export const NewsfeedHeader = React.memo(NewsfeedHeaderComponent)
```

Anti-pattern (DO NOT):
```tsx
// WRONG — default export
export default function NewsfeedHeader() {}

// WRONG — bare React Native Text
import { Text } from 'react-native'

// WRONG — hardcoded freshness color in className (must be dynamic inline style)
<View className="w-2 h-2 rounded-full bg-green-500" />
```

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** The What's New screen renders SubscriptionFeedScreen with a generic ScreenLayout title. No editorial header surfaces report metadata — date, freshness, or finding/source counts are invisible to the user.

**Gap:** Sprint 1 gate requires a visible date/freshness header as the first element of the Intelligence Briefing layout. NewsfeedHeader is the standalone component that supplies this missing information layer.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

AGENT: frontend-designer

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  READ: Current AC definition
  WRITE: ONE failing test in NewsfeedHeader.test.tsx
  RUN: pnpm test -- NewsfeedHeader
  VERIFY: Test FAILS (component doesn't exist yet — import error counts)
  RETURN: { phase: "RED", test_file, failure_output }
  MUST NOT: Write any implementation code yet

### GREEN PHASE
  WRITE: Minimal NewsfeedHeader.tsx to pass the current AC test
  RUN: pnpm test -- NewsfeedHeader
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
  RUN: pnpm test -- NewsfeedHeader
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
**Rationale**: Pure presentational layout with date formatting logic — no state management, no data fetching.

**Review Agent**: react-native-ui-reviewer
**Rationale**: Reviewer checks NativeWind class correctness, accessibility labels on the freshness dot, and that the Signal Intelligence aesthetic is preserved.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

Gate 1: All Tests Pass
  Command: pnpm test
  Expected: Exit 0, NewsfeedHeader suite passes (5 tests)

Gate 2: Type Check
  Command: pnpm tsgo --noEmit
  Expected: Exit 0

Gate 3: Lint
  Command: pnpm biome check .
  Expected: Exit 0

Gate 4: Scope Compliance
  Command: git diff --name-only
  Expected: Only NewsfeedHeader.tsx and __tests__/NewsfeedHeader.test.tsx

--------------------------------------------------------------------------------
REVIEW CRITERIA
--------------------------------------------------------------------------------

TDD Quality:
- [ ] One test per acceptance criterion
- [ ] RED evidence in TDD_STATE checkboxes
- [ ] Tests verify behavior not implementation

Code Quality:
- [ ] React.memo wrapping present
- [ ] Named export only
- [ ] Text from '@/components/ui/text'
- [ ] Freshness dot color is dynamic inline style (not hardcoded className)
- [ ] summaryJson accessed with optional chaining through `unknown`
- [ ] report.createdAt treated as Unix ms (not ISO string)

Review Verdict: [ ] APPROVED   [ ] NEEDS_FIXES

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends On:
- DESIGN-002 — categoryColors.ts must exist (confirms file convention; no direct import needed)

Blocks:
- NEWSFEED-005 — NewsfeedScreen imports and renders NewsfeedHeader
- DESIGN-001 — Storybook story requires the component to exist

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

- report.createdAt is a Unix millisecond timestamp (number), not an ISO string — use `new Date(report.createdAt)` for formatting.
- Date format 'SAT, APR 19' must use the user's local timezone via Date API options, not UTC.
- summaryJson is optional and untyped (unknown) on the Convex side — cast through unknown rather than asserting a schema.
- The freshness dot is a decorative circle View, not an Icon — accessibilityLabel should read 'Report freshness: recent/aging/stale'.

================================================================================
