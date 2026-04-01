# Task Index: Subscriptions Redesign

> Generated: 2026-04-01
> PRD: .spec/prd/subscriptions-redesign/README.md
> Total Epics: 5
> Total Tasks: 25

## Overview

**Subscriptions Redesign** - Transform the What's New feed from text-heavy reports into a rich multimedia card stream with AI summaries and feedback-driven personalization.

## Epic Summary

| Epic | Title | Tasks | Priority | Status |
|------|-------|-------|----------|--------|
| [Epic 1](./epic-1-navigation/INDEX.md) | Navigation Restructuring | 4 | P0 | To Do |
| [Epic 2](./epic-2-cards/INDEX.md) | Multimedia Card Stream | 7 | P0 | **COMPLETE** |
| [Epic 3](./epic-3-summaries/INDEX.md) | AI Summaries | 4 | P0 | To Do |
| [Epic 4](./epic-4-feedback/INDEX.md) | Feedback-Driven Recommendations | 6 | P1 | To Do |
| [Epic 5](./epic-5-infrastructure/INDEX.md) | Cross-Feature Requirements | 4 | P0/P1/P2 | To Do |

## Epic Dependency Graph

```
Epic 1: Navigation (US-NAV-001 → US-NAV-002 → US-NAV-003/004)
    ↓
Epic 2: Cards (COMPLETE) ← Blocks all other epics
    ↓
Epic 3: Summaries (US-SUMM-001 → US-SUMM-002 → US-SUMM-003)
    ↓
Epic 4: Feedback (US-FB-001 → US-FB-002 → US-FB-003/004/006)
    ↓
Epic 5: Infrastructure (parallel with Epics 3 & 4)
```

## Execution Order

### Wave 1: Foundation (COMPLETE)
- ✅ Epic 2: Multimedia Card Stream (US-CARD-001 through US-CARD-007)

### Wave 2: Navigation & Summaries (Ready to Execute)
- **Epic 1: Navigation Restructuring**
  - US-NAV-001: Access What's New from Main Navigation
  - US-NAV-002: Manage Subscriptions from Settings (blocked by US-NAV-001)
  - US-NAV-003: Navigation Change Tooltip (blocked by US-NAV-001)
  - US-NAV-004: Deep Link Redirects (blocked by US-NAV-001, US-NAV-002)

- **Epic 3: AI Summaries**
  - US-SUMM-001: Summary Generation Pipeline
  - US-SUMM-002: Summary Storage & Retrieval (blocked by US-SUMM-001)
  - US-SUMM-003: Summary Display on Cards (blocked by US-SUMM-002)
  - US-SUMM-004: Summary Quality Monitoring (blocked by US-SUMM-001)

### Wave 3: Feedback & Infrastructure
- **Epic 4: Feedback-Driven Recommendations**
  - US-FB-001: Feedback Buttons on Cards
  - US-FB-002: Feedback Data Storage (blocked by US-FB-001)
  - US-FB-003: Feedback-Influenced Scoring (blocked by US-FB-002)
  - US-FB-004: Feedback History Screen (blocked by US-FB-002)
  - US-FB-005: Unobtrusive Feedback UX (blocked by US-FB-001)
  - US-FB-006: Personalized Content Over Time (blocked by US-FB-003)

- **Epic 5: Cross-Feature Requirements**
  - US-X-001: Performance with Rich Media
  - US-X-002: Offline Feed Support
  - US-X-003: Screen Reader Accessibility
  - US-X-004: Content Quality Trust

## Usage

Execute epics in order using `/kb-run-epic`:

```bash
# Wave 1 (COMPLETE)
/kb-run-epic epic-2-cards

# Wave 2 (Ready)
/kb-run-epic epic-1-navigation
/kb-run-epic epic-3-summaries

# Wave 3
/kb-run-epic epic-4-feedback
/kb-run-epic epic-5-infrastructure
```

## PRD Coverage

This plan covers:
- `00-overview.md` - Product vision
- `01-scope.md` - In-scope items only
- `02-user-stories.md` - All user stories (US-NAV-*, US-CARD-*, US-SUMM-*, US-FB-*, US-X-*)
- `03-functional-requirements.md` - All functional requirements (FR-1 through FR-10)
- `04-technical-considerations.md` - Architecture patterns
- `05-success-metrics.md` - Success metrics mapped to acceptance criteria

## Progress Tracking

### Epic 1: Navigation Restructuring
| Task | Status | Assignee | Commit |
|------|--------|----------|--------|
| US-NAV-001 | To Do | frontend-designer | - |
| US-NAV-002 | To Do | frontend-designer | - |
| US-NAV-003 | To Do | frontend-designer | - |
| US-NAV-004 | To Do | frontend-designer | - |

### Epic 2: Multimedia Card Stream
| Task | Status | Assignee | Commit |
|------|--------|----------|--------|
| US-CARD-001 | ✅ Complete | frontend-designer | 885a011 |
| US-CARD-002 | ✅ Complete | frontend-designer | - |
| US-CARD-003 | ✅ Complete | frontend-designer | 8caaf06 |
| US-CARD-004 | ✅ Complete | frontend-designer | e630ece |
| US-CARD-005 | ✅ Complete | frontend-designer | - |
| US-CARD-006 | ✅ Complete | frontend-designer | 87a0acf |
| US-CARD-007 | ✅ Complete | frontend-designer | b56a355 |

### Epic 3: AI Summaries
| Task | Status | Assignee | Commit |
|------|--------|----------|--------|
| US-SUMM-001 | To Do | convex-implementer | - |
| US-SUMM-002 | To Do | convex-implementer | - |
| US-SUMM-003 | To Do | frontend-designer | - |
| US-SUMM-004 | To Do | convex-implementer | - |

### Epic 4: Feedback-Driven Recommendations
| Task | Status | Assignee | Commit |
|------|--------|----------|--------|
| US-FB-001 | To Do | frontend-designer | - |
| US-FB-002 | To Do | convex-implementer | - |
| US-FB-003 | To Do | convex-implementer | - |
| US-FB-004 | To Do | frontend-designer | - |
| US-FB-005 | To Do | frontend-designer | - |
| US-FB-006 | To Do | convex-implementer | - |

### Epic 5: Cross-Feature Requirements
| Task | Status | Assignee | Commit |
|------|--------|----------|--------|
| US-X-001 | To Do | frontend-designer | - |
| US-X-002 | To Do | frontend-designer | - |
| US-X-003 | To Do | frontend-designer | - |
| US-X-004 | To Do | convex-implementer | - |

## Notes

- **Epic 2 is complete** - All card components are implemented and working
- **Run epics in order** - Each epic builds on the previous
- **Wave 2 can run in parallel** - Epic 1 and Epic 3 have no dependencies between them
- **Epic 5 spans multiple waves** - Performance and accessibility are ongoing concerns
