# EPIC-07: Navigation, Filters & Settings

**Status**: [ ] Complete
**Epic ID**: FR-EPIC-07
**PRD Section**: Phase 2 - Frontend Components (Filters & Settings), Phase 3 (Navigation)

---

## Human-Testable Deliverables

After completing this epic, a human can:

1. **Filter feed by type**: Tap filter chips to show video/blog/social only
2. **Open settings modal**: Tap gear icon to open feed settings
3. **Configure preferences**: Set notification and display options
4. **Navigate to feed**: Access feed via subscriptions tab or dedicated route

---

## Human Test Steps

1. Open app → navigate to "Subscriptions" feed
2. Tap "Video" filter chip — verify only video items show
3. Tap "All" filter chip — verify all items show
4. Tap settings gear — verify settings modal opens
5. Toggle "Enable notifications" — verify preference saves
6. Toggle "Show thumbnails" — verify feed updates
7. Check navigation — verify feed route works

---

## Task List

| Task ID | Title | Type | Effort |
|---------|-------|------|--------|
| [FR-026](FR-026.md) | Create SubscriptionFeedFilters component | FEATURE | M |
| [FR-027](FR-027.md) | Create SubscriptionSettingsModal component | FEATURE | M |
| [FR-028](FR-028.md) | Add feed route and navigation | FEATURE | S |

---

## Acceptance Criteria (Epic Level)

- [ ] Filter chips show correct counts per type
- [ ] Filters work correctly with feed query
- [ ] Settings modal opens/closes with proper animation
- [ ] Settings persist to Convex
- [ ] Feed route accessible via navigation
- [ ] SectionHeader supports gear button action

---

## Dependencies

**Blocks**: EPIC-08 (Webview Integration)
**Requires**: EPIC-01 (Backend), EPIC-03 (Feed Queries), EPIC-05 (Feed Screen)

---

## Notes

- Reuse existing FilterChip component
- Settings modal uses Portal/Modal pattern
- Navigation can be /subscriptions/feed or separate tab
- SectionHeader enhancement is small but important
