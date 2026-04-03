# Smol-Coder Roadmap

**Epics**: 1 | **Total Stories**: 10 | **Parallel Groups**: 4

## Execution Order

### Phase 1: Epic 4 — Feedback-Driven Recommendations

#### Group 1 (Parallel): Card Integration
| Story | Title | Files |
|-------|-------|-------|
| E4-S01 | Integrate FeedbackButtons into VideoCard | 1 |
| E4-S02 | Integrate FeedbackButtons into SocialCard | 1 |
| E4-S03 | Integrate FeedbackButtons into ReleaseCard | 1 |

#### Group 2 (Sequential): Backend Mutations
| Story | Title | Files |
|-------|-------|-------|
| E4-S04 | Create feedback mutations (record/undo) | 2 |

#### Group 3 (Parallel): Queries + Analysis + History Screen
| Story | Title | Files |
|-------|-------|-------|
| E4-S05 | Create feedback queries (history/bulk) | 1 |
| E4-S06 | Create user preference analysis | 1 |
| E4-S08 | Create FeedbackHistoryScreen | 2 |

#### Group 4 (Parallel): Scoring + Settings + Reset
| Story | Title | Files |
|-------|-------|-------|
| E4-S07 | Implement feedback-aware scoring | 1 |
| E4-S09 | Add feedback history to Settings | 1 |
| E4-S10 | Implement personalization reset | 1 |

## Dependency Graph

```
E4-S01 ───┐
E4-S02 ───┤
E4-S03 ───┴─> E4-S04 ─> E4-S05 ─> E4-S06 ─> E4-S07 ─┐
                      │                          │
                      └────────> E4-S08 ──────> E4-S09 │
                                                 │
                                                 └─> E4-S10
```

## Project Context

**Workspace**: `/Users/justinrich/Projects/holocron`

**Framework**: Expo (React Native) + Expo Router
**Backend**: Convex
**UI Library**: React Native Reusables (shadcn-style) + NativeWind
**Test Framework**: Vitest
**Verify Commands**:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`

**Import Aliases**:
- `@/*` → project root

**Key Conventions**:
- Named exports for components
- Interface props with JSDoc comments
- testID prop for E2E testing
- `cn()` utility for className merging
- `useTheme()` hook for semantic colors
- Convex-helpers patterns for backend

## Status Notes

- **E4-S01, E4-S02, E4-S03**: FeedbackButtons component exists at `components/subscriptions/FeedbackButtons.tsx` but needs integration
- **Schema Decision**: Using existing `userFeedback`/`userFeedbackAt` fields on `feedItems` table rather than creating separate table
- **Route**: Feedback history screen goes at `app/(drawer)/settings/feedback.tsx`
