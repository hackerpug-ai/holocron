================================================================================
TASK: RECO-UI-03 - Add stories and regression tests for rich, legacy, and sparse recommendation flows
================================================================================

TASK_TYPE: INFRA
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P1
EFFORT: M
TYPE: DEV
ITERATION: 1
AGENT: react-native-ui-planner

--------------------------------------------------------------------------------
GOAL
--------------------------------------------------------------------------------

Lock the upgraded recommendation card contract and behaviors into stories and regression tests so sparse/legacy payloads do not regress while rich states land.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- [components/cards/RecommendationItem.stories.tsx] (MODIFY): Add rich, sparse, long-text, and multi-platform states.
- [components/cards/RecommendationListCard.stories.tsx] (MODIFY): Add list-level rich/legacy/sparse states.
- [components/cards/RecommendationActionSheet.stories.tsx] (MODIFY): Reflect the normalized contract and safe-area-aware behavior.
- [components/cards/__tests__/RecommendationItem.test.tsx] (NEW): Cover rendering and chip interactions.
- [components/cards/__tests__/RecommendationListCard.test.tsx] (NEW): Cover list save and long-press flows.
- [components/chat/__tests__/MessageBubble.recommendation.test.tsx] (NEW): Cover the recommendation-list normalization boundary.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] Stories cover rich, legacy, sparse, long-text, and multi-platform states.
- [ ] Tests cover normalization, conditional trust rendering, chip interactions, and save flows.
- [ ] The chat boundary fails fast if backend payloads drift from the normalized UI contract.
- [ ] New trust-signal affordances expose stable `testID`s.

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Backend pipeline tests
- New design mockups or `components.yaml`
- Unrelated card regression sweeps outside recommendations

--------------------------------------------------------------------------------
CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- MUST validate real render and interaction behavior, not just snapshots.
- MUST include rich, legacy, and sparse states in both stories and tests.
- MUST expose stable `testID`s for trust row, whyRecommended, pricing, platform chips, phone, location, website, save-one, and save-all.
- MUST treat stories as the executable UI reference because this PRD has no mockups or `components.yaml`.

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

Objective: create executable UI reference states and regression tests for the upgraded recommendation contract.

Success looks like: Storybook and tests catch contract drift, sparse-state regressions, and broken interactions before runtime chat usage.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

| # | Given | When | Then | Verify |
|---|---|---|---|---|
| AC-1 | the upgraded recommendation card components | Storybook is opened | dedicated stories exist for rich trust signals, legacy minimal payloads, sparse optional fields, long text, and multi-platform chips | `pnpm typecheck` |
| AC-2 | the upgraded recommendation contract and render logic | component tests run | tests cover normalization, trust rendering, chip interactions, long-press sheet behavior, and save regressions | `pnpm typecheck` |
| AC-3 | backend fields drift from the UI contract in the future | chat recommendation tests run | tests fail at the normalization boundary before runtime rendering breaks | `pnpm typecheck` |
| AC-4 | upgraded trust affordances are introduced | stories and tests are authored | the suite queries those affordances by stable `testID`s instead of fragile text-only selectors | `pnpm typecheck` |

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|---|---|---|---|
| TC-1 | Storybook contains explicit rich, legacy, sparse, long-text, and multi-platform recommendation states | AC-1 | `pnpm typecheck` | [ ] TRUE [ ] FALSE |
| TC-2 | recommendation tests assert trust row, whyRecommended, pricing, platform links, phone, location, website, and save flows | AC-2 | `pnpm typecheck` | [ ] TRUE [ ] FALSE |
| TC-3 | the chat boundary has a contract regression test for raw backend payload normalization | AC-3 | `pnpm typecheck` | [ ] TRUE [ ] FALSE |
| TC-4 | all newly introduced trust affordances are addressable by stable `testID`s | AC-4 | `pnpm typecheck` | [ ] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `components/cards/RecommendationItem.stories.tsx`
   - Lines: 1-80
   - Focus: current old-contract stories only

2. `components/cards/RecommendationListCard.stories.tsx`
   - Lines: 1-128
   - Focus: current list stories and sparse contact-only coverage

3. `components/cards/RecommendationActionSheet.stories.tsx`
   - Lines: 1-55
   - Focus: current sheet story surface

4. `components/chat/MessageBubble.tsx`
   - Lines: 777-796
   - Focus: normalization boundary requiring dedicated regression coverage

5. `convex/chat/toolExecutor.ts`
   - Lines: 861-899
   - Focus: raw recommendation payload emitted into chat

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `components/cards/RecommendationItem.stories.tsx`
- `components/cards/RecommendationListCard.stories.tsx`
- `components/cards/RecommendationActionSheet.stories.tsx`
- `components/cards/__tests__/RecommendationItem.test.tsx`
- `components/cards/__tests__/RecommendationListCard.test.tsx`
- `components/chat/__tests__/MessageBubble.recommendation.test.tsx`

WRITE-PROHIBITED:
- `convex/**`
- `app/**`

MUST:
- [ ] Add stable `testID`s that match the upgraded UI
- [ ] Cover both raw-backend normalization and rendered card interactions
- [ ] Document the no-mockup/no-components-yaml gap in story naming or notes instead of inventing artifacts

MUST NOT:
- [ ] Rely only on snapshots
- [ ] Leave rich trust-signal states unrepresented in Storybook
- [ ] Add tests that depend on backend network calls

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

References:
- `.spec/prd/recommendation-upgrade/README.md`
- `components/cards/RecommendationItem.stories.tsx`
- `components/cards/RecommendationListCard.stories.tsx`
- `CLAUDE.md`

Pattern: executable UI spec through Storybook states plus focused normalization and interaction regression tests.

Anti-pattern: relying on ad hoc manual QA for sparse payloads or cross-boundary contract drift.

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

- `pnpm typecheck`
- `pnpm exec eslint components/cards/RecommendationItem.stories.tsx components/cards/RecommendationListCard.stories.tsx components/cards/RecommendationActionSheet.stories.tsx components/cards/__tests__/RecommendationItem.test.tsx components/cards/__tests__/RecommendationListCard.test.tsx components/chat/__tests__/MessageBubble.recommendation.test.tsx`

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

- `RECO-UI-01`
- `RECO-UI-02`

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

- Specialist assignment: `react-native-ui-planner`
- Recommended new ids: `recommendation-item-{index}-trust`, `recommendation-item-{index}-why`, `recommendation-item-{index}-pricing`, `recommendation-item-{index}-platform-link-{chipIndex}`
