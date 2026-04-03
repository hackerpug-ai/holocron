# Task Index: Epic 6 - Remediation

> Generated: 2026-04-02
> Source: Red-hat audit report
> Total Tasks: 7

## Epic Overview

**Epic 6: Remediation** - Fix critical gaps identified in the red-hat audit. This epic addresses incomplete work from Epics 1-4 that was claimed complete but missing actual implementation.

## Task List

| Task ID | Title | Type | Priority | Status | Estimate |
|---------|-------|------|----------|--------|----------|
| [US-REM-001](./US-REM-001.md) | Add getFeedItemFeedback Query | FEATURE | P0 | To Do | 30 min |
| [US-REM-002](./US-REM-002.md) | Integrate FeedbackButtons into VideoCard | FEATURE | P0 | To Do | 60 min |
| [US-REM-003](./US-REM-003.md) | Integrate FeedbackButtons into SocialCard & ReleaseCard | FEATURE | P0 | To Do | 45 min |
| [US-REM-004](./US-REM-004.md) | Create Missing ArticleCard Component | FEATURE | P0 | To Do | 90 min |
| [US-REM-005](./US-REM-005.md) | Implement Deep Link Redirects | FEATURE | P0 | To Do | 45 min |
| [US-REM-006](./US-REM-006.md) | Add Navigation Change Tooltip | FEATURE | P1 | To Do | 60 min |
| [US-REM-007](./US-REM-007.md) | Update INDEX.md with Actual Status | DOCUMENTATION | P2 | To Do | 20 min |

**Total Estimate**: 350 minutes (~6 hours)

## Dependencies

```
US-REM-001 (Backend query)
    ↓
US-REM-002 (VideoCard integration)
    ↓
US-REM-003 (SocialCard/ReleaseCard integration)

US-REM-004 (ArticleCard) - can run parallel

US-REM-005 (Redirects)
    ↓
US-REM-006 (Tooltip)

US-REM-007 (Documentation) - runs last
```

## Execution Order

1. **Parallel Start**:
   - US-REM-001 (Backend query)
   - US-REM-004 (ArticleCard - independent)
   - US-REM-005 (Redirects - independent)

2. **Sequential**:
   - US-REM-002 (VideoCard - needs query)
   - US-REM-003 (Other cards - needs VideoCard pattern)
   - US-REM-006 (Tooltip - needs redirects)

3. **Final**:
   - US-REM-007 (Update docs)

## Usage

Execute this epic to fix critical gaps:

```bash
/kb-run-epic epic-6-remediation
```

## Audit Coverage

This epic addresses gaps identified in:
- `.spec/reviews/red-hat-prd-audit-2026-04-02.md`

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
