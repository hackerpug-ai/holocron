# Epic 1: Navigation Restructuring

**Sequence:** 1
**PRD Sections:** US-NAV-001, US-NAV-002, US-NAV-003, US-NAV-004

## Theme

Move subscription management from primary navigation to Settings, and rename the drawer item to "What's New" to reflect its role as the content feed.

## Human Test Steps

When this epic is complete, users should be able to:

1. Open the app and see "What's New" in the drawer
2. Tap "What's New" to access the multimedia feed
3. Navigate to Settings and find "Subscriptions" section
4. Manage subscriptions from Settings
5. See a one-time tooltip explaining navigation changes
6. Use existing deep links and be redirected correctly

## Dependencies

**Blocks:** Epic 2 (Cards), Epic 3 (Feed)

## Task List

| Task ID | Title | Type | Priority | Blocked By |
|---------|-------|------|----------|------------|
| US-NAV-001 | Rename drawer to What's New | FEATURE | P0 | - |
| US-NAV-002 | Add subscriptions to Settings | FEATURE | P0 | US-NAV-001 |
| US-NAV-003 | Navigation change tooltip | FEATURE | P1 | US-NAV-001 |
| US-NAV-004 | Deep link redirects | FEATURE | P0 | - |
