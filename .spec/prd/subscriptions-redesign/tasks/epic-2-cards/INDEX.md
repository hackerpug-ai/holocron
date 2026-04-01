# Task Index: Epic 2 - Cards

> Generated: 2026-04-01
> PRD: .spec/prd/subscriptions-redesign/README.md
> Total Tasks: 7
> Epic Sequence: 2

## Epic Overview

**Epic 2: Multimedia Card Stream** - Transform the What's New feed from text-heavy reports into a rich multimedia card stream with video thumbnails, article hero images, social avatars, and release badges.

## Human Test Steps

When this epic is complete, users should be able to:

1. View video content as visually rich cards with 16:9 thumbnails, duration overlays, and play icons
2. Browse article cards with hero images, 2-3 line summaries, and read time estimates
3. See social posts with circular author avatars, content previews, and engagement metrics
4. Identify releases quickly with version badges and changelog summaries
5. Filter the feed by category using filter chips (All, Video, Articles, Social, Releases)
6. Pull down to refresh the feed and generate new reports
7. Scan the feed quickly with consistent card layout at 60fps scroll performance

## Task List

| Task ID | Title | Type | Priority | Blocked By |
|---------|-------|------|----------|------------|
| [US-CARD-001](./US-CARD-001.md) | Video Card Component | FEATURE | P0 | - |
| [US-CARD-002](./US-CARD-002.md) | Article Card Component | FEATURE | P0 | - |
| [US-CARD-003](./US-CARD-003.md) | Social Card Component | FEATURE | P1 | - |
| [US-CARD-004](./US-CARD-004.md) | Release Card Component | FEATURE | P1 | - |
| [US-CARD-005](./US-CARD-005.md) | FeedCard Router Component | FEATURE | P0 | US-CARD-001, US-CARD-002 |
| [US-CARD-006](./US-CARD-006.md) | Category Filter Chips | FEATURE | P0 | US-CARD-005 |
| [US-CARD-007](./US-CARD-007.md) | Feed Screen Integration | FEATURE | P0 | US-CARD-005, US-CARD-006 |

## Dependencies

This epic blocks:
- **Epic 3: AI Summaries** - requires card components to display summaries
- **Epic 4: Feedback-Driven Recommendations** - requires card components for feedback buttons

## Usage

These task files are designed for execution with `/kb-run-epic`.

```bash
# Execute this epic
/kb-run-epic epic-2-cards

# Or run with plan-only to see task assignments
/kb-run-epic epic-2-cards --plan-only
```

## PRD Coverage

This epic covers:
- `02-user-stories.md` - Epic 2: Multimedia Card Stream (US-CARD-001 through US-CARD-007)
- `03-functional-requirements.md` - FR-2: Multimedia Card Components
- `03-functional-requirements.md` - FR-5: Feed Functionality
- `03-functional-requirements.md` - FR-6: Images & Media
- `03-functional-requirements.md` - FR-7: Performance & Quality

## Progress Tracking

| Task | Status | Assignee | Commit |
|------|--------|----------|--------|
| US-CARD-001 | To Do | react-native-ui-implementer | - |
| US-CARD-002 | To Do | react-native-ui-implementer | - |
| US-CARD-003 | To Do | react-native-ui-implementer | - |
| US-CARD-004 | To Do | react-native-ui-implementer | - |
| US-CARD-005 | To Do | react-native-ui-implementer | - |
| US-CARD-006 | To Do | react-native-ui-implementer | - |
| US-CARD-007 | To Do | react-native-ui-implementer | - |
