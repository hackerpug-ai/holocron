================================================================================
TASK: RECO-UI-01 - Normalize recommendation payload into a UI-safe card contract
================================================================================

TASK_TYPE: INFRA
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P0
EFFORT: M
TYPE: DEV
ITERATION: 1
AGENT: react-native-ui-planner

--------------------------------------------------------------------------------
GOAL
--------------------------------------------------------------------------------

Normalize raw `find_recommendations` card payloads into a stable recommendation card contract that the existing UI can render safely.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- [components/cards/types/recommendation.ts] (MODIFY): Define raw-backend and normalized-UI recommendation types with additive trust fields.
- [components/cards/recommendationAdapter.ts] (NEW): Pure adapter that derives stable ids, title, and primary URL.
- [components/chat/MessageBubble.tsx] (MODIFY): Replace unsafe cast with adapter-based normalization.
- [components/chat/ChatThread.tsx] (MODIFY): Preserve callback compatibility if needed at the save boundary.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] Raw backend items normalize before `RecommendationListCard` renders.
- [ ] Sparse payloads remain optional and do not fabricate fields.
- [ ] Save-one and save-all callback payloads remain backward compatible.
- [ ] `pnpm typecheck` passes with no unsafe recommendation cast.
- [ ] Recommendation boundary tests cover raw, rich, and sparse payloads.

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Visual trust-signal rendering details
- Action-sheet layout changes
- Storybook/test sweep across all recommendation states

--------------------------------------------------------------------------------
CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- MUST accept raw backend `name/description/whyRecommended/...` payloads without requiring backend reshaping.
- MUST keep trust-signal fields optional and derive deterministic fallbacks for `id`, `title`, and primary `url`.
- MUST preserve long-press, save, phone, location, and website flows through the chat/card boundary.
- NEVER introduce domain-specific branching into the adapter layer.

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

Objective: define a normalized recommendation card contract that safely bridges backend payloads to UI components.

Success looks like: chat result cards render from raw tool payloads and legacy sparse payloads through one normalized path, with no unsafe assumptions about missing UI-only fields.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

| # | Given | When | Then | Verify |
|---|---|---|---|---|
| AC-1 | raw `recommendation_list` card data uses backend item fields | the chat renderer prepares props for `RecommendationListCard` | each item is normalized into a UI model with derived `title`, stable `id`, optional trust fields, and primary URL mapping | `pnpm typecheck` |
| AC-2 | legacy or sparse payloads omit trust metadata | normalization runs | missing fields stay optional and downstream rendering omits unavailable sections safely | `pnpm typecheck` |
| AC-3 | existing save-one and save-all handlers are wired through chat | a normalized item is saved | callback consumers still receive stable `id`, `title`, `description`, and `url` values | `pnpm typecheck` |
| AC-4 | a raw item omits `id`, `title`, and top-level `url` | normalization builds the UI model | the adapter derives a deterministic `id`, maps `title` from `name`, and resolves `url` from `contact.url` or first valid platform link | `pnpm typecheck` |

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|---|---|---|---|
| TC-1 | raw backend recommendation items are converted into one normalized UI item type before `RecommendationListCard` renders | AC-1 | `pnpm typecheck` | [ ] TRUE [ ] FALSE |
| TC-2 | normalization does not emit fake trust-signal values when optional backend fields are absent | AC-2 | `pnpm typecheck` | [ ] TRUE [ ] FALSE |
| TC-3 | save callback payloads remain backward compatible after the contract is widened | AC-3 | `pnpm typecheck` | [ ] TRUE [ ] FALSE |
| TC-4 | deterministic ids and link fallbacks are produced when backend items omit UI-required fields | AC-4 | `pnpm typecheck` | [ ] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `components/cards/types/recommendation.ts`
   - Lines: 1-81
   - Focus: current UI type mismatch with backend payload

2. `components/chat/MessageBubble.tsx`
   - Lines: 76-79, 777-796
   - Focus: current recommendation-list branch and unsafe cast

3. `convex/chat/toolExecutor.ts`
   - Lines: 861-899
   - Focus: actual payload shape entering chat

4. `convex/research/actions.ts`
   - Lines: 1917-1952
   - Focus: backend recommendation return contract

5. `convex/chat/specialistPrompts.ts`
   - Lines: 194-249
   - Focus: additive trust fields expected from synthesis

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `components/cards/types/recommendation.ts`
- `components/chat/MessageBubble.tsx`
- `components/chat/ChatThread.tsx`
- `components/cards/recommendationAdapter.ts`

WRITE-PROHIBITED:
- `convex/**`
- `app/**`
- `components/subscriptions/**`

MUST:
- [ ] Introduce explicit raw-backend and normalized-UI types
- [ ] Generate deterministic item ids
- [ ] Map `name` to `title`
- [ ] Prefer `contact.url` or first platform URL for primary external link

MUST NOT:
- [ ] Rely on broad `as` casts for missing fields
- [ ] Break callback signatures used by save flows
- [ ] Add domain-specific fallback labels

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

References:
- `.spec/prd/recommendation-upgrade/README.md`
- `components/chat/MessageBubble.tsx`
- `components/cards/types/recommendation.ts`
- `CLAUDE.md`

Pattern: pure normalization boundary between raw tool payloads and presentational card props.

Anti-pattern: passing backend items directly into legacy card types and hiding drift with broad casts.

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

- `pnpm typecheck`
- `pnpm exec eslint components/cards/types/recommendation.ts components/chat/MessageBubble.tsx components/chat/ChatThread.tsx components/cards/recommendationAdapter.ts`

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

- `REC-UPG-01`
- `REC-UPG-03`

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

- Specialist assignment: `react-native-ui-planner`
- This task absorbs the backend/UI boundary overlap so the plan does not duplicate adapter work across epics.

