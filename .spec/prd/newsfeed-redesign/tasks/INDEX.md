# Signal Intelligence Newsfeed Sprint Plan

**Generated:** 2026-04-19
**PRD:** `.spec/prd/newsfeed-redesign/README.md`

## Overview

- **Sprints:** 2
- **Total tasks:** 12
- **PRD coverage:** 100%
- **Planning specialists:** react-native-ui-planner + frontend-designer

## Sprint Sequence

| # | Sprint | Tasks | Estimate | Gate |
|---|--------|-------|----------|------|
| 1 | [sprint-01-intelligence-briefing-screen](sprint-01-intelligence-briefing-screen/SPRINT.md) | 8 | ~6h | What's New screen shows editorial briefing with hero card, filter bar, left-border cards |
| 2 | [sprint-02-newsfeed-design-polish](sprint-02-newsfeed-design-polish/SPRINT.md) | 4 | ~1.75h | Pulse animation, press states, skeletons, color-tiered score dots with VoiceOver |

## Dependency Graph

```
sprint-01-intelligence-briefing-screen
  └→ sprint-02-newsfeed-design-polish
```

## Task Dependency Graph (Sprint 1)

```
DESIGN-002 ─┐
NEWSFEED-001 ┤
NEWSFEED-002 ┤→ NEWSFEED-005 → NEWSFEED-006
NEWSFEED-003 ┤
NEWSFEED-004 ─┘
             └→ DESIGN-001 (parallel with NEWSFEED-005)
```

## Files Created by Sprint 1

| File | Status |
|------|--------|
| `components/whats-new/categoryColors.ts` | NEW |
| `components/whats-new/NewsfeedHeader.tsx` | NEW |
| `components/whats-new/NewsfeedHeader.stories.tsx` | NEW |
| `components/whats-new/NewsfeedFilterBar.tsx` | NEW |
| `components/whats-new/NewsfeedFilterBar.stories.tsx` | NEW |
| `components/whats-new/NewsfeedFindingCard.tsx` | NEW |
| `components/whats-new/NewsfeedFindingCard.stories.tsx` | NEW |
| `components/whats-new/NewsfeedHeroCard.tsx` | NEW |
| `components/whats-new/NewsfeedHeroCard.stories.tsx` | NEW |
| `components/whats-new/NewsfeedScreen.tsx` | NEW |
| `app/(drawer)/whats-new/index.tsx` | MODIFIED |

## Files Modified by Sprint 2

| File | Change |
|------|--------|
| `components/whats-new/NewsfeedHeader.tsx` | Add pulse animation to freshness dot |
| `components/whats-new/NewsfeedFilterBar.tsx` | Switch to Pressable with press feedback |
| `components/whats-new/NewsfeedFindingCard.tsx` | Color-tiered score dots + a11y labels |
| `components/whats-new/NewsfeedHeroCard.tsx` | Skeleton variant |
| `components/whats-new/NewsfeedScreen.tsx` | Wire skeleton states |

## Next Steps

  1. Expand Sprint 1 tasks when ready to execute:
       /kb-sprint-tasks-plan .spec/prd/newsfeed-redesign/tasks/sprint-01-intelligence-briefing-screen/

  2. Run Sprint 1:
       /kb-run-sprint sprint-01-intelligence-briefing-screen

  3. After Sprint 1 ships and passes human testing gate, run Sprint 2:
       /kb-run-sprint sprint-02-newsfeed-design-polish
