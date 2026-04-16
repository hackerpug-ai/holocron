# Epic 2: Recommendation Trust Signal UI

## Overview

Adapt the chat/recommendation card boundary to the upgraded backend payload and surface trust metadata in a mobile-safe card layout with regression coverage.

## Theme

UI-boundary safety first:
- normalize raw tool payloads into a render-safe card contract
- render trust signals without breaking current interactions
- lock behavior in with stories and tests

## Human Test Steps

1. Run a recommendation query and confirm the chat card renders from raw tool payloads without type/cast issues.
2. Confirm the title shows `rating + review count` when present and omits empty punctuation when only one value exists.
3. Confirm `whyRecommended`, pricing, and platform chips render only when data exists.
4. Tap phone, location, website, and platform chips and confirm existing linking/fallback behavior still works.
5. Long-press a recommendation near the bottom of the viewport and confirm the action sheet is fully visible and safe-area aware.
6. Re-run a sparse legacy payload and confirm the card still renders cleanly.

## Source Coverage

- `FR-1`, `FR-6`, `FR-7`
- UI implications of `FR-5`

## Dependencies

- Depends on `rich-recommendation-engine`

## Task List

| Task | Title | Specialist | Estimate |
|---|---|---|---:|
| `RECO-UI-01` | Normalize recommendation payload into a UI-safe card contract | `react-native-ui-planner` | 90m |
| `RECO-UI-02` | Render trust signals and preserve mobile interaction flows in recommendation cards | `react-native-ui-planner` | 150m |
| `RECO-UI-03` | Add stories and regression tests for rich, legacy, and sparse recommendation flows | `react-native-ui-planner` | 110m |

## Wall-Clock Estimate

- Sequential: `350 minutes`
- Expected after backend contract is available: `275-300 minutes`

## Definition Of Done

- Raw backend payloads normalize into a stable UI contract.
- Trust metadata renders cleanly without placeholder noise.
- Existing quick actions and long-press behaviors keep working.
- Action sheet uses a safe-area-aware pattern.
- Stories and tests cover rich, sparse, and legacy states.

