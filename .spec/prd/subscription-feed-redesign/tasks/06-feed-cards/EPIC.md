# EPIC-06: Feed Item Cards

**Status**: [ ] Complete
**Epic ID**: FR-EPIC-06
**PRD Section**: Phase 2 - Frontend Components (SubscriptionFeedItem)

---

## Human-Testable Deliverables

After completing this epic, a human can:

1. **View video cards**: See video content with thumbnail and duration
2. **View blog cards**: See blog posts with excerpt and read time
3. **View social cards**: See social posts with engagement stats
4. **Tap to open**: Tap card to open content in WebViewSheet

---

## Human Test Steps

1. Open app → navigate to "Subscriptions" feed
2. Find a video feed item — verify thumbnail and duration display
3. Find a blog feed item — verify excerpt and read time display
4. Find a social feed item — verify likes/comments display
5. Tap a card — verify content opens in WebViewSheet
6. Check card styling — verify proper theme colors and spacing
7. Tap viewed item — verify visual distinction (opacity/gray)

---

## Task List

| Task ID | Title | Type | Effort |
|---------|-------|------|--------|
| [FR-022](FR-022.md) | Create SubscriptionFeedItem component base | FEATURE | M |
| [FR-023](FR-023.md) | Implement video card variant | FEATURE | M |
| [FR-024](FR-024.md) | Implement blog card variant | FEATURE | M |
| [FR-025](FR-025.md) | Implement social card variant | FEATURE | M |

---

## Acceptance Criteria (Epic Level)

- [ ] Component switches between 3 variants based on contentType
- [ ] Video cards show thumbnail with duration overlay
- [ ] Blog cards show excerpt with read time
- [ ] Social cards show engagement stats
- [ ] All cards use semantic theme tokens
- [ ] Press feedback (0.98 scale) on all variants
- [ ] Proper testIDs for all interactive elements

---

## Dependencies

**Blocks**: EPIC-07 (Navigation & Filters), EPIC-08 (Webview Integration)
**Requires**: EPIC-01 (Backend), EPIC-05 (Feed Screen)

---

## Notes

- Uses StyleSheet.create for static layout
- Animated press feedback using Reanimated
- Follows theme rules strictly
- Reuses existing components (Avatar, PlatformBadge, etc.)
