# EPIC-09: Red-Hat Remediation

**Status**: [ ] Complete
**Epic ID**: FR-EPIC-09
**PRD Section**: Cross-cutting fixes from adversarial review (4-agent red-hat)

---

## Human-Testable Deliverables

After completing this epic, a human can:

1. **See a unified feed screen** with proper card variants (video/blog/social) rendered inline
2. **Infinite scroll and pull-to-refresh** work correctly in the live route
3. **Creator grouping** combines content from the same creator across platforms
4. **Feed builder produces output** for all subscription content (including pre-existing records)
5. **Settings persist** across app restarts
6. **Morning digest** arrives via cron at 9 AM daily
7. **Dark mode** renders correctly with no hardcoded colors or spacing

---

## Human Test Steps

1. Navigate to Subscriptions feed — verify feed screen shows card variants (video with thumbnail+duration, blog with excerpt+read time, social with engagement stats)
2. Scroll down — verify more items load via infinite scroll
3. Pull down — verify feed refreshes with new content
4. Subscribe to a creator with multiple platforms (e.g., YouTube + Twitter) — verify content groups under one feed item
5. Open Convex dashboard — verify `inFeed` field is populated on `subscriptionContent` records
6. Tap settings gear — change a setting — close and reopen — verify setting persisted in Convex
7. Check `convex/crons.ts` — verify morning digest cron at 9 AM exists
8. Toggle dark mode — verify no hardcoded rgba overlays or numeric spacing values visible

---

## Task List

| Task ID | Title | Type | Priority | Effort | Blocked By |
|---------|-------|------|----------|--------|------------|
| [FR-030](FR-030.md) | Unify competing SubscriptionFeedScreen implementations | FEATURE | P0 | L | - |
| [FR-031](FR-031.md) | Wire SubscriptionFeedItem card component into live feed | FEATURE | P0 | M | FR-030 |
| [FR-032](FR-032.md) | Implement real infinite scroll and pull-to-refresh | FEATURE | P0 | M | FR-030 |
| [FR-033](FR-033.md) | Fix feed builder to group by creatorProfileId | INFRA | P0 | M | - |
| [FR-034](FR-034.md) | Initialize inFeed field on subscriptionContent records | INFRA | P0 | S | - |
| [FR-035](FR-035.md) | Implement settings persistence in Convex | FEATURE | P1 | M | - |
| [FR-036](FR-036.md) | Add morning digest cron job | INFRA | P1 | S | - |
| [FR-037](FR-037.md) | Replace hardcoded colors and spacing with semantic tokens | FEATURE | P1 | M | FR-030, FR-031 |

---

## Acceptance Criteria (Epic Level)

- [ ] Single SubscriptionFeedScreen implementation wired to route (no dead code path)
- [ ] SubscriptionFeedItem renders all 3 card variants in the live feed
- [ ] FlatList with cursor-based pagination and pull-to-refresh
- [ ] Feed builder groups by creatorProfileId (not sourceId)
- [ ] `inFeed` field initialized on all subscriptionContent records
- [ ] updateFeedSettings writes to Convex; getFeedSettings reads from Convex
- [ ] Morning digest cron scheduled at 9 AM daily
- [ ] Zero hardcoded rgba() or numeric spacing values in feed components

---

## Dependencies

**Blocks**: None (final remediation epic)
**Requires**: EPIC-01 through EPIC-08 (all prior epics)

---

## Notes

- Findings sourced from 4-agent red-hat review (product-manager, react-native-reviewer, frontend-designer, convex-reviewer)
- All 4 agents independently flagged the dual-implementation and dead-code issues (HIGH confidence)
- 3/4 agents flagged creator grouping, settings persistence, and hardcoded values
- FR-030 is the critical-path task — most other UI fixes depend on having a single canonical screen
