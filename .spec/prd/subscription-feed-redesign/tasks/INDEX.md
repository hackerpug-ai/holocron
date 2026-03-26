# Subscription Feed Redesign - Epic Index

**PRD Location**: `.spec/prd/subscription-feed-redesign/README.md`
**Task Directory**: `.spec/prd/subscription-feed-redesign/tasks/`

## Epic Sequence

This redesign is organized into **8 epics**, each delivering human-testable functionality:

1. **[EPIC-01: Backend Foundation](01-backend-foundation/)** - Schema, validators, and basic queries
2. **[EPIC-02: Feed Building System](02-feed-building/)** - Cron jobs and feed aggregation
3. **[EPIC-03: Feed Query Layer](03-feed-queries/)** - Queries for fetching and filtering feed items
4. **[EPIC-04: Feed Mutations](04-feed-mutations/)** - Mark viewed, manage feed state
5. **[EPIC-05: Feed Screen UI](05-feed-screen/)** - Main feed screen with infinite scroll
6. **[EPIC-06: Feed Item Cards](06-feed-cards/)** - Multi-variant cards (video/blog/social)
7. **[EPIC-07: Feed Navigation & Filters](07-navigation-filters/)** - Routing, settings modal, filter chips
8. **[EPIC-08: Webview Integration](08-webview-integration/)** - Consistent WebViewSheet usage for all content

## Dependencies

```
EPIC-01 (Backend Foundation)
    ↓
EPIC-02 (Feed Building) → EPIC-03 (Feed Queries) → EPIC-04 (Feed Mutations)
                                                    ↓
EPIC-05 (Feed Screen) ← EPIC-06 (Feed Cards) ← EPIC-07 (Navigation & Filters)
                                                    ↓
                                            EPIC-08 (Webview Integration)
```

## Task Count Summary

| Epic | Tasks | Focus |
|------|-------|-------|
| EPIC-01 | 6 | Schema + validators |
| EPIC-02 | 4 | Feed aggregation |
| EPIC-03 | 4 | Feed queries |
| EPIC-04 | 4 | Feed mutations |
| EPIC-05 | 3 | Feed screen UI |
| EPIC-06 | 4 | Feed card components |
| EPIC-07 | 3 | Navigation + settings |
| EPIC-08 | 1 | Webview consistency |
| **Total** | **29** | Full feature delivery |

## Testing Strategy

### Backend Epics (01-04)
- **Test Command**: `pnpm tsc --noEmit` (type check only for Convex)
- **Verification**: Manual testing via Convex dashboard
- **Evidence**: Type check passes, schema validates

### Frontend Epics (05-08)
- **Test Command**: `pnpm test` (vitest)
- **Verification**: Component rendering, user interactions
- **Evidence**: Tests pass, screenshots/manual testing

## Manual Testing Per Epic

Each epic includes a **Human Test Steps** section in its `EPIC.md` file:
1. Open the app/Convex dashboard
2. Follow numbered test steps
3. Verify expected outcomes
4. Report any blockers

## Usage

```bash
# Run all tasks in an epic (using kb-run-epic skill)
/kb-run-epic .spec/prd/subscription-feed-redesign/tasks/01-backend-foundation

# View epic details
cat .spec/prd/subscription-feed-redesign/tasks/01-backend-foundation/EPIC.md

# View individual task
cat .spec/prd/subscription-feed-redesign/tasks/01-backend-foundation/FR-001.md
```

## Progress Tracking

Mark epic completion in `EPIC.md` files:
- [ ] Epic Complete
- [x] Epic Complete

---

**Generated**: 2026-03-26
**Status**: Planning Complete
