# Subscription Notification Redesign Plan

## Context

The user currently experiences a "barrage of notifications" when logging in each morning. Individual toast notifications for each new subscription item create notification fatigue and overwhelm.

**Problem**: Too many individual notifications create a poor user experience.
**Solution**: Replace individual toasts with a feed-based digest system with creator-grouped content.

## Key Requirements from User

1. **No more toast bursts** - Create a newsfeed under "subscriptions" tab instead
2. **Settings gear** - Top-right button for subscription management
3. **Creator grouping** - All channels from same creator (e.g., Jaymen West's Twitter/blog/YouTube) under one line item
4. **Bulk unsubscribe** - Unsubscribe action selects all channels by default, with option to unselect specific channels
5. **Feed item cards** - Different variants for video, blog post, social post
6. **Bottom sheet webview** - Reuse existing `WebViewSheet` component for opening content

## UX Research Findings

From best practices research (document ID: `js719zkz0hbty23apvahb5w07183mtgv`):

- **Batching is critical** - 10 new comments should be 1 notification, not 10
- **Match format to urgency** - Use inbox-style feed for non-urgent subscription content
- **User control matters** - Allow filtering, quiet hours, snooze functionality
- **Slow defaults** - Start with fewer notifications, increase based on engagement
- **Digest strategies** - Regular (consistent intervals), Back-off (activity-aware), Scheduled (predictable times)

## Recommended Approach

### Phase 1: Convex Backend Changes

**New Tables:**

1. `feedItems` - Aggregated feed items grouping content by creator
   - Fields: `groupKey`, `title`, `summary`, `contentType`, `itemCount`, `itemIds`, `creatorProfileId`, `subscriptionIds`, `thumbnailUrl`, `viewed`, `viewedAt`, `publishedAt`, `discoveredAt`, `createdAt`
   - Indexes: `by_groupKey`, `by_viewed`, `by_created`, `by_creator`

2. `feedSessions` - Track user reading sessions
   - Fields: `startTime`, `endTime`, `itemsViewed`, `itemsConsumed`, `sessionSource`
   - Indexes: `by_start`, `by_period`

**Schema Extensions:**

- `subscriptionContent` - Add optional fields: `feedItemId`, `inFeed`, `thumbnailUrl`, `duration`, `authorHandle`, `likesCount`, `commentsCount`, `contentCategory`
- `notifications` - Add optional fields: `feedItemIds`, `digestCount`, `digestSummary`, and new `type: "feed_digest"`

**New Endpoints:**

**Queries:**
- `api.feeds.getFeed` - Get feed items with filtering/pagination
- `api.feeds.getByCreator` - Get feed items for specific creator
- `api.feeds.getUnviewedCount` - Get count for badge display
- `api.feeds.getDigestSummary` - Get summary for notification/banner

**Mutations:**
- `api.feeds.markViewed` - Mark items as viewed
- `api.feeds.markAllViewed` - Mark all as viewed
- `api.feeds.createDigestNotification` - Create digest notification

**Actions:**
- `api.feeds.actions.buildFeed` - Build feed from recent content (runs via cron)
- `api.feeds.actions.sendDigestNotification` - Send digest notification

**Cron Jobs:**
- Build feed every 2 hours
- Send morning digest at 9 AM daily

**Files to Create:**
- `convex/feeds/validators.ts`
- `convex/feeds/queries.ts`
- `convex/feeds/mutations.ts`
- `convex/feeds/internal.ts`
- `convex/feeds/actions.ts`

### Phase 2: Frontend Components

**New Components:**

1. `components/subscriptions/SubscriptionFeedScreen.tsx` - Main feed container
   - FlatList with infinite scroll
   - Pull-to-refresh
   - Search and filter support
   - Empty states

2. `components/subscriptions/SubscriptionFeedItem.tsx` - Multi-variant feed card
   - Video variant: thumbnail with duration overlay, title, metadata
   - Blog variant: title, excerpt, read time, date
   - Social variant: content preview, engagement stats
   - Uses `StyleSheet.create` for static layout
   - Animated press feedback (0.98 scale)
   - Proper `testID` attributes

3. `components/subscriptions/SubscriptionFeedFilters.tsx` - Horizontal filter chips
   - Reuses existing `FilterChip` component
   - Shows counts per type
   - Filters: All, Video, Blog, Social

4. `components/subscriptions/SubscriptionSettingsModal.tsx` - Settings modal
   - Notification preferences (push, in-app)
   - Display options (thumbnails, auto-play)
   - Content filters
   - Link to manage subscriptions

**New Hook:**

5. `hooks/use-subscription-feed.ts` - Feed data fetching
   - Filtering by type and search
   - Pagination
   - Type transformations

**Enhancements to Existing:**

6. Enhance `SectionHeader` to support settings gear action button

### Phase 3: Navigation & Routing

**Route Changes:**

- Current: `/subscriptions` - Shows grouped subscription management (keep this)
- New: `/subscriptions/feed` - Shows feed of content items (NEW)

**Or Consider:**
- Keep `/subscriptions` as management view
- Add "Feed" tab in main app navigation

### Phase 4: Webview Consistency

**Audit and Standardize:**

Current webview implementations found:
- `components/webview/WebViewSheet.tsx` - Bottom sheet modal (PRIMARY)
- `screens/WebViewScreen.tsx` - Full screen webview
- `app/webview/[url].tsx` - Route-based webview
- `hooks/useWebView.ts` - Hook for opening webview

**Action:**
- All subscription feed item clicks should use `WebViewSheet` via `useWebView` hook
- Ensure consistent behavior across all content types
- Document the single correct pattern in code comments

## Implementation Order

1. **Backend first** - Schema changes, validators, queries, mutations
2. **Feed building** - Cron jobs to aggregate content
3. **Frontend components** - Feed screen, cards, filters
4. **Navigation** - Add feed route and settings modal
5. **Webview audit** - Ensure all use `WebViewSheet` consistently
6. **Testing** - E2E tests for feed filtering, card interactions, settings

## Verification

**Backend:**
- `pnpm tsc --noEmit` - Type check passes
- Feed items are created by cron
- Queries return correct filtered results
- Mutations update viewed state correctly

**Frontend:**
- Feed displays with all card variants
- Filters work correctly
- Search filters content
- Settings modal opens/closes
- Feed items open in `WebViewSheet`
- Empty states display appropriately

**Manual Testing:**
- Subscribe to multiple creators with multiple channels
- Wait for feed aggregation (or trigger manually)
- Verify content groups by creator
- Test bulk unsubscribe flow
- Test card variants render correctly

## Key Files to Modify

### Backend
- `convex/schema.ts` - Add new tables and extend existing
- `convex/feeds/*` - New directory with all feed logic

### Frontend
- `app/subscriptions.tsx` - May need to add feed tab/link
- `components/subscriptions/*` - Add new feed components
- `hooks/use-subscription-feed.ts` - New hook
- `components/SectionHeader.tsx` - Add gear button support

### Existing to Reference
- `screens/subscriptions-screen.tsx` - For patterns
- `components/subscriptions/CreatorGroupCard.tsx` - For grouping patterns
- `components/webview/WebViewSheet.tsx` - Reuse for content opening
- `hooks/useWebView.ts` - Use for navigation

## Migration Notes

- **Safe, additive changes** - New tables are optional initially
- **Optional fields** - Schema extensions use `v.optional()` for backward compatibility
- **No breaking changes** - Existing subscription system continues to work
- **Gradual rollout** - Can enable feed building for users incrementally
