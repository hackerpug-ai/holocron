# EPIC-04: Feed Mutations

**Status**: [ ] Complete
**Epic ID**: FR-EPIC-04
**PRD Section**: Phase 1 - Convex Backend Changes (Mutations)

---

## Human-Testable Deliverables

After completing this epic, a human can:

1. **Mark items as viewed**: Call `api.feeds.markViewed` to update feed item status
2. **Mark all as viewed**: Call `api.feeds.markAllViewed` for bulk clear
3. **Create digest notifications**: Call `api.feeds.createDigestNotification` for daily digest

---

## Human Test Steps

1. Open Convex dashboard → navigate to "Functions"
2. Run `api.feeds.markViewed` with feed item IDs — verify `viewed: true` set
3. Run `api.feeds.markAllViewed` — verify all items marked as viewed
4. Run `api.feeds.getUnviewedCount` — verify count is 0 after markAllViewed
5. Run `api.feeds.createDigestNotification` — verify notification created
6. Check `notifications` table — verify feed_digest type notification exists

---

## Task List

| Task ID | Title | Type | Effort |
|---------|-------|------|--------|
| [FR-015](FR-015.md) | Create markViewed mutation | INFRA | M |
| [FR-016](FR-016.md) | Create markAllViewed mutation | INFRA | S |
| [FR-017](FR-017.md) | Create createDigestNotification mutation | INFRA | M |
| [FR-018](FR-018.md) | Update feeds index exports | INFRA | XS |

---

## Acceptance Criteria (Epic Level)

- [ ] markViewed updates single or multiple items
- [ ] markAllViewed updates all unviewed items
- [ ] createDigestNotification creates feed_digest notification
- [ ] All mutations update viewedAt timestamp
- [ ] Index exports updated with new mutations

---

## Dependencies

**Blocks**: EPIC-05 (Feed Screen UI), EPIC-07 (Navigation & Filters)
**Requires**: EPIC-01 (Backend Foundation), EPIC-02 (Feed Building)

---

## Notes

- Mutations should be idempotent
- Update viewedAt timestamp for analytics
- Consider rate limiting for markAllViewed
- createDigestNotification should use summary query
