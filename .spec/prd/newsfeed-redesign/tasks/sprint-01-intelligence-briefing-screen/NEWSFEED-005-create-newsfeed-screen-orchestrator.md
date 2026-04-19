================================================================================
TASK: NEWSFEED-005 - Create NewsfeedScreen Orchestrator Component
================================================================================

TASK_TYPE: FEATURE
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P1
EFFORT: M
TYPE: DEV
ITERATION: 1

Sprint: [Sprint 1: Intelligence Briefing Screen](./SPRINT.md)

--------------------------------------------------------------------------------
GOAL (1 sentence)
--------------------------------------------------------------------------------

Build the NewsfeedScreen orchestrator that composes all four new intelligence briefing components, wires the three existing hooks, and renders a hero card + filtered FlatList of findings with pull-to-refresh, search, and WebViewSheet support.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- components/whats-new/NewsfeedScreen.tsx (NEW): Screen orchestrator; imports NewsfeedHeader, NewsfeedFilterBar, NewsfeedFindingCard, NewsfeedHeroCard; wires useWhatsNewFeed, useWebView, useOfflineQueue; renders hero card in ListHeaderComponent and remaining nonSocialFindings in FlatList data.
- components/whats-new/__tests__/NewsfeedScreen.test.tsx (NEW): RTL unit tests covering hero card placement, FlatList data, filter wiring, pull-to-refresh, and card press.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] components/whats-new/NewsfeedScreen.tsx exists and exports named React.memo component NewsfeedScreen
- [ ] NewsfeedHeader receives the report prop from useWhatsNewFeed
- [ ] NewsfeedFilterBar receives filterOptions, selectedCategory, and setSelectedCategory
- [ ] nonSocialFindings[0] renders as NewsfeedHeroCard inside ListHeaderComponent
- [ ] nonSocialFindings.slice(1) (filtered by activeCategory) passed as FlatList data; renders NewsfeedFindingCard per item
- [ ] SocialPostsGroupCard, FeedSkeleton, OfflineBanner, QueueIndicator, WebViewSheet, and SearchInput all retained from SubscriptionFeedScreen patterns
- [ ] Pull-to-refresh via RefreshControl calls refresh() from useWhatsNewFeed
- [ ] Tapping NewsfeedHeroCard or NewsfeedFindingCard calls openUrl with the finding url
- [ ] All interactive elements have testID props
- [ ] pnpm test exits 0 with NewsfeedScreen.test.tsx passing
- [ ] pnpm tsgo --noEmit exits 0
- [ ] pnpm biome check . exits 0
- [ ] Only WRITE-ALLOWED files modified (git diff --name-only)

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Do NOT modify or delete SubscriptionFeedScreen.tsx — it stays intact until NEWSFEED-006
- Do NOT implement NewsfeedHeader, NewsfeedFilterBar, NewsfeedFindingCard, or NewsfeedHeroCard — owned by NEWSFEED-001 through NEWSFEED-004
- Do NOT create or modify the route file app/(drawer)/whats-new/index.tsx — that is NEWSFEED-006
- Do NOT alter CATEGORY_COLORS or categoryColors.ts — owned by DESIGN-002
- Do NOT implement new hooks — reuse useWhatsNewFeed, useWebView, useOfflineQueue exactly as contracted

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: Hero card is first nonSocialFinding in ListHeaderComponent
  GIVEN: useWhatsNewFeed returns findings = [findingA, findingB, findingC] where none are social sources
  WHEN: NewsfeedScreen renders with selectedCategory = 'all'
  THEN: NewsfeedHeroCard renders with title=findingA.title; NewsfeedFindingCard renders for findingB and findingC; findingA does NOT appear as a NewsfeedFindingCard

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedScreen.test.tsx
  TEST_FUNCTION: rendersHeroCardAsFirstNonSocialFinding

AC-2: Filter change re-queries with correct category arg
  GIVEN: NewsfeedScreen is rendered and selectedCategory is 'all'
  WHEN: NewsfeedFilterBar onChange fires with key='release'
  THEN: useWhatsNewFeed is called with { category: 'release' } and the FlatList re-renders with updated findings

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedScreen.test.tsx
  TEST_FUNCTION: filterChangePassesCategoryArgToHook

AC-3: Pull-to-refresh invokes refresh()
  GIVEN: NewsfeedScreen is rendered and isRefreshing=false
  WHEN: The RefreshControl onRefresh callback fires
  THEN: refresh() from useWhatsNewFeed is called exactly once

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedScreen.test.tsx
  TEST_FUNCTION: pullToRefreshCallsRefresh

AC-4: Card press opens WebViewSheet via openUrl
  GIVEN: NewsfeedScreen renders with at least two nonSocialFindings
  WHEN: User presses the NewsfeedHeroCard
  THEN: openUrl is called with the corresponding finding's url

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedScreen.test.tsx
  TEST_FUNCTION: pressingHeroCardCallsOpenUrl

AC-5: Social findings are segregated and rendered via SocialPostsGroupCard
  GIVEN: findings contains a mix of social (source starts with 'r/') and non-social items
  WHEN: selectedCategory is not 'discussion'
  THEN: Social findings are passed to SocialPostsGroupCard and NOT rendered as NewsfeedFindingCard or NewsfeedHeroCard

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedScreen.test.tsx
  TEST_FUNCTION: socialFindingsExcludedFromHeroAndFlatList

AC-6: Loading state renders FeedSkeleton
  GIVEN: useWhatsNewFeed returns isLoading=true and findings=[]
  WHEN: NewsfeedScreen renders
  THEN: FeedSkeleton is rendered and no NewsfeedHeroCard or NewsfeedFindingCard appears

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: components/whats-new/__tests__/NewsfeedScreen.test.tsx
  TEST_FUNCTION: rendersFeedSkeletonWhenLoading

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. components/subscriptions/SubscriptionFeedScreen.tsx
   - Lines: ALL
   - Focus: Copy isSocialSource, toCategoryArg, useMemo social/nonSocial split, filterOptions construction, search wiring, RefreshControl pattern, WebViewSheet, OfflineBanner, QueueIndicator, FeedSkeleton, SocialPostsGroupCard usage — these are the source of truth for patterns to port

2. app/(drawer)/whats-new/index.tsx
   - Lines: ALL
   - Focus: Understand ScreenLayout wrapper and testID='whats-new-feed' prop that NewsfeedScreen will receive; do NOT modify this file

3. hooks/use-whats-new-feed.ts
   - Lines: ALL
   - Focus: Confirm exact return shape: { findings, report, isLoading, isRefreshing, refresh } and category arg signature

4. components/whats-new/NewsfeedHeroCard.tsx
   - Lines: ALL
   - Focus: Confirm prop interface so ListHeaderComponent usage is type-correct; depends on NEWSFEED-004

5. components/whats-new/NewsfeedFindingCard.tsx
   - Lines: ALL
   - Focus: Confirm prop interface for FlatList renderItem usage; depends on NEWSFEED-003

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- components/whats-new/NewsfeedScreen.tsx (NEW)
- components/whats-new/__tests__/NewsfeedScreen.test.tsx (NEW)

WRITE-PROHIBITED:
- components/subscriptions/SubscriptionFeedScreen.tsx — must remain intact; route swap is NEWSFEED-006
- app/(drawer)/whats-new/index.tsx — route swap is NEWSFEED-006
- components/whats-new/NewsfeedHeader.tsx — owned by NEWSFEED-001
- components/whats-new/NewsfeedFilterBar.tsx — owned by NEWSFEED-002
- components/whats-new/NewsfeedFindingCard.tsx — owned by NEWSFEED-003
- components/whats-new/NewsfeedHeroCard.tsx — owned by NEWSFEED-004
- components/whats-new/categoryColors.ts — owned by DESIGN-002
- hooks/use-whats-new-feed.ts — hook contract is read-only for this task
- convex/ — no backend changes
- global.css — no stylesheet changes

MUST:
- [ ] Named export only (not default export) for NewsfeedScreen
- [ ] React.memo wrapping
- [ ] Copy isSocialSource and toCategoryArg helpers verbatim from SubscriptionFeedScreen — do not alter logic
- [ ] testID prop forwarded to outermost View

MUST NOT:
- [ ] Delete or modify SubscriptionFeedScreen.tsx
- [ ] Add new hooks or Convex queries beyond what SubscriptionFeedScreen already uses
- [ ] Default export the component

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

```tsx
// components/whats-new/NewsfeedScreen.tsx
import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useWhatsNewFeed } from '@/hooks/use-whats-new-feed';
import { useWebView } from '@/hooks/useWebView';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { NewsfeedHeader } from './NewsfeedHeader';
import { NewsfeedFilterBar } from './NewsfeedFilterBar';
import { NewsfeedHeroCard } from './NewsfeedHeroCard';
import { NewsfeedFindingCard } from './NewsfeedFindingCard';
// ... retain WebViewSheet, OfflineBanner, QueueIndicator, FeedSkeleton, SocialPostsGroupCard, SearchInput

function isSocialSource(source: string): boolean {
  return source.startsWith('r/') || source.includes('Bluesky') || source === 'Lobsters' || source === 'Dev.to' || source === 'Twitter/X';
}

function toCategoryArg(key: string): 'discovery' | 'release' | 'trend' | 'discussion' | undefined {
  if (key === 'discovery' || key === 'release' || key === 'trend' || key === 'discussion') return key;
  return undefined;
}

interface NewsfeedScreenProps { testID?: string }

export const NewsfeedScreen = React.memo(function NewsfeedScreen({ testID }: NewsfeedScreenProps) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const { findings, report, isLoading, isRefreshing, refresh } = useWhatsNewFeed({ category: toCategoryArg(selectedCategory) });
  const { webViewState, openUrl, closeWebView } = useWebView();
  const { queueLength } = useOfflineQueue();

  const { nonSocialFindings, socialFindings } = useMemo(() => {
    if (selectedCategory === 'discussion') return { nonSocialFindings: findings, socialFindings: [] };
    const social: typeof findings = [];
    const nonSocial: typeof findings = [];
    for (const f of findings) {
      if (isSocialSource(f.source)) social.push(f); else nonSocial.push(f);
    }
    return { nonSocialFindings: nonSocial, socialFindings: social };
  }, [findings, selectedCategory]);

  // ... filterOptions, heroFinding = nonSocialFindings[0], remainingFindings = nonSocialFindings.slice(1)
  // ... ListHeaderComponent with NewsfeedHeader + NewsfeedFilterBar + NewsfeedHeroCard
  // ... FlatList with renderItem using NewsfeedFindingCard
});
```

Test pattern:
```tsx
// Mock hooks and new components for unit tests
jest.mock('@/hooks/use-whats-new-feed', () => ({
  useWhatsNewFeed: jest.fn(() => ({
    findings: [
      { url: 'https://a.com', title: 'Finding A', source: 'TechCrunch', category: 'discovery', score: 90 },
      { url: 'https://b.com', title: 'Finding B', source: 'GitHub', category: 'release', score: 80 },
    ],
    report: { findingsCount: 2, discoveryCount: 1, releaseCount: 1, createdAt: Date.now() },
    isLoading: false, isRefreshing: false, refresh: mockRefresh,
  }))
}));
jest.mock('../NewsfeedHeroCard', () => ({ NewsfeedHeroCard: ({ testID, onPress }: any) => <View testID={testID} onTouchEnd={onPress} /> }));
jest.mock('../NewsfeedFindingCard', () => ({ NewsfeedFindingCard: ({ testID }: any) => <View testID={testID} /> }));
```

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** SubscriptionFeedScreen.tsx exists and is wired to the whats-new route. It contains all the hook wiring, social/non-social split logic, filter options construction, search, pull-to-refresh, WebViewSheet, OfflineBanner, QueueIndicator, FeedSkeleton, and SocialPostsGroupCard patterns that NewsfeedScreen must retain. The four new intelligence briefing components do not yet exist (being built in NEWSFEED-001 through 004).

**Gap:** NewsfeedScreen.tsx does not exist. Once created, it will replace SubscriptionFeedScreen in the route (NEWSFEED-006). The orchestrator must compose the new components while preserving all functional behavior from SubscriptionFeedScreen.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

AGENT: react-native-ui-implementer

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  WRITE: ONE failing test for the current AC (mock all four new components + three hooks)
  RUN: pnpm test -- NewsfeedScreen
  VERIFY: Test FAILS (component doesn't exist)
  RETURN: { phase: "RED", test_file, failure_output }
  MUST NOT: Write implementation code yet

### GREEN PHASE
  WRITE: Minimal NewsfeedScreen.tsx to pass the current AC test
  RUN: pnpm test -- NewsfeedScreen
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
  RUN: pnpm test -- NewsfeedScreen
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

**Implementation Agent**: react-native-ui-implementer
**Rationale**: Screen-level composition with FlatList, hook wiring, and React Native–specific patterns (RefreshControl, ListHeaderComponent) is core react-native-ui-implementer scope.

**Review Agent**: react-native-ui-reviewer
**Rationale**: Reviewer confirms component composition correctness, hook contract adherence, testID completeness, and that no SubscriptionFeedScreen behavior was silently dropped.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

Gate 1: All Tests Pass
  Command: pnpm test
  Expected: Exit 0, NewsfeedScreen suite passes (6 tests)

Gate 2: Type Check
  Command: pnpm tsgo --noEmit
  Expected: Exit 0

Gate 3: Lint
  Command: pnpm biome check .
  Expected: Exit 0

Gate 4: Scope Compliance
  Command: git diff --name-only
  Expected: Only components/whats-new/NewsfeedScreen.tsx and __tests__/NewsfeedScreen.test.tsx

--------------------------------------------------------------------------------
REVIEW CRITERIA
--------------------------------------------------------------------------------

TDD Quality:
- [ ] 6 tests with RED evidence
- [ ] Hooks mocked at the module level; new components mocked as minimal stubs
- [ ] Tests verify orchestration logic (which component gets which data), not visual output

Code Quality:
- [ ] isSocialSource and toCategoryArg copied verbatim from SubscriptionFeedScreen (no logic changes)
- [ ] heroFinding = nonSocialFindings[0] with null guard
- [ ] Named export, React.memo wrapping
- [ ] testID forwarded to outermost View

Review Verdict: [ ] APPROVED   [ ] NEEDS_FIXES

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends On:
- DESIGN-002 — categoryColors.ts (imports CategoryKey indirectly via filterOptions)
- NEWSFEED-001 — NewsfeedHeader component must exist
- NEWSFEED-002 — NewsfeedFilterBar component must exist
- NEWSFEED-003 — NewsfeedFindingCard component must exist
- NEWSFEED-004 — NewsfeedHeroCard component must exist

Blocks:
- NEWSFEED-006 — route swap requires this screen to exist

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

- All four new components must exist before this task can compile without errors. If blocking, implement with jest.mock stubs in tests and type-only imports guarded by TODO comments.
- isSocialSource and toCategoryArg helpers are copied verbatim from SubscriptionFeedScreen — do not alter their logic.
- Use Text from '@/components/ui/text', not react-native or react-native-paper.
- Named export only — no default export for components outside app/.
- The testID prop passed from the route ('whats-new-feed') must be forwarded to the outermost View.
- When nonSocialFindings has 0 or 1 items, the hero card section should gracefully render nothing (null check on heroFinding).

================================================================================
