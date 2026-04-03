# Task Index: Subscriptions Redesign

> Generated: 2026-04-01
> Last Updated: 2026-04-02 (audit remediation)
> PRD: .spec/prd/subscriptions-redesign/README.md
> Total Epics: 6
> Total Tasks: 32

## Audit Notice

**⚠️ STATUS UPDATED**: Following red-hat audit 2026-04-02, task statuses have been corrected to reflect actual implementation. Previous INDEX.md claimed Epic 2 was "COMPLETE" but audit found critical gaps.

**See**: `.spec/reviews/red-hat-prd-audit-2026-04-02.md` for full audit report.

## Overview

**Subscriptions Redesign** - Transform the What's New feed from text-heavy reports into a rich multimedia card stream with AI summaries and feedback-driven personalization.

## Epic Summary

| Epic | Title | Tasks | Priority | Status |
|------|-------|-------|----------|--------|
| [Epic 1](./epic-1-navigation/INDEX.md) | Navigation Restructuring | 4 | P0 | **PARTIAL** |
| [Epic 2](./epic-2-cards/INDEX.md) | Multimedia Card Stream | 7 | P0 | **MOSTLY** |
| [Epic 3](./epic-3-summaries/INDEX.md) | AI Summaries | 4 | P0 | To Do |
| [Epic 4](./epic-4-feedback/INDEX.md) | Feedback-Driven Recommendations | 6 | P1 | **PARTIAL** |
| [Epic 5](./epic-5-infrastructure/INDEX.md) | Cross-Feature Requirements | 4 | P0/P1/P2 | Partial |
| [Epic 6](./epic-6-remediation/) | Remediation (Audit Gaps) | 7 | P0 | **ACTIVE** |

## Actual Completion Status

| Epic | Claimed | Actual | Gap | Notes |
|------|---------|---------|-----|-------|
| Epic 1 | To Do | **PARTIAL** | 2 tasks | Label changed, missing redirects/tooltip |
| Epic 2 | COMPLETE | **MOSTLY** | 2 tasks | Missing ArticleCard + feedback integration |
| Epic 3 | To Do | **NOT STARTED** | 4 tasks | UI placeholder exists, no backend |
| Epic 4 | To Do | **PARTIAL** | 5 tasks | Component exists, no backend |
| Epic 5 | 6/24 done | **6/24 done** | 18 tasks | Quality filtering only |
| Epic 6 | N/A | **NEW** | 7 tasks | Addresses audit gaps |

**Total: ~13% complete (not 60% as previously claimed)**

## Epic Dependency Graph

```
Epic 1: Navigation (US-NAV-001 → US-NAV-002 → US-NAV-003/004)
    ↓
Epic 2: Cards (MOSTLY) ← Missing ArticleCard + feedback integration
    ↓
Epic 3: Summaries (US-SUMM-001 → US-SUMM-002 → US-SUMM-003)
    ↓
Epic 4: Feedback (US-FB-001 → US-FB-002 → US-FB-003/004/006)
    ↓
Epic 5: Infrastructure (parallel with Epics 3 & 4)
```

## Execution Order

### Wave 0: Remediation (ACTIVE - Run First)
- **Epic 6: Remediation** (fixes audit gaps, unblocks other epics)
  - US-REM-001: Add getFeedItemFeedback Query
  - US-REM-002: Integrate FeedbackButtons into VideoCard
  - US-REM-003: Integrate FeedbackButtons into SocialCard & ReleaseCard
  - US-REM-004: Create Missing ArticleCard Component
  - US-REM-005: Implement Deep Link Redirects
  - US-REM-006: Add Navigation Change Tooltip
  - US-REM-007: Update INDEX.md with Actual Status

### Wave 1: Foundation (MOSTLY COMPLETE - Missing ArticleCard + feedback)
- ✅ Epic 2: Multimedia Card Stream (US-CARD-001, US-CARD-003 through US-CARD-007)
- ⚠️ US-CARD-002: ArticleCard (MISSING - addressed in Epic 6)
- ⚠️ Feedback integration (MISSING - addressed in Epic 6)

### Wave 2: Navigation & Summaries (Ready to Execute)
- **Epic 1: Navigation Restructuring**
  - US-NAV-001: Access What's New from Main Navigation (✅ Label changed)
  - US-NAV-002: Manage Subscriptions from Settings (⚠️ Needs verification)
  - US-NAV-003: Navigation Change Tooltip (❌ Missing - addressed in Epic 6)
  - US-NAV-004: Deep Link Redirects (❌ Missing - addressed in Epic 6)

- **Epic 3: AI Summaries**
  - US-SUMM-001: Summary Generation Pipeline
  - US-SUMM-002: Summary Storage & Retrieval (blocked by US-SUMM-001)
  - US-SUMM-003: Summary Display on Cards (blocked by US-SUMM-002)
  - US-SUMM-004: Summary Quality Monitoring (blocked by US-SUMM-001)

### Wave 3: Feedback & Infrastructure
- **Epic 4: Feedback-Driven Recommendations**
  - US-FB-001: Feedback Buttons on Cards (⚠️ Component exists, not integrated)
  - US-FB-002: Feedback Data Storage (blocked by US-FB-001 - ❌ Backend missing)
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
# Wave 0 (ACTIVE - Run first or in parallel with Wave 2)
/kb-run-epic epic-6-remediation

# Wave 1 (MOSTLY COMPLETE)
/kb-run-epic epic-2-cards  # ArticleCard missing, addressed in Epic 6

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
| US-NAV-001 | ⚠️ Partial | frontend-designer | - |
| US-NAV-002 | ⚠️ Needs Verification | frontend-designer | - |
| US-NAV-003 | ❌ To Do (Epic 6) | frontend-designer | - |
| US-NAV-004 | ❌ To Do (Epic 6) | frontend-designer | - |

### Epic 2: Multimedia Card Stream
| Task | Status | Assignee | Commit |
|------|--------|----------|--------|
| US-CARD-001 | ✅ Complete | frontend-designer | 885a011 |
| US-CARD-002 | ❌ Missing (Epic 6) | frontend-designer | - |
| US-CARD-003 | ✅ Complete | frontend-designer | 8caaf06 |
| US-CARD-004 | ✅ Complete | frontend-designer | e630ece |
| US-CARD-005 | ✅ Complete | frontend-designer | - |
| US-CARD-006 | ✅ Complete | frontend-designer | 87a0acf |
| US-CARD-007 | ✅ Complete | frontend-designer | b56a355 |

### Epic 3: AI Summaries
| Task | Status | Assignee | Commit |
|------|--------|----------|--------|
| US-SUMM-001 | ❌ To Do | convex-implementer | - |
| US-SUMM-002 | ❌ To Do | convex-implementer | - |
| US-SUMM-003 | ❌ To Do | frontend-designer | - |
| US-SUMM-004 | ❌ To Do | convex-implementer | - |

### Epic 4: Feedback-Driven Recommendations
| Task | Status | Assignee | Commit |
|------|--------|----------|--------|
| US-FB-001 | ⚠️ Partial (Epic 6) | frontend-designer | - |
| US-FB-002 | ❌ To Do (Epic 6) | convex-implementer | - |
| US-FB-003 | ❌ To Do | convex-implementer | - |
| US-FB-004 | ❌ To Do | frontend-designer | - |
| US-FB-005 | ❌ To Do | frontend-designer | - |
| US-FB-006 | ❌ To Do | convex-implementer | - |

### Epic 5: Cross-Feature Requirements
| Task | Status | Assignee | Commit |
|------|--------|----------|--------|
| US-X-001 | ❌ To Do | frontend-designer | - |
| US-X-002 | ❌ To Do | frontend-designer | - |
| US-X-003 | ❌ To Do | frontend-designer | - |
| US-X-004 | ❌ To Do | convex-implementer | - |

### Epic 6: Remediation (Audit Gaps)
| Task | Status | Assignee | Commit |
|------|--------|----------|--------|
| US-REM-001 | ❌ To Do | convex-implementer | - |
| US-REM-002 | ❌ To Do | frontend-designer | - |
| US-REM-003 | ❌ To Do | frontend-designer | - |
| US-REM-004 | ❌ To Do | frontend-designer | - |
| US-REM-005 | ❌ To Do | frontend-designer | - |
| US-REM-006 | ❌ To Do | frontend-designer | - |
| US-REM-007 | ✅ Complete | product-manager | - |

## Notes

- **Epic 2 is MOSTLY complete** - Card components exist but missing ArticleCard and feedback integration
- **Epic 6 addresses gaps** - Remediation fixes audit findings before proceeding with new work
- **Run epics in order** - Each epic builds on the previous
- **Wave 2 can run in parallel** - Epic 1 and Epic 3 have no dependencies between them
- **Epic 5 spans multiple waves** - Performance and accessibility are ongoing concerns
- **Status based on audit** - All statuses reflect actual code audit findings from 2026-04-02
