# Epic 4: Feedback-Driven Recommendations

> Epic Sequence: 4
> PRD: .spec/prd/subscriptions-redesign/README.md
> Total Tasks: 6

## Epic Overview

**Epic 4: Feedback-Driven Recommendations** - Add thumbs up/down feedback buttons to cards, store feedback data, and use it to influence content ranking. Enables personalized feed that improves over time.

## Human Test Steps

When this epic is complete, users should be able to:

1. See thumbs up/down buttons on each card (subtle, non-intrusive)
2. Tap thumbs up to indicate "more like this"
3. Tap thumbs down to indicate "less like this"
4. See visual feedback when button is tapped (filled icon, color change)
5. Tap again to undo feedback
6. View feedback history in Settings
7. Notice feed becomes more personalized over time (10+ feedback signals)

## Task List

| Task ID | Title | Type | Priority | Blocked By |
|---------|-------|------|----------|------------|
| [US-FB-001](./US-FB-001.md) | Feedback Buttons on Cards | FEATURE | P0 | Epic 2 |
| [US-FB-002](./US-FB-002.md) | Feedback Data Storage | FEATURE | P0 | US-FB-001 |
| [US-FB-003](./US-FB-003.md) | Feedback-Influenced Scoring | FEATURE | P1 | US-FB-002 |
| [US-FB-004](./US-FB-004.md) | Feedback History Screen | FEATURE | P2 | US-FB-002 |
| [US-FB-005](./US-FB-005.md) | Unobtrusive Feedback UX | FEATURE | P0 | US-FB-001 |
| [US-FB-006](./US-FB-006.md) | Personalized Content Over Time | FEATURE | P1 | US-FB-003 |

## Dependencies

This epic depends on:
- **Epic 2: Multimedia Card Stream** - card components must exist for feedback buttons
- **Epic 3: AI Summaries** - summaries help users make informed feedback decisions

## Usage

These task files are designed for execution with `/kb-run-epic`.

```bash
# Execute this epic
/kb-run-epic epic-4-feedback

# Or run with plan-only to see task assignments
/kb-run-epic epic-4-feedback --plan-only
```

## PRD Coverage

This epic covers:
- `02-user-stories.md` - Epic 4: Feedback-Driven Recommendations (US-FB-001 through US-FB-006)
- `03-functional-requirements.md` - FR-4: Feedback System

## Progress Tracking

| Task | Status | Assignee | Commit |
|------|--------|----------|--------|
| US-FB-001 | **PARTIAL** | frontend-designer | - |
| US-FB-002 | **To Do** | convex-implementer | - |
| US-FB-003 | **To Do** | convex-implementer | - |
| US-FB-004 | **To Do** | frontend-designer | - |
| US-FB-005 | **To Do** | frontend-designer | - |
| US-FB-006 | **To Do** | convex-implementer | - |

### Status Summary - 2026-04-02

- **0/6 tasks complete** (0%)
- **1/6 tasks partial** (17%) - US-FB-001: FeedbackButtons component exists but not integrated
- **5/6 tasks not started** (83%)

### Key Blockers
1. **US-FB-001 incomplete**: FeedbackButtons not integrated into VideoCard, SocialCard, ReleaseCard
2. **US-FB-002 blocks backend**: No `convex/feedback/` directory, no mutations/queries
3. **No feedback data flow**: Component exists but no way to persist feedback

### Recommended Next Steps
1. **Integrate FeedbackButtons** into all card types (finish US-FB-001)
2. **Create feedback backend** (US-FB-002) - schema decision needed (fields vs table)
3. **Connect UI to backend** with mutations and queries
4. **Implement scoring** (US-FB-003) once data flow exists
