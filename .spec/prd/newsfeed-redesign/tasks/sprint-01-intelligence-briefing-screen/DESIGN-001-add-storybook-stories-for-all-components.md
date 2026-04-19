================================================================================
TASK: DESIGN-001 - Add Storybook Stories for All 4 New Components
================================================================================

TASK_TYPE: FEATURE
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P1
EFFORT: M
TYPE: PROCESS
ITERATION: 1

Sprint: [Sprint 1: Intelligence Briefing Screen](./SPRINT.md)

--------------------------------------------------------------------------------
GOAL (1 sentence)
--------------------------------------------------------------------------------

Create Storybook story files for NewsfeedHeader, NewsfeedFilterBar, NewsfeedFindingCard, and NewsfeedHeroCard so reviewers can visually inspect all variants — including all four category accents, active/inactive filter states, freshness dot colors, and the hero vs. regular card distinction — without launching the full app.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- components/whats-new/NewsfeedHeader.stories.tsx (NEW): Stories: Fresh, Aging, Stale, NullReport.
- components/whats-new/NewsfeedFilterBar.stories.tsx (NEW): Stories: Default (ALL selected), CategorySelected (discovery active), AllVariants.
- components/whats-new/NewsfeedFindingCard.stories.tsx (NEW): Stories: Default, AllCategories (all 4 border colors), WithoutScore, LongTitle.
- components/whats-new/NewsfeedHeroCard.stories.tsx (NEW): Stories: Default, AllCategoryVariants, LongTitle, MinimalProps.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] All four story files exist in components/whats-new/ named {ComponentName}.stories.tsx
- [ ] Each story file uses `satisfies Meta<typeof ComponentName>` syntax (matches project pattern)
- [ ] Each component has at minimum: Default story, AllVariants story showing all category permutations
- [ ] NewsfeedHeader has stories for each freshness state (fresh/aging/stale) and NullReport
- [ ] NewsfeedFilterBar has a story showing active state on a non-ALL category
- [ ] Story args use realistic fixture data — no lorem ipsum for titles
- [ ] Story files do not import from @testing-library — pure render stories
- [ ] `pnpm tsgo --noEmit` exits 0 (story files are type-checked)
- [ ] `pnpm biome check .` exits 0
- [ ] Only WRITE-ALLOWED files modified (git diff --name-only)

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Storybook play functions with interaction assertions — optional enhancement, not required
- Storybook configuration changes (.storybook/ directory)
- Stories for existing components (WhatsNewFindingCard, WhatsNewReportCard, etc.)
- Visual regression snapshots or Chromatic integration
- Testing the Storybook build via separate CI check

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: NewsfeedHeader stories cover all three freshness states
  GIVEN: NewsfeedHeader.stories.tsx is loaded
  WHEN: A developer browses Fresh, Aging, and Stale stories
  THEN: The freshness dot renders green, amber, and red respectively without any JS error; NullReport story renders without crash

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/NewsfeedHeader.stories.tsx
  TEST_FUNCTION: Fresh / Aging / Stale / NullReport story exports exist

AC-2: NewsfeedFilterBar AllVariants shows all four category pills
  GIVEN: NewsfeedFilterBar.stories.tsx AllVariants story
  WHEN: Story renders
  THEN: Rendered output contains filter pills for discovery, release, trend, discussion, plus ALL

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/NewsfeedFilterBar.stories.tsx
  TEST_FUNCTION: AllVariants story export exists

AC-3: NewsfeedFindingCard AllCategories shows distinct border colors
  GIVEN: NewsfeedFindingCard.stories.tsx AllCategories story renders all four variants
  WHEN: Story renders
  THEN: Each card row has a different borderLeftColor matching CATEGORY_COLORS values

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/NewsfeedFindingCard.stories.tsx
  TEST_FUNCTION: AllCategories story export exists

AC-4: NewsfeedHeroCard Default story renders TOP SIGNAL eyebrow
  GIVEN: NewsfeedHeroCard.stories.tsx Default story
  WHEN: Story renders
  THEN: The text 'TOP SIGNAL' is visible in the rendered output

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/NewsfeedHeroCard.stories.tsx
  TEST_FUNCTION: Default story export exists

AC-5: All story files type-check clean
  GIVEN: All four story files exist
  WHEN: `pnpm tsgo --noEmit` runs
  THEN: Exit code 0, no type errors in any story file

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: N/A — verified by verification gate
  TEST_FUNCTION: pnpm tsgo --noEmit

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. components/ui/card.stories.tsx (if exists)
   - Lines: ALL
   - Focus: Project-canonical story file structure: Meta satisfies syntax, decorators pattern, AllVariants render story

2. components/whats-new/NewsfeedFindingCard.tsx
   - Lines: ALL
   - Focus: Exact prop interface to match in story args

3. components/whats-new/NewsfeedHeroCard.tsx
   - Lines: ALL
   - Focus: Required onPress prop — stories must always include it

4. components/whats-new/categoryColors.ts
   - Lines: ALL
   - Focus: CategoryKey values for iterating all variants in AllCategories/AllVariants stories

5. components/whats-new/NewsfeedHeader.tsx
   - Lines: ALL
   - Focus: Report prop shape for constructing freshness state fixtures

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- components/whats-new/NewsfeedHeader.stories.tsx (NEW)
- components/whats-new/NewsfeedFilterBar.stories.tsx (NEW)
- components/whats-new/NewsfeedFindingCard.stories.tsx (NEW)
- components/whats-new/NewsfeedHeroCard.stories.tsx (NEW)

WRITE-PROHIBITED:
- components/whats-new/NewsfeedHeader.tsx — stories are read-only consumers
- components/whats-new/NewsfeedFilterBar.tsx — do not modify the component to fit story needs
- components/whats-new/NewsfeedFindingCard.tsx — do not modify the component to fit story needs
- components/whats-new/NewsfeedHeroCard.tsx — do not modify the component to fit story needs
- .storybook/* — no storybook configuration changes
- components/whats-new/WhatsNewFindingCard.tsx — existing component, out of scope

MUST:
- [ ] Use `satisfies Meta<typeof ComponentName>` syntax (not `as Meta<...>`)
- [ ] Named exports for each story (Default, AllVariants, etc.)
- [ ] `export default meta` as the only default export
- [ ] Realistic titles (AI/tech article titles, not lorem ipsum)
- [ ] Always include onPress in NewsfeedHeroCard stories (it is required)

MUST NOT:
- [ ] Import from @testing-library in story files
- [ ] Use `as Meta<...>` (loses type inference — use `satisfies`)
- [ ] Omit onPress from NewsfeedHeroCard story args

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

```tsx
// components/whats-new/NewsfeedFindingCard.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { NewsfeedFindingCard } from './NewsfeedFindingCard'
import { CATEGORY_COLORS } from './categoryColors'

const meta = {
  title: 'WhatsNew/NewsfeedFindingCard',
  component: NewsfeedFindingCard,
  decorators: [
    (Story) => (
      <View className="flex-1 bg-background p-4">
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof NewsfeedFindingCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    title: 'Claude 4 Achieves State-of-the-Art on Reasoning Benchmarks',
    source: 'Anthropic Blog',
    category: 'release',
    score: 85,
    summary: 'The new Claude 4 model sets a new bar on reasoning and coding tasks...',
    publishedAt: new Date(Date.now() - 7200000).toISOString(),
    onPress: () => {},
  },
}

export const AllCategories: Story = {
  render: () => (
    <View className="gap-0">
      {(Object.keys(CATEGORY_COLORS) as Array<keyof typeof CATEGORY_COLORS>).map((cat) => (
        <NewsfeedFindingCard
          key={cat}
          category={cat}
          title={`Sample ${cat} finding about AI tooling`}
          source="Example Source"
          score={70}
          url={`https://example.com/${cat}`}
          onPress={() => {}}
        />
      ))}
    </View>
  ),
}
```

Anti-pattern (DO NOT):
```tsx
// WRONG — `as Meta` loses type inference
const meta: Meta<typeof NewsfeedFindingCard> = { ... }

// WRONG — lorem ipsum titles
title: 'Lorem ipsum dolor sit amet'

// WRONG — missing onPress on HeroCard stories (it is required)
<NewsfeedHeroCard title="..." source="..." category="release" />

// WRONG — importing from @testing-library in story files
import { render } from '@testing-library/react-native'
```

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** The four new Sprint 1 components will exist after NEWSFEED-001 through NEWSFEED-004 complete but have no visual documentation or isolated render surface. Storybook in this project is on-device (iOS simulator).

**Gap:** Reviewers validating the Sprint 1 gate need to inspect the editorial aesthetic — border colors, freshness dots, hero vs. regular distinction — without running the full app against live Convex data. Storybook stories close this gap and serve as living design documentation.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

AGENT: frontend-designer

For this PROCESS task, the TDD flow adapts:
- "RED" = story file that imports from non-existent component (will fail typecheck)
- "GREEN" = story file that imports from existing component and renders correctly
- "REFACTOR" = improve fixture data, add AllVariants stories, clean up

For each story file:
1. Create the file with Default story
2. Verify `pnpm tsgo --noEmit` passes
3. Add AllVariants / AllCategories story
4. Add component-specific variant stories (freshness states, active filter, etc.)

--------------------------------------------------------------------------------
ORCHESTRATOR VERIFICATION PROTOCOL
--------------------------------------------------------------------------------

AFTER EACH STORY FILE:
  RUN: pnpm tsgo --noEmit
  EXPECT: Exit code 0

AFTER ALL FOUR FILES:
  RUN: pnpm tsgo --noEmit && pnpm biome check .
  EXPECT: Both exit 0

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: frontend-designer
**Rationale**: Story authoring requires aesthetic judgment about fixture data, variant coverage, and story naming — within frontend-designer scope.

**Review Agent**: react-native-ui-reviewer
**Rationale**: Reviewer confirms stories cover all category variants, freshness states, and that AllVariants stories adequately represent the Signal Intelligence aesthetic for design sign-off.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

Gate 1: Type Check (all 4 story files)
  Command: pnpm tsgo --noEmit
  Expected: Exit 0

Gate 2: Lint
  Command: pnpm biome check .
  Expected: Exit 0

Gate 3: Scope Compliance
  Command: git diff --name-only
  Expected: Only the 4 new *.stories.tsx files

--------------------------------------------------------------------------------
REVIEW CRITERIA
--------------------------------------------------------------------------------

Story Quality:
- [ ] Realistic fixture data (no lorem ipsum, no placeholder titles)
- [ ] Each component has Default + AllVariants/AllCategories stories
- [ ] NewsfeedHeader has Fresh/Aging/Stale/NullReport stories
- [ ] NewsfeedHeroCard always has onPress in story args
- [ ] `satisfies Meta<...>` syntax (not `as Meta<...>`)

Code Quality:
- [ ] No @testing-library imports
- [ ] Decorators wrap stories in `bg-background p-4` View
- [ ] AllCategories iterates CATEGORY_COLORS keys (not hardcoded)

Review Verdict: [ ] APPROVED   [ ] NEEDS_FIXES

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends On:
- NEWSFEED-001 — NewsfeedHeader must exist
- NEWSFEED-002 — NewsfeedFilterBar must exist
- NEWSFEED-003 — NewsfeedFindingCard must exist
- NEWSFEED-004 — NewsfeedHeroCard must exist

Blocks: (none — DESIGN-001 is the terminal design task)

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

- Stories are in components/whats-new/ beside the component files — not in a top-level stories/ directory.
- Story title prefix 'WhatsNew/' groups all four stories under the same Storybook sidebar section.
- NewsfeedHeader freshness stories: construct createdAt as `Date.now() - (N * 3_600_000)` at story evaluation time so they remain accurate regardless of when the story is viewed. Do NOT use hardcoded timestamps.
- Storybook in this project is on-device (iOS simulator via `pnpm start:storybook:ios`) — ensure no story imports browser-only APIs.

================================================================================
