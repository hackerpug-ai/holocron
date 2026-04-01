# Epic 2: Multimedia Card Stream

> Epic Sequence: 2
> PRD: .spec/prd/subscriptions-redesign/README.md
> Tasks: 7
> Status: To Do

## Overview

Transform the What's New feed from text-heavy reports into a rich multimedia card stream with video thumbnails, article hero images, social avatars, and release badges. Each card type is optimized for its content type while maintaining consistent layout and scannability.

## Human Test Steps

When this epic is complete, users should be able to:

1. View video content as visually rich cards with 16:9 thumbnails, duration overlays, and play icons
2. Browse article cards with hero images, 2-3 line summaries, and read time estimates
3. See social posts with circular author avatars, content previews, and engagement metrics
4. Identify releases quickly with version badges and changelog summaries
5. Filter the feed by category using filter chips (All, Video, Articles, Social, Releases)
6. Pull down to refresh the feed and generate new reports
7. Scan the feed quickly with consistent card layout at 60fps scroll performance

## Acceptance Criteria (from PRD)

- All 4 card variants render correctly for their content types
- Fixed height/width for consistent layout
- Pull-to-refresh support working
- Loading skeletons for each variant
- Proper testIDs for all interactive elements
- Images load progressively with fallbacks
- Category filter chips functional with counts
- Feed scrolls smoothly at 60fps

## PRD Sections Covered

- `02-user-stories.md` - Epic 2: Multimedia Card Stream (US-CARD-001 through US-CARD-007)
- `03-functional-requirements.md` - FR-2: Multimedia Card Components
- `03-functional-requirements.md` - FR-5: Feed Functionality
- `03-functional-requirements.md` - FR-6: Images & Media
- `03-functional-requirements.md` - FR-7: Performance & Quality

## Dependencies

This epic blocks the following epics:
- Epic 3: AI Summaries (requires card components to display summaries)
- Epic 4: Feedback-Driven Recommendations (requires card components for feedback buttons)

## Task List

| Task ID | Title | Type | Priority | Blocked By |
|---------|-------|------|----------|------------|
| US-CARD-001 | Video Card Component | FEATURE | P0 | - |
| US-CARD-002 | Article Card Component | FEATURE | P0 | - |
| US-CARD-003 | Social Card Component | FEATURE | P1 | - |
| US-CARD-004 | Release Card Component | FEATURE | P1 | - |
| US-CARD-005 | FeedCard Router Component | FEATURE | P0 | US-CARD-001, US-CARD-002 |
| US-CARD-006 | Category Filter Chips | FEATURE | P0 | US-CARD-005 |
| US-CARD-007 | Feed Screen Integration | FEATURE | P0 | US-CARD-005, US-CARD-006 |
