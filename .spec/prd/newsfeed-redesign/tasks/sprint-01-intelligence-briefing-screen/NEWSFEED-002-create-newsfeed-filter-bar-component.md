================================================================================
TASK: NEWSFEED-002 - Create NewsfeedFilterBar Component
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

Build the horizontal category filter bar that lets users narrow the newsfeed to a single finding category, displaying an icon and count badge per pill alongside an 'ALL' pill that is always first.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- components/whats-new/NewsfeedFilterBar.tsx (NEW): React.memo named export; fully controlled component accepting options array, selected key, and onChange callback.
- components/whats-new/__tests__/NewsfeedFilterBar.test.tsx (NEW): Vitest + @testing-library/react-native tests covering render, active state, onChange, ALL pill, and icon presence.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] components/whats-new/NewsfeedFilterBar.tsx exists as a named export wrapped in React.memo
- [ ] Renders inside ScrollView with horizontal={true} and showsHorizontalScrollIndicator={false}
- [ ] Active pill uses NativeWind classes 'bg-primary text-primary-foreground'; inactive 'bg-muted text-muted-foreground'
- [ ] Icon mapping: discovery=Sparkles, release=Package, trend=TrendingUp, discussion=MessageSquare (from @/components/ui/icons)
- [ ] ALL pill has no icon, shows total count; is always first regardless of options array order
- [ ] Each pill has testID='filter-pill-{key}' and testID='filter-pill-{key}-count' on the count element
- [ ] onChange fires with correct key when non-active pill is pressed
- [ ] onChange does NOT fire when already-active pill is pressed
- [ ] `pnpm tsgo --noEmit` exits 0
- [ ] `pnpm biome check .` exits 0
- [ ] `pnpm test` exits 0 with NewsfeedFilterBar suite passing (5 tests)
- [ ] Only WRITE-ALLOWED files modified (git diff --name-only)

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Managing selected state internally — fully controlled; parent owns selected
- Animation or springy scroll snapping
- Long-press or swipe interactions
- Modifications to FeedFilterChips.tsx or other existing filter components

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: ALL pill is always first and shows total count
  GIVEN: options = [{key:'discovery',label:'Discovery',count:3},{key:'release',label:'Release',count:5}], selected='all'
  WHEN: NewsfeedFilterBar renders
  THEN: testID='filter-pill-all' is the first child in the scroll view and shows count 8 (3+5)

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFilterBar.test.tsx
  TEST_FUNCTION: allPillIsFirstWithTotalCount

AC-2: Active pill has primary background class
  GIVEN: selected='discovery'
  WHEN: NewsfeedFilterBar renders
  THEN: testID='filter-pill-discovery' has className containing 'bg-primary'; testID='filter-pill-all' does not

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFilterBar.test.tsx
  TEST_FUNCTION: activePillHasPrimaryBackground

AC-3: Pressing inactive pill calls onChange with correct key
  GIVEN: selected='all', onChange is a jest.fn()
  WHEN: User presses testID='filter-pill-release'
  THEN: onChange is called once with argument 'release'

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFilterBar.test.tsx
  TEST_FUNCTION: pressingInactivePillCallsOnChange

AC-4: Pressing already-active pill does not call onChange
  GIVEN: selected='discovery', onChange is a jest.fn()
  WHEN: User presses testID='filter-pill-discovery'
  THEN: onChange is not called

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFilterBar.test.tsx
  TEST_FUNCTION: pressingActivePillDoesNotCallOnChange

AC-5: Category icons render for non-ALL pills
  GIVEN: options includes discovery, release, trend, discussion
  WHEN: NewsfeedFilterBar renders
  THEN: Each non-ALL pill contains the correct icon component; ALL pill contains no icon element

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedFilterBar.test.tsx
  TEST_FUNCTION: categoryIconsRenderForNonAllPills

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. components/subscriptions/SubscriptionFeedScreen.tsx
   - Lines: 120-136
   - Focus: filterOptions construction pattern — understand how discovery/release/trend/discussion counts are computed from report metadata

2. components/whats-new/WhatsNewFindingCard.tsx
   - Lines: 1-20
   - Focus: Icon import pattern from @/components/ui/icons

3. components/CLAUDE.md
   - Lines: ALL
   - Focus: NativeWind className-first approach, Text import, cn() utility

4. components/whats-new/categoryColors.ts
   - Lines: ALL
   - Focus: CategoryKey type for validating the key shape in filter options if needed

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- components/whats-new/NewsfeedFilterBar.tsx (NEW)
- components/whats-new/__tests__/NewsfeedFilterBar.test.tsx (NEW)

WRITE-PROHIBITED:
- components/subscriptions/FeedFilterChips.tsx — separate component, do not merge or modify
- components/whats-new/index.ts — barrel update deferred to assembly task
- components/ui/icons.tsx — do not add or modify icon exports
- app/(drawer)/whats-new/index.tsx — screen wiring is out of scope

MUST:
- [ ] Fully controlled component — no internal useState for selected
- [ ] ALL pill computed internally from sum of options[].count (not passed in options)
- [ ] Guard onChange: `if (option.key !== selected) onChange(option.key)`
- [ ] accessibilityRole='radio' with accessibilityState={{ selected: isActive }}

MUST NOT:
- [ ] StyleSheet.create for colors expressible via NativeWind
- [ ] Call onChange when active pill is re-pressed
- [ ] Manage filter state internally

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

```tsx
import { Sparkles, Package, TrendingUp, MessageSquare } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

const ICON_MAP: Record<string, React.ComponentType<{ size: number; className?: string }>> = {
  discovery: Sparkles,
  release:   Package,
  trend:     TrendingUp,
  discussion: MessageSquare,
}

// ALL pill is synthesized — not from options prop
const totalCount = options.reduce((sum, o) => sum + o.count, 0)

// Pill render pattern:
const isActive = selected === option.key
// className composition:
cn('rounded-full px-3 py-1.5 flex-row items-center gap-1.5', isActive ? 'bg-primary' : 'bg-muted')
```

Anti-pattern (DO NOT):
```tsx
// WRONG — managing selected state internally (must be fully controlled)
const [selected, setSelected] = useState('all')

// WRONG — StyleSheet.create for colors expressible via NativeWind
const styles = StyleSheet.create({ active: { backgroundColor: '#...' } })

// WRONG — firing onChange when active pill pressed
onPress={() => onChange(option.key)} // always — must guard
```

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** FeedFilterChips.tsx in components/subscriptions provides a horizontal filter bar but is tightly coupled to subscription-specific category types and uses theme hook colors rather than NativeWind classes. It has no icon support or count badges.

**Gap:** The newsfeed requires a filter bar with category icons, count badges, NativeWind className conventions, and an 'ALL' pill with total count. A new component is warranted rather than extending FeedFilterChips.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

AGENT: frontend-designer

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  WRITE: ONE failing test for the current AC
  RUN: pnpm test -- NewsfeedFilterBar
  VERIFY: Test FAILS
  RETURN: { phase: "RED", test_file, failure_output }
  MUST NOT: Write implementation code yet

### GREEN PHASE
  WRITE: Minimal code to pass the current AC test
  RUN: pnpm test -- NewsfeedFilterBar
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
  RUN: pnpm test -- NewsfeedFilterBar
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
**Rationale**: Controlled presentational component with icon mapping — no state, no async, pure layout work.

**Review Agent**: react-native-ui-reviewer
**Rationale**: Reviewer confirms the component is fully controlled, NativeWind classes are correct for active/inactive states, and accessibility roles are set on Pressable elements.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

Gate 1: All Tests Pass
  Command: pnpm test
  Expected: Exit 0, NewsfeedFilterBar suite passes (5 tests)

Gate 2: Type Check
  Command: pnpm tsgo --noEmit
  Expected: Exit 0

Gate 3: Lint
  Command: pnpm biome check .
  Expected: Exit 0

Gate 4: Scope Compliance
  Command: git diff --name-only
  Expected: Only NewsfeedFilterBar.tsx and __tests__/NewsfeedFilterBar.test.tsx

--------------------------------------------------------------------------------
REVIEW CRITERIA
--------------------------------------------------------------------------------

TDD Quality:
- [ ] One test per AC with RED evidence
- [ ] Tests verify behavior (onChange called / not called), not implementation

Code Quality:
- [ ] Fully controlled — no internal useState for selected
- [ ] ALL pill synthesized from options sum, not in props
- [ ] Guard on onChange prevents re-fire on active pill
- [ ] accessibilityRole='radio' on each pill Pressable

Review Verdict: [ ] APPROVED   [ ] NEEDS_FIXES

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends On:
- DESIGN-002 — CategoryKey type for the options key shape

Blocks:
- NEWSFEED-005 — NewsfeedScreen renders NewsfeedFilterBar
- DESIGN-001 — Storybook story requires the component to exist

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

- The options prop does NOT include an 'all' entry — the ALL pill is synthesized internally from total count. This keeps the parent's data clean.
- Icon components from @/components/ui/icons accept a size prop (number) and a className prop; do not pass color as a hex string directly.
- The count badge number inside each pill must be readable by screen readers — include it in accessibilityLabel or give it a testID.

================================================================================
