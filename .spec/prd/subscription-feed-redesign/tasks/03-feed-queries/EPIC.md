# EPIC-03: Feed Query Layer

**Status**: [ ] Complete
**Epic ID**: FR-EPIC-03
**PRD Section**: Phase 1 - Convex Backend Changes (Queries)

---

## Human-Testable Deliverables

After completing this epic, a human can:

1. **Fetch feed items**: Call `api.feeds.getFeed` with pagination and filters
2. **Filter by creator**: Call `api.feeds.getByCreator` to get items for specific creator
3. **Get unviewed count**: Call `api.feeds.getUnviewedCount` for badge display
4. **Get digest summary**: Call `api.feeds.getDigestSummary` for notification content

---

## Human Test Steps

1. Open Convex dashboard → navigate to "Functions"
2. Run `api.feeds.getFeed` with `{limit: 10}` — verify items returned
3. Run `api.feeds.getFeed` with `{contentType: "video"}` — verify filter works
4. Run `api.feeds.getByCreator` with creator ID — verify creator-specific items
5. Run `api.feeds.getUnviewedCount` — verify count for badge
6. Run `api.feeds.getDigestSummary` — verify summary text generation
7. Check query performance — verify response time < 1s

---

## Task List

| Task ID | Title | Type | Effort |
|---------|-------|------|--------|
| [FR-011](FR-011.md) | Create getFeed query with pagination | INFRA | M |
| [FR-012](FR-012.md) | Create getByCreator query | INFRA | S |
| [FR-013](FR-013.md) | Create getUnviewedCount query | INFRA | S |
| [FR-014](FR-014.md) | Create getDigestSummary query | INFRA | M |

---

## Acceptance Criteria (Epic Level)

- [ ] getFeed supports pagination, filtering by type/viewed status
- [ ] getByCreator returns items for specific creator
- [ ] getUnviewedCount returns accurate badge count
- [ ] getDigestSummary generates human-readable summary
- [ ] All queries use proper indexes for performance

---

## Dependencies

**Blocks**: EPIC-04 (Feed Mutations), EPIC-05 (Feed Screen UI)
**Requires**: EPIC-01 (Backend Foundation), EPIC-02 (Feed Building)

---

## Notes

- All queries are public (exported from index.ts)
- Use proper indexes for performance
- Return types should be well-defined
- Consider adding cursor-based pagination for large feeds
