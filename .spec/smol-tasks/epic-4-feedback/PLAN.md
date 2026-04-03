# Epic 4: Feedback-Driven Recommendations — Smol-Coder Plan

**Stories**: 10 | **Parallel Groups**: 4 | **Est. Files**: 14

| Story | Title | Files | Depends On | Group |
|-------|-------|-------|------------|-------|
| E4-S01 | Integrate FeedbackButtons into VideoCard | 1 | — | 1 |
| E4-S02 | Integrate FeedbackButtons into SocialCard | 1 | — | 1 |
| E4-S03 | Integrate FeedbackButtons into ReleaseCard | 1 | — | 1 |
| E4-S04 | Create feedback mutations (record/undo) | 2 | E4-S01, E4-S02, E4-S03 | 2 |
| E4-S05 | Create feedback queries (history/bulk) | 1 | E4-S04 | 3 |
| E4-S06 | Create user preference analysis | 1 | E4-S05 | 3 |
| E4-S07 | Implement feedback-aware scoring | 1 | E4-S06 | 4 |
| E4-S08 | Create FeedbackHistoryScreen | 2 | E4-S05 | 3 |
| E4-S09 | Add feedback history to Settings | 1 | E4-S08 | 4 |
| E4-S10 | Implement personalization reset | 1 | E4-S07 | 4 |

## Execution Groups

**Group 1** (Parallel): E4-S01, E4-S02, E4-S03 — Integrate FeedbackButtons into cards
**Group 2** (Sequential): E4-S04 — Create backend mutations
**Group 3** (Parallel): E4-S05, E4-S06, E4-S08 — Queries, analysis, history screen
**Group 4** (Parallel): E4-S07, E4-S09, E4-S10 — Scoring, settings link, reset

## Project Conventions Detected

- **Framework**: Expo (React Native) with Expo Router
- **UI Library**: React Native Reusables (shadcn-style) + NativeWind (Tailwind)
- **Import Aliases**: `@/*` maps to project root
- **Component Pattern**: Named exports, interface props with JSDoc, testID prop
- **Styling**: NativeWind className with `cn()` utility, semantic color tokens via `useTheme()`
- **Backend**: Convex with `convex-helpers` patterns
- **Testing**: Vitest with `@testing-library/react`
- **Verify Commands**: `pnpm typecheck`, `pnpm lint`, `pnpm test`

## Status Notes

- **E4-S01, E4-S02, E4-S03**: FeedbackButtons component exists at `components/subscriptions/FeedbackButtons.tsx` but needs integration
- **E4-S04**: Schema has `userFeedback` fields on `feedItems` table — will use existing fields rather than create new table
- **E4-S08**: Route goes at `app/(drawer)/settings/feedback.tsx`
