# Subscriptions Redesign - Functional Requirements

## FR-1: Navigation & Routing

### FR-1.1: Drawer Navigation Update
**Priority:** P0 (Blocking)  
**Status:** New

**Requirements:**
- Rename "Subscriptions" drawer item to "What's New"
- Route `/subscriptions` → `/settings` (redirect)
- Route `/subscriptions/feed` → `/whats-new` (redirect)
- Maintain deep link compatibility

**Components:**
- `app/(drawer)/_layout.tsx` - Update drawer screen configuration
- `app/(drawer)/whats-new.tsx` - New route (renamed from subscriptions/feed)
- `app/settings.tsx` - Add subscriptions management section

**API:**
- No new endpoints required

---

### FR-1.2: Settings Subscriptions Section
**Priority:** P0 (Blocking)  
**Status:** New

**Requirements:**
- Add "Subscriptions" section to Settings screen
- Section appears after "Voice Language"
- Navigate to subscription management on tap
- Match existing Settings UI patterns

**Components:**
- `screens/settings-screen.tsx` - Add subscriptions section
- Reuse `SubscriptionsScreen` component

**API:**
- No new endpoints required

---

### FR-1.3: Navigation Change Tooltip
**Priority:** P1 (High)  
**Status:** New

**Requirements:**
- Show one-time tooltip on first visit after update
- Tooltip explains: "Subscriptions moved to Settings. What's New is now your content feed."
- "Got it" button dismisses permanently
- Store dismissal state in user preferences

**Components:**
- `components/NavigationChangeTooltip.tsx` - New component
- `app/(drawer)/whats-new.tsx` - Integrate tooltip

**API:**
- `api.userPreferences.mutations.set` - Store tooltip dismissal
- `api.userPreferences.queries.get` - Check if tooltip shown

---

## FR-2: Multimedia Card Components

### FR-2.1: Video Card Component
**Priority:** P0 (Blocking)  
**Status:** New

**Requirements:**
- Display 16:9 thumbnail image
- Overlay duration badge (bottom-right)
- Overlay play icon (centered)
- Title, source badge, timestamp below thumbnail
- Fallback to text-only if thumbnail missing
- Support `testID` for testing

**Props Interface:**
```typescript
interface VideoCardProps {
  thumbnailUrl?: string
  duration?: string // "12:34"
  title: string
  source: string
  publishedAt?: string
  onPress?: () => void
  testID?: string
}
```

**Components:**
- `components/subscriptions/VideoCard.tsx` - New component
- `components/subscriptions/VideoCard.stories.tsx` - Storybook stories

**Dependencies:**
- `react-native-fast-image` - Optimized image loading
- Existing semantic theme tokens

---

### FR-2.2: Article Card Component
**Priority:** P0 (Blocking)  
**Status:** New

**Requirements:**
- Display hero image (4:3 or 16:9 aspect ratio)
- Title, 2-3 line summary below image
- Source badge, read time estimate
- Timestamp showing when published
- Fallback to text-only if image missing
- Support `testID` for testing

**Props Interface:**
```typescript
interface ArticleCardProps {
  heroImageUrl?: string
  title: string
  summary?: string
  source: string
  readTime?: string // "5 min read"
  publishedAt?: string
  onPress?: () => void
  testID?: string
}
```

**Components:**
- `components/subscriptions/ArticleCard.tsx` - New component
- `components/subscriptions/ArticleCard.stories.tsx` - Storybook stories

---

### FR-2.3: Social Card Component
**Priority:** P1 (High)  
**Status:** New

**Requirements:**
- Display circular author avatar (40x40)
- Author name and handle below avatar
- Content preview (2-3 lines of text)
- Engagement metrics (likes, comments) if available
- Source badge (Twitter/X, Bluesky, etc.)
- Support `testID` for testing

**Props Interface:**
```typescript
interface SocialCardProps {
  authorAvatarUrl?: string
  authorName: string
  authorHandle: string
  contentPreview: string
  likes?: number
  comments?: number
  source: string
  publishedAt?: string
  onPress?: () => void
  testID?: string
}
```

**Components:**
- `components/subscriptions/SocialCard.tsx` - New component
- `components/subscriptions/SocialCard.stories.tsx` - Storybook stories

---

### FR-2.4: Release Card Component
**Priority:** P1 (High)  
**Status:** New

**Requirements:**
- Display pill badge with version (e.g., "v2.1.0")
- Title, 2-3 line summary below badge
- Repository name and source
- Timestamp showing when released
- "View changelog" button
- Support `testID` for testing

**Props Interface:**
```typescript
interface ReleaseCardProps {
  version: string
  title: string
  summary?: string
  repositoryName: string
  source: string
  publishedAt?: string
  changelogUrl?: string
  onPress?: () => void
  testID?: string
}
```

**Components:**
- `components/subscriptions/ReleaseCard.tsx` - New component
- `components/subscriptions/ReleaseCard.stories.tsx` - Storybook stories

---

### FR-2.5: Card Factory / Router
**Priority:** P0 (Blocking)  
**Status:** New

**Requirements:**
- Route to appropriate card component based on content type
- Handle fallbacks when data is missing
- Provide consistent loading skeletons
- Support all card variants

**Props Interface:**
```typescript
interface FeedCardProps {
  item: Finding // From whatsNew findings
  onPress?: () => void
  testID?: string
}

type Finding = {
  title: string
  url: string
  source: string
  category: 'discovery' | 'release' | 'trend' | 'discussion'
  summary?: string
  publishedAt?: string
  // ... extended fields
}
```

**Components:**
- `components/subscriptions/FeedCard.tsx` - Router component
- `components/subscriptions/FeedCard.stories.tsx` - All variants

---

### FR-2.6: Loading Skeletons
**Priority:** P1 (High)  
**Status:** New

**Requirements:**
- Skeleton for each card variant
- Match final card layout exactly
- Shimmer animation for polish
- Support `testID` for testing

**Components:**
- `components/subscriptions/VideoCardSkeleton.tsx`
- `components/subscriptions/ArticleCardSkeleton.tsx`
- `components/subscriptions/SocialCardSkeleton.tsx`
- `components/subscriptions/ReleaseCardSkeleton.tsx`

---

## FR-3: AI Summaries

### FR-3.1: Summary Generation Pipeline
**Priority:** P0 (Blocking)  
**Status:** New

**Requirements:**
- Generate 2-3 line summary for each finding during report creation
- Summary length: 80-150 characters
- Capture key technical insight
- Maintain neutral, factual tone
- Handle failures gracefully (no summary = title only)

**Backend Changes:**
- `convex/whatsNew/llm.ts` - Add summary generation to synthesis
- `convex/whatsNew/actions.ts` - Update report generation flow
- New LLM prompt for per-item summarization

**Prompt Template:**
```
Summarize this content in 2-3 sentences (max 150 chars) for an AI engineer:
Title: {title}
Source: {source}
Content Preview: {preview}

Focus on: What is this? Why does it matter to an AI engineer? What can I do with this?

Respond with ONLY the summary text.
```

---

### FR-3.2: Summary Storage & Retrieval
**Priority:** P0 (Blocking)  
**Status:** Enhancement

**Requirements:**
- Add `summary` field to findings schema
- Store summaries in `findingsJson` column
- Retrieve summaries with findings queries
- Handle missing summaries (backward compatibility)

**Schema Changes:**
```typescript
// Finding interface (extended)
interface Finding {
  // ... existing fields
  summary?: string // NEW: 2-3 line AI summary
}
```

**API:**
- No new endpoints (extend existing `api.whatsNew.queries.getLatestFindings`)

---

### FR-3.3: Summary Display on Cards
**Priority:** P0 (Blocking)  
**Status:** Enhancement

**Requirements:**
- Display summary below title on cards
- Truncate to 2-3 lines with ellipsis
- "Read more" button if truncated
- Expand to show full summary
- Fallback to title-only if summary missing

**Components:**
- Update all card components to display summary
- Add `SummaryText` component for consistent truncation

---

### FR-3.4: Summary Quality Monitoring
**Priority:** P2 (Medium)  
**Status:** New

**Requirements:**
- Log summary generation success/failure rate
- Track summary length distribution
- Monitor for hallucinations or poor quality
- Flag low-quality summaries for review

**Backend Changes:**
- Add logging to summary generation pipeline
- Create admin view for summary quality metrics

---

## FR-4: Feedback System

### FR-4.1: Feedback Buttons on Cards
**Priority:** P0 (Blocking)  
**Status:** New

**Requirements:**
- Thumbs up / Thumbs down buttons on each card
- Minimal, non-intrusive placement (top-right or bottom-right)
- Visual feedback on tap (animation, state change)
- Toggle behavior (tap again to undo)
- Support `testID` for testing

**Components:**
- `components/subscriptions/FeedbackButtons.tsx` - New component
- Integrate into all card variants

**Accessibility:**
- Proper accessibility labels ("More like this", "Less like this")
- Minimum hitbox size (44x44)
- High contrast in both light/dark modes

---

### FR-4.2: Feedback Data Storage
**Priority:** P0 (Blocking)  
**Status:** New

**Requirements:**
- Store user feedback per finding
- Track: userId, findingId, sentiment (positive/negative), timestamp
- Query feedback history for a user
- Allow undoing feedback

**Schema Changes:**
```typescript
// New table: userFeedback
tables: {
  userFeedback: defineTable({
    userId: v.id('users'),
    findingId: v.string(), // Finding URL as identifier
    sentiment: v.union(v.literal('positive'), v.literal('negative')),
    timestamp: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_finding', ['findingId']),
}
```

**API:**
- `api.feedback.mutations.record` - Record feedback
- `api.feedback.mutations.undo` - Undo feedback
- `api.feedback.queries.getHistory` - Get user's feedback history
- `api.feedback.queries.getByFinding` - Get feedback for a finding

---

### FR-4.3: Feedback-Influenced Scoring
**Priority:** P1 (High)  
**Status:** Enhancement

**Requirements:**
- Update quality scoring algorithm to weight user feedback
- Positive feedback boosts similar content
- Negative feedback suppresses similar content
- Re-rank feed based on feedback signals
- Prevent filter bubbles (diversification)

**Backend Changes:**
- `convex/whatsNew/llm.ts` - Update scoring prompt
- `convex/subscriptions/ai_scoring.ts` - Incorporate user preferences
- Add user preference clustering (topics, sources, categories)

**Algorithm:**
```
baseScore = qualityScore from LLM
userMultiplier = calculate from feedback history
finalScore = baseScore * userMultiplier

// Similarity calculation
similarity = cosineEmbeddingSimilarity(currentFinding, feedbackFindings)
userMultiplier = weightedAverage(positiveFeedback) - weightedAverage(negativeFeedback)
```

---

### FR-4.4: Feedback History Screen
**Priority:** P2 (Medium)  
**Status:** New

**Requirements:**
- Screen in Settings showing all feedback
- List view with: content title, feedback type, timestamp
- Undo individual feedback items
- Clear all feedback button
- Export feedback data (CSV)

**Components:**
- `screens/FeedbackHistoryScreen.tsx` - New component
- `app/settings/feedback.tsx` - New route

**API:**
- `api.feedback.queries.getHistory` - Fetch user's feedback
- `api.feedback.mutations.clearAll` - Clear all feedback

---

### FR-4.5: Feedback Analytics
**Priority:** P3 (Low)  
**Status:** New

**Requirements:**
- Track feedback rate (thumbs up/down per 100 cards viewed)
- Monitor feedback impact on engagement
- Aggregate feedback by content type, source, category
- Export analytics for product insights

**Backend Changes:**
- Add analytics endpoints
- Create admin dashboard for feedback insights

---

## FR-5: Feed Functionality

### FR-5.1: Category Filtering
**Priority:** P0 (Blocking)  
**Status:** Enhancement

**Requirements:**
- Filter chips: All, Video, Articles, Social, Releases
- Show count of items per category
- Active chip visually distinct
- Filter selection persists across refreshes

**Components:**
- Update `SubscriptionFeedFilters` to support new categories
- Add counts to filter chips

**API:**
- Extend `api.whatsNew.queries.getLatestFindings` to support category filter

---

### FR-5.2: Pull-to-Refresh
**Priority:** P0 (Blocking)  
**Status:** Existing (verify)

**Requirements:**
- Pull down triggers report regeneration
- Show "Generating new report..." message
- Loading indicator during generation
- Fail gracefully with error message

**Components:**
- Existing pull-to-refresh in `SubscriptionFeedScreen`
- Verify functionality with new card types

---

### FR-5.3: Infinite Scroll / Pagination
**Priority:** P2 (Medium)  
**Status:** New

**Requirements:**
- Load more items as user scrolls
- Show loading indicator at bottom
- Stop when all items loaded
- Handle scroll position restoration

**Components:**
- Add infinite scroll to `SubscriptionFeedScreen`
- Paginate findings query

**API:**
- Extend `api.whatsNew.queries.getLatestFindings` with pagination

---

### FR-5.4: Offline Support
**Priority:** P1 (High)  
**Status:** Enhancement

**Requirements:**
- Cache last 50 items locally
- View cached content offline
- Show "Offline" indicator
- Queue feedback for later submission
- Cache expires after 7 days

**Components:**
- Add offline detection and caching
- Update UI to show offline state

**API:**
- Use Convex local cache
- Queue mutations when offline

---

## FR-6: Images & Media

### FR-6.1: Image Sourcing
**Priority:** P0 (Blocking)  
**Status:** New

**Requirements:**
- Extract images from Open Graph tags
- Fallback to default images per content type
- Handle missing images gracefully
- Optimize images for mobile (resize, compress)

**Backend Changes:**
- `convex/whatsNew/actions.ts` - Add image extraction during fetch
- Image proxy/optimizer service (optional)

**Image Sources:**
- Videos: YouTube thumbnails, OG tags
- Articles: OG tags, hero images
- Social: Author avatars, post images
- Releases: Repository social preview

---

### FR-6.2: Image Loading & Caching
**Priority:** P0 (Blocking)  
**Status:** New

**Requirements:**
- Use `react-native-fast-image` for optimized loading
- Progressive loading (low-res → high-res)
- Cache images locally
- Show skeleton while loading
- Handle load failures gracefully

**Components:**
- Wrap all images in `FastImage` component
- Add error handling and fallbacks

---

### FR-6.3: Image Fallbacks
**Priority:** P1 (High)  
**Status:** New

**Requirements:**
- Default image per content type
- Text-only fallback if image unavailable
- No broken image icons
- Consistent fallback UI

**Fallback Strategy:**
- Videos: Default play icon on colored background
- Articles: Gradient background with title
- Social: Initials avatar
- Releases: Version badge centered

---

## FR-7: Performance & Quality

### FR-7.1: Performance Targets
**Priority:** P0 (Blocking)  
**Status:** Requirement

**Requirements:**
- Feed loads in under 2 seconds on 4G
- Scroll at 60fps with images
- Memory usage under 200MB
- Battery impact minimal
- No frame drops during card interactions

**Testing:**
- Performance profiling with Flipper
- Test on low-end devices
- Monitor with Firebase Performance

---

### FR-7.2: Accessibility
**Priority:** P0 (Blocking)  
**Status:** Requirement

**Requirements:**
- All cards pass accessibility audit
- Proper accessibility labels
- Screen reader support
- High contrast in both themes
- Minimum touch target size (44x44)

**Testing:**
- Test with VoiceOver (iOS) and TalkBack (Android)
- Automated accessibility tests
- Manual audit with screen reader

---

### FR-7.3: Error Handling
**Priority:** P0 (Blocking)  
**Status:** Enhancement

**Requirements:**
- Graceful fallbacks for missing data
- User-friendly error messages
- Retry logic for failed requests
- No crashes or frozen screens

**Error States:**
- Image load failure → Fallback UI
- Summary generation failure → Title only
- Network failure → Cached content
- API failure → Error message + retry

---

## FR-8: Analytics & Instrumentation

### FR-8.1: Event Tracking
**Priority:** P1 (High)  
**Status:** New

**Requirements:**
- Track card views (impressions)
- Track card clicks (click-through rate)
- Track feedback events (thumbs up/down)
- Track filter usage
- Track refresh frequency

**Events:**
```
whats_new_card_viewed
whats_new_card_clicked
whats_new_feedback_given
whats_new_filter_changed
whats_new_refreshed
```

---

### FR-8.2: Success Metrics
**Priority:** P1 (High)  
**Status:** New

**Requirements:**
- Time to first card view
- Scroll depth per session
- Feedback rate (per 100 cards)
- Click-through rate by card type
- Session duration in What's New

**Dashboard:**
- Create analytics dashboard for monitoring
- Set up alerts for metric degradation

---

## FR-9: Migration & Backward Compatibility

### FR-9.1: Data Migration
**Priority:** P0 (Blocking)  
**Status:** New

**Requirements:**
- Migrate existing reports to include summaries
- Add image URLs to existing findings
- Maintain backward compatibility
- No data loss during migration

**Migration Script:**
- Backfill summaries for existing reports
- Extract images for existing findings
- Run migration in batches

---

### FR-9.2: Deep Link Redirects
**Priority:** P0 (Blocking)  
**Status:** New

**Requirements:**
- `/subscriptions` → `/settings`
- `/subscriptions/feed` → `/whats-new`
- `/subscriptions/[id]` → `/whats-new/[id]`
- Preserve query parameters

**Implementation:**
- Add redirect logic in route handlers
- Update deep link URLs in notifications

---

## FR-10: Documentation & Handoff

### FR-10.1: Code Documentation
**Priority:** P1 (High)  
**Status:** Requirement

**Requirements:**
- Document all new components with JSDoc
- Comment complex logic (scoring algorithm, similarity)
- Update README files
- Document API changes

---

### FR-10.2: Design Documentation
**Priority:** P1 (High)  
**Status:** Requirement

**Requirements:**
- Document card variants with examples
- Specify spacing, typography, colors
- Create Storybook stories for all variants
- Document interaction patterns

---

### FR-10.3: Deployment Guide
**Priority:** P1 (High)  
**Status:** New

**Requirements:**
- Step-by-step deployment instructions
- Rollback procedures
- Feature flag configuration
- Monitoring setup

---

## Functional Requirements Matrix

| ID | Title | Priority | Status | Dependencies | Est. Hours |
|----|-------|----------|--------|--------------|------------|
| FR-1.1 | Drawer Navigation Update | P0 | New | None | 4 |
| FR-1.2 | Settings Subscriptions Section | P0 | New | FR-1.1 | 2 |
| FR-1.3 | Navigation Change Tooltip | P1 | New | FR-1.1 | 3 |
| FR-2.1 | Video Card Component | P0 | New | FR-6.1 | 8 |
| FR-2.2 | Article Card Component | P0 | New | FR-6.1 | 8 |
| FR-2.3 | Social Card Component | P1 | New | FR-6.1 | 6 |
| FR-2.4 | Release Card Component | P1 | New | FR-6.1 | 6 |
| FR-2.5 | Card Factory / Router | P0 | New | FR-2.1, FR-2.2 | 4 |
| FR-2.6 | Loading Skeletons | P1 | New | FR-2.1, FR-2.2, FR-2.3, FR-2.4 | 4 |
| FR-3.1 | Summary Generation Pipeline | P0 | New | None | 8 |
| FR-3.2 | Summary Storage & Retrieval | P0 | Enhancement | FR-3.1 | 2 |
| FR-3.3 | Summary Display on Cards | P0 | Enhancement | FR-3.1, FR-2.5 | 3 |
| FR-3.4 | Summary Quality Monitoring | P2 | New | FR-3.1 | 4 |
| FR-4.1 | Feedback Buttons on Cards | P0 | New | FR-2.5 | 4 |
| FR-4.2 | Feedback Data Storage | P0 | New | FR-4.1 | 6 |
| FR-4.3 | Feedback-Influenced Scoring | P1 | Enhancement | FR-4.2 | 12 |
| FR-4.4 | Feedback History Screen | P2 | New | FR-4.2 | 6 |
| FR-4.5 | Feedback Analytics | P3 | New | FR-4.2 | 8 |
| FR-5.1 | Category Filtering | P0 | Enhancement | FR-2.5 | 3 |
| FR-5.2 | Pull-to-Refresh | P0 | Existing | None | 1 |
| FR-5.3 | Infinite Scroll / Pagination | P2 | New | FR-5.1 | 6 |
| FR-5.4 | Offline Support | P1 | Enhancement | FR-4.2 | 8 |
| FR-6.1 | Image Sourcing | P0 | New | FR-3.1 | 8 |
| FR-6.2 | Image Loading & Caching | P0 | New | FR-6.1 | 6 |
| FR-6.3 | Image Fallbacks | P1 | New | FR-6.1 | 4 |
| FR-7.1 | Performance Targets | P0 | Requirement | All | 0 |
| FR-7.2 | Accessibility | P0 | Requirement | All | 0 |
| FR-7.3 | Error Handling | P0 | Enhancement | All | 4 |
| FR-8.1 | Event Tracking | P1 | New | All | 4 |
| FR-8.2 | Success Metrics | P1 | New | FR-8.1 | 4 |
| FR-9.1 | Data Migration | P0 | New | FR-3.1, FR-6.1 | 6 |
| FR-9.2 | Deep Link Redirects | P0 | New | FR-1.1 | 2 |
| FR-10.1 | Code Documentation | P1 | Requirement | All | 4 |
| FR-10.2 | Design Documentation | P1 | Requirement | FR-2.x | 4 |
| FR-10.3 | Deployment Guide | P1 | New | All | 2 |

**Total Estimated Hours: 170**

## Implementation Phases

### Phase 1: Foundation (Week 1) - 40 hours
- FR-1.1, FR-1.2, FR-1.3 (Navigation restructure)
- FR-2.5 (Card factory)
- FR-3.1, FR-3.2 (Summary pipeline)

### Phase 2: Core Cards (Week 2) - 40 hours
- FR-2.1, FR-2.2 (Video, Article cards)
- FR-6.1, FR-6.2, FR-6.3 (Image handling)
- FR-3.3 (Summary display)
- FR-4.1, FR-4.2 (Feedback buttons + storage)

### Phase 3: Enhanced Experience (Week 3) - 50 hours
- FR-2.3, FR-2.4 (Social, Release cards)
- FR-2.6 (Loading skeletons)
- FR-5.1, FR-5.4 (Category filtering, offline)
- FR-4.3 (Feedback scoring)

### Phase 4: Polish & Launch (Week 4) - 40 hours
- FR-7.3, FR-8.1, FR-8.2 (Error handling, analytics)
- FR-9.1, FR-9.2 (Migration, redirects)
- FR-10.1, FR-10.2, FR-10.3 (Documentation)
- QA, testing, bug fixes
