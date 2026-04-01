# Epic 3: AI Summaries

> Epic Sequence: 3
> PRD: .spec/prd/subscriptions-redesign/README.md
> Total Tasks: 4

## Epic Overview

**Epic 3: AI Summaries** - Add AI-generated summaries to feed findings, enabling users to quickly understand content without leaving the feed. Includes summary generation pipeline, storage, and display on cards.

## Human Test Steps

When this epic is complete, users should be able to:

1. View each card with a 2-3 line summary below the title
2. Read summaries that capture the key insight of the content
3. Tap "Read more" to expand truncated summaries
4. Tap "Show less" to collapse expanded summaries
5. See title-only fallback when summary is unavailable
6. Notice that summaries are high quality and factually accurate
7. Understand that summaries help triage content faster

## Task List

| Task ID | Title | Type | Priority | Blocked By |
|---------|-------|------|----------|------------|
| [US-SUMM-001](./US-SUMM-001.md) | Summary Generation Pipeline | FEATURE | P0 | - |
| [US-SUMM-002](./US-SUMM-002.md) | Summary Storage & Retrieval | FEATURE | P0 | US-SUMM-001 |
| [US-SUMM-003](./US-SUMM-003.md) | Summary Display on Cards | FEATURE | P0 | US-SUMM-002, Epic 2 |
| [US-SUMM-004](./US-SUMM-004.md) | Summary Quality Monitoring | FEATURE | P2 | US-SUMM-001 |

## Dependencies

This epic depends on:
- **Epic 2: Multimedia Card Stream** - card components must exist for summary display

This epic blocks:
- **Epic 4: Feedback-Driven Recommendations** - summaries improve feedback quality

## Usage

These task files are designed for execution with `/kb-run-epic`.

```bash
# Execute this epic
/kb-run-epic epic-3-summaries

# Or run with plan-only to see task assignments
/kb-run-epic epic-3-summaries --plan-only
```

## PRD Coverage

This epic covers:
- `02-user-stories.md` - Epic 3: AI Summaries (US-SUMM-001 through US-SUMM-004)
- `03-functional-requirements.md` - FR-3: AI Summaries

## Progress Tracking

| Task | Status | Assignee | Commit |
|------|--------|----------|--------|
| US-SUMM-001 | To Do | convex-implementer | - |
| US-SUMM-002 | To Do | convex-implementer | - |
| US-SUMM-003 | To Do | frontend-designer | - |
| US-SUMM-004 | To Do | convex-implementer | - |
