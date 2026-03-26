# EPIC-05: Feed Screen UI

**Status**: [ ] Complete
**Epic ID**: FR-EPIC-05
**PRD Section**: Phase 2 - Frontend Components (SubscriptionFeedScreen)

---

## Human-Testable Deliverables

After completing this epic, a human can:

1. **View feed screen**: Navigate to subscriptions and see feed of content items
2. **Infinite scroll**: Scroll down to load more feed items
3. **Pull to refresh**: Pull down to refresh feed content
4. **See empty states**: View appropriate empty states when no content

---

## Human Test Steps

1. Open app → navigate to "Subscriptions" tab
2. Verify feed screen displays with feed items
3. Scroll down — verify more items load (infinite scroll)
4. Pull down — verify feed refreshes
5. Mark all items as viewed — verify "all caught up" empty state
6. Check network requests — verify pagination works correctly
7. Rotate device — verify responsive layout

---

## Task List

| Task ID | Title | Type | Effort |
|---------|-------|------|--------|
| [FR-019](FR-019.md) | Create useSubscriptionFeed hook | FEATURE | M |
| [FR-020](FR-020.md) | Create SubscriptionFeedScreen component | FEATURE | L |
| [FR-021](FR-021.md) | Add feed screen to navigation | FEATURE | S |

---

## Acceptance Criteria (Epic Level)

- [ ] Feed screen displays items from api.feeds.getFeed
- [ ] Infinite scroll loads items in batches of 20
- [ ] Pull-to-refresh triggers refetch
- [ ] Empty states display appropriately
- [ ] testIDs present for all interactive elements
- [ ] Component follows theme rules (semantic tokens)

---

## Dependencies

**Blocks**: EPIC-06 (Feed Cards), EPIC-07 (Navigation & Filters)
**Requires**: EPIC-01 (Backend), EPIC-03 (Feed Queries)

---

## Notes

- Uses FlatList for performance
- Implements proper testID attributes
- Follows theme rules (no hardcoded colors/spacing)
- Reuses useWebView hook for opening content
