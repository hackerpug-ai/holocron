# Epic 6: Remediation - Critical Gaps from Audit

> Epic Sequence: 6
> PRD: .spec/prd/subscriptions-redesign/README.md
> Total Tasks: 7
> Source: Red-hat audit report 2026-04-02

## Epic Overview

**Epic 6: Remediation** - Fix critical gaps identified in the red-hat audit. This epic addresses incomplete work from Epics 1-4 that was claimed complete but missing actual implementation.

**Audit Findings**: Only ~13% of PRD tasks are actually complete despite INDEX.md claiming Epic 2 is "COMPLETE".

## Human Test Steps

When this epic is complete, users should be able to:

1. View all card types (Video, Article, Social, Release) with feedback buttons integrated
2. Tap thumbs up/down on any card and see visual feedback
3. Submit feedback that persists to Convex backend
4. Navigate to old `/subscriptions` URLs and be redirected to correct location
5. See one-time tooltip explaining navigation changes on first visit
6. View article cards with hero images and summaries in the feed

## Critical Gaps Addressed

| Gap | Original Epic | Severity | Fix |
|-----|---------------|----------|-----|
| FeedbackButtons not integrated | Epic 4 | CRITICAL | US-REM-001 through US-REM-003 |
| Missing ArticleCard component | Epic 2 | HIGH | US-REM-004 |
| Deep link redirects missing | Epic 1 | HIGH | US-REM-005 |
| Navigation tooltip missing | Epic 1 | MEDIUM | US-REM-006 |
| Feedback query for current state | Epic 4 | MEDIUM | US-REM-007 |

## Dependencies

This epic has no dependencies - it can run immediately in parallel with other epics.

**However**, this work should be completed BEFORE:
- Epic 3 (Summaries) - summaries rely on card components being complete
- Epic 4 (Feedback) full implementation - this epic completes the foundation

## Task List

| Task ID | Title | Type | Priority | Blocked By |
|---------|-------|------|----------|------------|
| [US-REM-001](./US-REM-001.md) | Add getFeedItemFeedback Query | FEATURE | P0 | - |
| [US-REM-002](./US-REM-002.md) | Integrate FeedbackButtons into VideoCard | FEATURE | P0 | US-REM-001 |
| [US-REM-003](./US-REM-003.md) | Integrate FeedbackButtons into SocialCard & ReleaseCard | FEATURE | P0 | US-REM-002 |
| [US-REM-004](./US-REM-004.md) | Create Missing ArticleCard Component | FEATURE | P0 | - |
| [US-REM-005](./US-REM-005.md) | Implement Deep Link Redirects | FEATURE | P0 | - |
| [US-REM-006](./US-REM-006.md) | Add Navigation Change Tooltip | FEATURE | P1 | US-REM-005 |
| [US-REM-007](./US-REM-007.md) | Update INDEX.md with Actual Status | DOCUMENTATION | P2 | US-REM-001, US-REM-002, US-REM-003, US-REM-004, US-REM-005, US-REM-006 |

## Usage

Execute this epic to fix critical gaps:

```bash
/kb-run-epic epic-6-remediation
```

## PRD Coverage

This epic covers gaps identified in:
- `.spec/reviews/red-hat-prd-audit-2026-04-02.md` - Full audit report
- Epic 2: Multimedia Card Stream (US-CARD-002 missing)
- Epic 4: Feedback-Driven Recommendations (integration incomplete)
- Epic 1: Navigation Restructuring (redirects/tooltip missing)

## Progress Tracking

| Task | Status | Assignee | Commit |
|------|--------|----------|--------|
| US-REM-001 | To Do | convex-implementer | - |
| US-REM-002 | To Do | frontend-designer | - |
| US-REM-003 | To Do | frontend-designer | - |
| US-REM-004 | To Do | frontend-designer | - |
| US-REM-005 | To Do | frontend-designer | - |
| US-REM-006 | To Do | frontend-designer | - |
| US-REM-007 | To Do | product-manager | - |

## Notes

**Why this epic exists**: The red-hat audit revealed that claimed "complete" work was actually incomplete. This epic remedies those gaps before proceeding with new epics.

**Execution order**: This epic should run FIRST or in parallel with Epic 1 and Epic 3, as it unblocks them.

**Success criteria**: All card types have working feedback, old navigation links redirect properly, and documentation reflects reality.
