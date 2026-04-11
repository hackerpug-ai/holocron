# Epic 4: Recommendation Mobile UI

**Sequence**: 4 of 6
**Priority**: P0
**Wall-clock estimate**: ~15 hours (7 tasks)

## Overview

Build the mobile React Native UI that renders a `recommendation_list` result_card inline with tappable phone/website/maps chips, a long-press action sheet, a sources section, a save-all footer, and full Storybook + Vitest coverage. Integration point is the existing `ChatThread.tsx` dispatcher — a new `card_type` branch renders `RecommendationListCard` and wires save-to-KB callbacks.

**Stack note — IMPORTANT**: This project uses **NativeWind (Tailwind)** and imports `Text` from `@/components/ui/text`. It does **NOT** use `react-native-paper`. All tasks encode this as a critical constraint. Theme tokens come from `tailwind.config.js` + `global.css` CSS variables, accessed via Tailwind class names (`text-primary`, `bg-muted`, `border-border`), not from a `useSemanticTheme()` hook.

## Human Test Steps

1. Open the app, send the canonical failing query
2. See `RecommendationListCard` render inline with 5 named coaches
3. Tap phone chip on an item → iOS dialer opens with digits-only URL (regex-stripped)
4. Tap location chip → Apple Maps opens (iOS) or Google Maps opens via `geo:` URL (Android)
5. Tap website chip → browser opens
6. Long-press an item → action sheet appears with Save/Share/Dismiss
7. Tap Save in the action sheet → item persisted, sheet dismisses
8. Tap "Save list to KB" footer button → full list persisted
9. Tap sources section → expand/collapse toggles
10. Tap a source domain → browser opens that URL
11. Switch to dark mode, verify all colors use NativeWind tokens (no hardcoded hex)
12. Enable iOS VoiceOver, verify every chip has accessible label
13. Run `vitest --project=storybook --run` — all 8 stories render without errors

## PRD Sections Covered

- `05-uc-rec.md` — UC-REC-07, UC-REC-08, UC-REC-09, UC-REC-10
- `09-technical-requirements.md` — Build Sequence Tasks 16, 19-22, 26, 31

## Acceptance Criteria (Epic-level)

- [ ] `components/cards/types/recommendation.ts` exists as the single source of truth for types
- [ ] `RecommendationItem` renders name, rating, location, contact chips, why-it-fits
- [ ] Phone URLs strip non-digits before `Linking.openURL('tel:...')`
- [ ] Location URLs use `maps:?q=` on iOS and `geo:0,0?q=` on Android via `Platform.OS`
- [ ] `RecommendationSources` renders only when sources array is non-empty
- [ ] `RecommendationActionSheet` exposes Save/Share/Dismiss with proper testIDs
- [ ] `RecommendationListCard` composes all sub-components and renders min=3 / max=7 item cases
- [ ] `ChatThread` dispatches `card_type='recommendation_list'` via a type guard (no `any` casts)
- [ ] Save-to-KB callbacks thread from screen → ChatThread → RecommendationListCard → ActionSheet/footer
- [ ] Every interactive element has a `testID` with pattern `{screen}-{component}-{element}`
- [ ] Every new component has 4+ Storybook stories + co-located Vitest tests
- [ ] NO `react-native-paper` imports; NO hardcoded colors/spacing

## Tasks

| ID         | Title                                              | Agent                     | Priority | Effort | Est (min) | Depends On                         |
|------------|----------------------------------------------------|---------------------------|----------|--------|-----------|------------------------------------|
| REC-UI-001 | Types + props contract                             | react-native-ui-implementer | P0     | XS     | 45        | REC-003 (for cardData shape)       |
| REC-UI-002 | RecommendationItem (tel:/maps://geo:)              | react-native-ui-implementer | P0     | M      | 180       | REC-UI-001                         |
| REC-UI-003 | RecommendationSources (collapsible)                | react-native-ui-implementer | P1     | S      | 90        | REC-UI-001                         |
| REC-UI-004 | RecommendationActionSheet (long-press menu)        | react-native-ui-implementer | P1     | S      | 120       | REC-UI-001                         |
| REC-UI-005 | RecommendationListCard (container composition)    | react-native-ui-implementer | P0     | M      | 180       | REC-UI-002, REC-UI-003, REC-UI-004 |
| INT-UI-001 | ChatThread dispatch for recommendation_list        | react-native-ui-implementer | P0     | S      | 120       | REC-UI-005, REC-UI-001             |
| REC-UI-006 | Save-to-KB wiring (per-item + whole list)          | react-native-ui-implementer | P1     | S      | 120       | INT-UI-001                         |

**Total estimate**: ~855 minutes (~14.3 hours)

## Dependency Graph

```
(Epic 2 REC-003 complete)
  │
  └── REC-UI-001 ─┬── REC-UI-002 ─┐
                  ├── REC-UI-003 ─┼── REC-UI-005 ── INT-UI-001 ── REC-UI-006
                  └── REC-UI-004 ─┘
```

Parallelizable: REC-UI-002 + REC-UI-003 + REC-UI-004 all depend only on REC-UI-001.

## Blocks

- (none downstream — Epic 5 and 6 don't depend on Epic 4 components)

## Definition of Done

1. All 7 tasks pass verification gates: `pnpm tsc --noEmit && pnpm lint && pnpm vitest run` + `vitest --project=storybook --run`
2. Human test steps above all pass on a real device (iOS + Android)
3. Dark mode parity verified in Storybook
4. No `react-native-paper` imports anywhere in new files
5. Commit ends at a green tree
