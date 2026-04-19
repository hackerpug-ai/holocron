================================================================================
TASK: NEWSFEED-006 - Swap SubscriptionFeedScreen for NewsfeedScreen in Route
================================================================================

TASK_TYPE: FEATURE
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P1
EFFORT: S
TYPE: DEV
ITERATION: 1

Sprint: [Sprint 1: Intelligence Briefing Screen](./SPRINT.md)

--------------------------------------------------------------------------------
GOAL (1 sentence)
--------------------------------------------------------------------------------

Replace SubscriptionFeedScreen with NewsfeedScreen in the What's New route file so the intelligence briefing layout is live for the sprint gate reviewer.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- app/(drawer)/whats-new/index.tsx (MODIFY): Change import from SubscriptionFeedScreen to NewsfeedScreen and replace JSX usage; preserve ScreenLayout wrapper, back navigation logic, and testID='whats-new-layout' unchanged.
- app/(drawer)/whats-new/__tests__/index.test.tsx (NEW): RTL test asserting NewsfeedScreen renders in the route and SubscriptionFeedScreen does not.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] app/(drawer)/whats-new/index.tsx imports NewsfeedScreen from '@/components/whats-new/NewsfeedScreen'
- [ ] app/(drawer)/whats-new/index.tsx no longer imports or references SubscriptionFeedScreen
- [ ] JSX renders `<NewsfeedScreen testID="whats-new-feed" />` in place of `<SubscriptionFeedScreen testID="whats-new-feed" />`
- [ ] ScreenLayout wrapper, handleBack logic, edges='bottom', and testID='whats-new-layout' unchanged
- [ ] Route test asserts NewsfeedScreen is present and SubscriptionFeedScreen is absent
- [ ] pnpm test exits 0
- [ ] pnpm tsgo --noEmit exits 0
- [ ] pnpm biome check . exits 0
- [ ] Only WRITE-ALLOWED files modified (git diff --name-only)

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Do NOT modify SubscriptionFeedScreen.tsx — it remains on disk for potential revert
- Do NOT modify NewsfeedScreen.tsx — owned by NEWSFEED-005
- Do NOT change ScreenLayout, back navigation logic, or any wrapper behavior
- Do NOT alter testID values on ScreenLayout or the screen component
- Do NOT add new navigation routes or drawer entries
- Do NOT modify any Expo Router config files

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: NewsfeedScreen is rendered by the route
  GIVEN: The app/(drawer)/whats-new/index.tsx route file has been updated
  WHEN: The WhatsNewScreen component is rendered in a test environment with mocked NewsfeedScreen
  THEN: The rendered output contains a NewsfeedScreen component with testID='whats-new-feed'

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: app/(drawer)/whats-new/__tests__/index.test.tsx
  TEST_FUNCTION: rendersNewsfeedScreenWithTestID

AC-2: SubscriptionFeedScreen is absent from the route
  GIVEN: The route file has been updated
  WHEN: The WhatsNewScreen component is rendered
  THEN: No SubscriptionFeedScreen instance appears anywhere in the rendered output

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: app/(drawer)/whats-new/__tests__/index.test.tsx
  TEST_FUNCTION: doesNotRenderSubscriptionFeedScreen

AC-3: ScreenLayout wrapper and testID are preserved
  GIVEN: The route file has been updated
  WHEN: The WhatsNewScreen component is rendered
  THEN: An element with testID='whats-new-layout' is present in the output and contains NewsfeedScreen as a child

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: app/(drawer)/whats-new/__tests__/index.test.tsx
  TEST_FUNCTION: screenLayoutTestIDPreserved

AC-4: Back navigation logic is unchanged
  GIVEN: The route is rendered with a mocked useRouter where canGoBack returns true
  WHEN: The header back button is pressed
  THEN: router.back() is called; router.navigate is not called

  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR
  TEST_FILE: app/(drawer)/whats-new/__tests__/index.test.tsx
  TEST_FUNCTION: backNavigationCallsRouterBack

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. app/(drawer)/whats-new/index.tsx
   - Lines: ALL
   - Focus: This is the only file to modify. Understand every import and JSX element before touching anything — the change is two lines (one import, one component name in JSX).

2. components/whats-new/NewsfeedScreen.tsx
   - Lines: ALL
   - Focus: Confirm the named export is NewsfeedScreen and the component accepts testID prop — both must be true for the import swap to compile.

3. components/subscriptions/SubscriptionFeedScreen.tsx
   - Lines: 1-10
   - Focus: Confirm the old import path so the correct line is removed; do not modify this file.

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- app/(drawer)/whats-new/index.tsx (MODIFY)
- app/(drawer)/whats-new/__tests__/index.test.tsx (NEW)

WRITE-PROHIBITED:
- components/whats-new/NewsfeedScreen.tsx — owned by NEWSFEED-005; read-only from this task
- components/subscriptions/SubscriptionFeedScreen.tsx — must remain on disk unchanged
- components/ui/screen-layout.tsx — wrapper must not be altered
- app/(drawer)/_layout.tsx — drawer config must not change
- Any other app/ route files
- convex/ — no backend changes
- hooks/ — no hook changes

MUST:
- [ ] Preserve ScreenLayout wrapper exactly as is
- [ ] Preserve handleBack logic exactly as is
- [ ] Preserve edges='bottom' exactly as is
- [ ] Preserve testID='whats-new-layout' on ScreenLayout

MUST NOT:
- [ ] Delete SubscriptionFeedScreen.tsx from disk
- [ ] Change the ScreenLayout header title (stays "What's New")
- [ ] Add any new logic to the route file

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

```tsx
// app/(drawer)/whats-new/index.tsx — AFTER swap (complete file)
import { useRouter } from 'expo-router';
import { NewsfeedScreen } from '@/components/whats-new/NewsfeedScreen'; // CHANGED
import { ScreenLayout } from '@/components/ui/screen-layout';

export default function WhatsNewScreen() {
  const router = useRouter();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate('/chat/new');
    }
  };

  return (
    <ScreenLayout
      header={{
        title: "What's New",
        showBack: true,
        onBack: handleBack,
      }}
      edges="bottom"
      testID="whats-new-layout"
    >
      <NewsfeedScreen testID="whats-new-feed" /> {/* CHANGED */}
    </ScreenLayout>
  );
}
```

Anti-pattern (DO NOT):
```tsx
// WRONG — keeping SubscriptionFeedScreen import alongside new one
import { SubscriptionFeedScreen } from '@/components/subscriptions/SubscriptionFeedScreen';
import { NewsfeedScreen } from '@/components/whats-new/NewsfeedScreen';

// WRONG — changing ScreenLayout or navigation
edges="top" // was "bottom"
router.navigate('/home') // was '/chat/new'
```

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** app/(drawer)/whats-new/index.tsx imports and renders SubscriptionFeedScreen. The sprint gate requires the What's New screen to show the intelligence briefing layout. NewsfeedScreen (NEWSFEED-005) is the new orchestrator providing this layout.

**Gap:** A single import line and JSX component name must change. Without this swap, the intelligence briefing never appears on screen regardless of how many components are built — this is the final activation step for the sprint gate.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

AGENT: react-native-ui-implementer

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  WRITE: ONE failing test (mock both NewsfeedScreen and SubscriptionFeedScreen; test will fail because route still uses old component)
  RUN: pnpm test -- index.test.tsx
  VERIFY: Test FAILS
  RETURN: { phase: "RED", test_file, failure_output }
  MUST NOT: Modify the route file yet

### GREEN PHASE
  WRITE: Swap the import and JSX in app/(drawer)/whats-new/index.tsx
  RUN: pnpm test -- index.test.tsx
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
  RUN: pnpm test -- index.test.tsx
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
**Rationale**: Trivial two-line file edit with a straightforward route test; no design judgment required.

**Review Agent**: react-native-ui-reviewer
**Rationale**: Reviewer confirms ScreenLayout wrapper, back navigation, testIDs, and edges prop are byte-for-byte identical to the original; only the screen component changed.

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
  Expected: Only app/(drawer)/whats-new/index.tsx and app/(drawer)/whats-new/__tests__/index.test.tsx

--------------------------------------------------------------------------------
REVIEW CRITERIA
--------------------------------------------------------------------------------

TDD Quality:
- [ ] 4 tests with RED evidence
- [ ] Test for absence of SubscriptionFeedScreen guards against future regression

Code Quality:
- [ ] Only two lines changed in index.tsx (import + JSX component name)
- [ ] SubscriptionFeedScreen.tsx still exists on disk after this task
- [ ] ScreenLayout, handleBack, edges, and header title untouched

Review Verdict: [ ] APPROVED   [ ] NEEDS_FIXES

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends On:
- NEWSFEED-005 — NewsfeedScreen must exist and export named component with testID prop

Blocks: (none — this is the terminal task for the sprint gate)

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

- This is intentionally the smallest task in the sprint. Do not scope-creep by modifying ScreenLayout, navigation, or SubscriptionFeedScreen.
- SubscriptionFeedScreen.tsx must remain on disk after this task completes — do not delete it.
- If pnpm tsgo fails after the swap, the most likely cause is NewsfeedScreen not yet having its named export or testID prop. Fix in NewsfeedScreen.tsx (WRITE-PROHIBITED from this task) by flagging the dependency.
- The test that asserts 'SubscriptionFeedScreen' is absent from the route source guards against a future agent accidentally re-introducing the old import.

================================================================================
