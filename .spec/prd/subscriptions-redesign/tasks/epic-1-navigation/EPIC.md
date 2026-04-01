# Epic 1: Navigation Restructuring

> Epic Sequence: 1
> PRD: .spec/prd/subscriptions-redesign/README.md
> Total Tasks: 4

## Epic Overview

**Epic 1: Navigation Restructuring** - Move subscriptions management from main drawer to Settings, rename "Subscriptions" to "What's New", and add deep link redirects for backward compatibility.

## Human Test Steps

When this epic is complete, users should be able to:

1. Open the drawer and see "What's New" instead of "Subscriptions"
2. Tap "What's New" and see the multimedia feed (not subscription management)
3. Navigate to Settings and find "Subscriptions" section
4. Tap "Subscriptions" in Settings to manage their subscriptions
5. Use old deep links (/subscriptions, /subscriptions/feed) and be redirected correctly
6. See a one-time tooltip explaining the navigation change (first visit only)
7. Dismiss the tooltip and never see it again

## Task List

| Task ID | Title | Type | Priority | Blocked By |
|---------|-------|------|----------|------------|
| [US-NAV-001](./US-NAV-001.md) | Access What's New from Main Navigation | FEATURE | P0 | - |
| [US-NAV-002](./US-NAV-002.md) | Manage Subscriptions from Settings | FEATURE | P0 | US-NAV-001 |
| [US-NAV-003](./US-NAV-003.md) | Navigation Change Tooltip | FEATURE | P1 | US-NAV-001 |
| [US-NAV-004](./US-NAV-004.md) | Deep Link Redirects | FEATURE | P0 | US-NAV-001, US-NAV-002 |

## Dependencies

This epic blocks:
- **Epic 2: Multimedia Card Stream** - requires What's New route to exist
- **Epic 3: AI Summaries** - requires feed screen to be accessible
- **Epic 4: Feedback-Driven Recommendations** - requires feed screen

## Usage

These task files are designed for execution with `/kb-run-epic`.

```bash
# Execute this epic
/kb-run-epic epic-1-navigation

# Or run with plan-only to see task assignments
/kb-run-epic epic-1-navigation --plan-only
```

## PRD Coverage

This epic covers:
- `02-user-stories.md` - Epic 1: Navigation Restructuring (US-NAV-001 through US-NAV-004)
- `03-functional-requirements.md` - FR-1: Navigation & Routing

## Progress Tracking

| Task | Status | Assignee | Commit |
|------|--------|----------|--------|
| US-NAV-001 | To Do | frontend-designer | - |
| US-NAV-002 | To Do | frontend-designer | - |
| US-NAV-003 | To Do | frontend-designer | - |
| US-NAV-004 | To Do | frontend-designer | - |
