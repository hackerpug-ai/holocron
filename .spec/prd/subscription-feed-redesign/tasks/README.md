# Subscription Feed Redesign - Task Breakdown

**Generated**: 2026-03-26
**Total Epics**: 8
**Total Tasks**: 29
**Estimated Effort**: Medium (2-3 weeks)

---

## Quick Start

```bash
# View epic index
cat .spec/prd/subscription-feed-redesign/tasks/INDEX.md

# Run specific epic (using kb-run-epic skill)
/kb-run-epic .spec/prd/subscription-feed-redesign/tasks/01-backend-foundation

# View epic details
cat .spec/prd/subscription-feed-redesign/tasks/01-backend-foundation/EPIC.md

# View individual task
cat .spec/prd/subscription-feed-redesign/tasks/01-backend-foundation/FR-001.md
```

---

## Epic Overview

| Epic | Tasks | Focus | Effort | Dependencies |
|------|-------|-------|--------|--------------|
| **01 - Backend Foundation** | 6 | Schema + validators | M | None |
| **02 - Feed Building** | 4 | Cron + aggregation | M | Epic 01 |
| **03 - Feed Queries** | 4 | Query layer | M | Epic 01, 02 |
| **04 - Feed Mutations** | 4 | Mutations | M | Epic 01, 02 |
| **05 - Feed Screen** | 3 | Main feed UI | L | Epic 01, 03 |
| **06 - Feed Cards** | 4 | Card components | L | Epic 01, 05 |
| **07 - Navigation & Filters** | 3 | Routing + settings | M | Epic 01, 03, 05 |
| **08 - Webview Integration** | 1 | Consistency check | M | Epic 01, 06 |

---

## Task Naming Convention

- **FR-XXX**: Feed Redesign tasks (FR-001 through FR-029)
- Each task has its own markdown file in the epic directory
- Tasks follow v4.0 TDD-integrated template format

---

## Implementation Order

### Phase 1: Backend (Epics 01-04)
1. **EPIC-01**: Backend Foundation — Schema changes, validators
2. **EPIC-02**: Feed Building — Cron jobs, aggregation logic
3. **EPIC-03**: Feed Queries — Read operations
4. **EPIC-04**: Feed Mutations — Write operations

### Phase 2: Frontend (Epics 05-08)
5. **EPIC-05**: Feed Screen — Main feed UI with infinite scroll
6. **EPIC-06**: Feed Cards — Multi-variant card components
7. **EPIC-07**: Navigation & Filters — Routing, settings, filters
8. **EPIC-08**: Webview Integration — Consistent WebViewSheet usage

---

## Task Template Version

All tasks use **v4.0 TDD-Integrated Template**:
- RED → GREEN → REFACTOR cycle per acceptance criterion
- Orchestrator verification gates
- Per-AC TDD_STATE tracking
- Evidence bundle requirements

---

## Verification Strategy

### Backend Tasks (INFRA type)
- **Primary**: `pnpm tsc --noEmit` (type check)
- **Secondary**: Convex dashboard inspection
- **Evidence**: Type check output, schema validation

### Frontend Tasks (FEATURE type)
- **Primary**: `pnpm test` (vitest)
- **Secondary**: Component rendering tests
- **Evidence**: Test results, screenshots

---

## Human Testing Gates

Each epic includes **Human Test Steps** in its `EPIC.md`:

1. Epic complete → Mark tasks as done
2. Follow numbered test steps in EPIC.md
3. Verify expected outcomes
4. Report any blockers
5. Mark epic as [x] Complete

---

## Progress Tracking

Update epic status in each `EPIC.md`:

```markdown
**Status**: [x] Complete  # Change from [ ] to [x]
```

Track task completion via task status field:

```markdown
STATUS: Done  # Change from Backlog → To Do → In Progress → Done
```

---

## Dependencies

```
EPIC-01 (Foundation)
    ↓
EPIC-02 (Feed Building)
    ↓
EPIC-03 (Queries) ← EPIC-04 (Mutations)
    ↓
EPIC-05 (Feed Screen)
    ↓
EPIC-06 (Cards) ← EPIC-07 (Nav/Filters)
    ↓
EPIC-08 (Webview)
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Schema migration issues | All changes use v.optional() (backward compatible) |
| Performance with large feeds | Pagination, proper indexes |
| Inconsistent UI | Theme rules, component reuse |
| Webview complexity | Reuse existing WebViewSheet/useWebView |

---

## Rollout Strategy

1. **Phase 1 (Backend)**: Deploy schema + validators → Monitor dashboard
2. **Phase 2 (Feed Building)**: Enable cron → Verify feed creation
3. **Phase 3 (Queries/Mutations)**: Test API endpoints
4. **Phase 4 (Frontend)**: Deploy UI changes → Monitor UX
5. **Phase 5 (Refinement)**: Address feedback, polish

---

## Support Files

- `INDEX.md` — Epic navigation index
- `MIGRATION-SAFETY.md` — Schema change verification (created in Epic 01)
- Each epic directory contains `EPIC.md` + task files

---

## Questions?

Refer to:
- **PRD**: `.spec/prd/subscription-feed-redesign/README.md`
- **Task Templates**: `brain/docs/kanban/TASK-TEMPLATE.md`
- **TDD Methodology**: `brain/docs/TDD-METHODOLOGY.md`
