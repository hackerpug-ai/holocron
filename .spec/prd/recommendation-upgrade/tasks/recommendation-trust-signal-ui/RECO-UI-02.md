================================================================================
TASK: RECO-UI-02 - Render trust signals and preserve mobile interaction flows in recommendation cards
================================================================================

TASK_TYPE: FEATURE
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P0
EFFORT: L
TYPE: DEV
ITERATION: 1
AGENT: react-native-ui-planner

--------------------------------------------------------------------------------
GOAL
--------------------------------------------------------------------------------

Upgrade recommendation cards to display trust metadata, explanatory fit, pricing, and platform links without regressing current mobile interactions.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- [components/cards/RecommendationItem.tsx] (MODIFY): Render rating/review metadata, whyRecommended, pricing, and platform chips.
- [components/cards/RecommendationListCard.tsx] (MODIFY): Support grouped metadata/action rows and current save flows.
- [components/cards/RecommendationActionSheet.tsx] (MODIFY): Move to a safe-area-aware pattern that does not clip near screen edges.
- [components/cards/RecommendationSources.tsx] (MODIFY): Align with the new recommendation card contract if needed.
- [components/cards/types/recommendation.ts] (MODIFY): Carry the UI-facing trust-signal fields.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] Rating and review count render in the title area when present.
- [ ] `whyRecommended`, pricing, and platform chips render only when data exists.
- [ ] Existing phone, location, website, save, and long-press interactions still work.
- [ ] Platform chips are de-duplicated against generic website actions.
- [ ] Action sheet uses a safe-area-aware modal pattern.

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Backend recommendation pipeline changes
- Broad card redesign unrelated to trust metadata
- Final story/test matrix across all sparse/rich states

--------------------------------------------------------------------------------
CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- MUST render `rating` and `reviewCount` without empty punctuation or placeholder separators.
- MUST keep platform treatment payload-driven and domain agnostic.
- MUST preserve existing phone, location, website, save, and long-press behaviors.
- MUST use a safe-area-aware bottom-sheet pattern instead of an in-card clipped panel.

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

Objective: surface trust signals in recommendation cards while keeping sparse-data rendering and current interactions intact.

Success looks like: rich payloads show trust signals clearly, sparse payloads stay clean, and all current interactions still behave correctly in chat.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

| # | Given | When | Then | Verify |
|---|---|---|---|---|
| AC-1 | a normalized item includes `rating`, `reviewCount`, `whyRecommended`, `platformLinks`, and `pricing` | the item renders | the title row shows trust metadata, body shows description then whyRecommended, pricing appears when present, and platform chips render as tappable links | `pnpm typecheck` |
| AC-2 | a legacy or sparse item only includes a subset of fields | the item renders | missing sections are omitted cleanly with no empty rows or placeholder text | `pnpm typecheck` |
| AC-3 | an item includes phone, location, website, and platform links | the user taps or long-presses in the card | existing quick actions still work and long-press still opens the action sheet | `pnpm typecheck` |
| AC-4 | the action sheet opens near the bottom of the viewport | it appears on iOS and Android | the sheet is fully visible, safe-area aware, and not clipped by the card container | `pnpm typecheck` |
| AC-5 | an item has both `rating` and `reviewCount`, or only one of them | the title row renders | trust formatting is deterministic: `4.5 ★ (123 reviews)` when both exist, otherwise only the available token appears | `pnpm typecheck` |
| AC-6 | an item has `platformLinks` and a generic website URL | chip rows render | platform chips appear before generic website action chips and duplicate URLs are suppressed | `pnpm typecheck` |

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|---|---|---|---|
| TC-1 | the enriched card renders trust metadata, whyRecommended copy, pricing, and platform chips in a stable order | AC-1 | `pnpm typecheck` | [ ] TRUE [ ] FALSE |
| TC-2 | sparse items omit unavailable trust sections without placeholder labels or empty rows | AC-2 | `pnpm typecheck` | [ ] TRUE [ ] FALSE |
| TC-3 | existing quick actions and long-press flows still work after trust UI is added | AC-3 | `pnpm typecheck` | [ ] TRUE [ ] FALSE |
| TC-4 | the action sheet uses a safe-area-aware modal pattern rather than an in-card absolute panel | AC-4 | `pnpm typecheck` | [ ] TRUE [ ] FALSE |
| TC-5 | trust-signal formatting is deterministic for full and partial rating/review data | AC-5 | `pnpm typecheck` | [ ] TRUE [ ] FALSE |
| TC-6 | platform links render before generic website affordances and duplicate URLs are suppressed | AC-6 | `pnpm typecheck` | [ ] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `components/cards/RecommendationItem.tsx`
   - Lines: 1-97
   - Focus: current item layout and link helpers

2. `components/cards/RecommendationListCard.tsx`
   - Lines: 9-74
   - Focus: current list rendering and long-press flow

3. `components/cards/RecommendationActionSheet.tsx`
   - Lines: 1-74
   - Focus: current in-card sheet behavior that risks clipping

4. `components/ui/badge.tsx`
   - Lines: 1-67
   - Focus: compact metadata and pill styling

5. `components/FilterChip.tsx`
   - Lines: 1-49
   - Focus: existing interactive chip pattern

6. `components/documents/DocumentActionsSheet.tsx`
   - Lines: 1-170
   - Focus: safe-area-aware modal/bottom-sheet reference

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `components/cards/RecommendationItem.tsx`
- `components/cards/RecommendationListCard.tsx`
- `components/cards/RecommendationActionSheet.tsx`
- `components/cards/RecommendationSources.tsx`
- `components/cards/types/recommendation.ts`

WRITE-PROHIBITED:
- `convex/**`
- `app/**`
- `components/subscriptions/**`

MUST:
- [ ] Use in-repo UI primitives and current styling patterns
- [ ] Add explicit `testID`s for trust row, whyRecommended, pricing, and platform chips
- [ ] Preserve current quick actions and long-press affordance

MUST NOT:
- [ ] Introduce `react-native-paper`
- [ ] Replace quick actions with action-sheet-only access
- [ ] Add domain-specific iconography or ordering rules tied to business category

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

References:
- `.spec/prd/recommendation-upgrade/README.md`
- `components/ui/badge.tsx`
- `components/FilterChip.tsx`
- `components/documents/DocumentActionsSheet.tsx`

Pattern: compact title metadata row, stacked explanatory body copy, then separate platform-link and action/contact chip rows.

Anti-pattern: stuffing trust signals into tags, removing current quick actions, or using a visually noisy domain-specific treatment.

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

- `pnpm typecheck`
- `pnpm exec eslint components/cards/RecommendationItem.tsx components/cards/RecommendationListCard.tsx components/cards/RecommendationActionSheet.tsx components/cards/RecommendationSources.tsx components/cards/types/recommendation.ts`

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

- `RECO-UI-01`

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

- Specialist assignment: `react-native-ui-planner`
- Repo-specific risk captured from planning: the current action sheet likely clips because it is positioned inside the card container

