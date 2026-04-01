# Subscriptions Redesign - Technical Considerations

## Architecture Overview

### Current Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                            │
├─────────────────────────────────────────────────────────────┤
│  Expo Router (Drawer Navigation)                            │
│  ├── Chat                                                  │
│  ├── Articles                                              │
│  ├── Subscriptions → Settings                              │
│  └── Improvements                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                       React Native                          │
├─────────────────────────────────────────────────────────────┤
│  Components: SubscriptionFeedScreen, WhatsNewFindingCard   │
│  Hooks: useWhatsNewFeed, useWebView                         │
│  UI: React Native Paper, NativeWind                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        Convex Backend                       │
├─────────────────────────────────────────────────────────────┤
│  Tables: whatsNewReports, documents                         │
│  Queries: getLatestFindings                                │
│  Actions: generateDailyReport                              │
│  Cron: Daily report generation                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    External Sources                         │
├─────────────────────────────────────────────────────────────┤
│  Reddit, HN, GitHub, Dev.to, Bluesky, Twitter/X, Changelogs │
└─────────────────────────────────────────────────────────────┘
```

### Target Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                            │
├─────────────────────────────────────────────────────────────┤
│  Expo Router (Drawer Navigation)                            │
│  ├── Chat                                                  │
│  ├── What's New (renamed from Subscriptions)               │
│  ├── Articles                                              │
│  ├── Toolbelt                                               │
│  ├── Improvements                                          │
│  └── Settings                                              │
│      └── Subscriptions (management)                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                       React Native                          │
├─────────────────────────────────────────────────────────────┤
│  Components:                                                │
│  ├── VideoCard, ArticleCard, SocialCard, ReleaseCard       │
│  ├── FeedCard (router), FeedbackButtons                    │
│  └── NavigationChangeTooltip                               │
│  Hooks: useWhatsNewFeed, useFeedback, useOffline           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        Convex Backend                       │
├─────────────────────────────────────────────────────────────┤
│  Tables:                                                    │
│  ├── whatsNewReports (extended with summaries)             │
│  ├── userFeedback (NEW)                                     │
│  └── userPreferences (NEW - tooltip state)                 │
│  Queries:                                                   │
│  ├── whatsNew.getLatestFindings (extended)                 │
│  ├── feedback.getHistory (NEW)                              │
│  └── feedback.getByFinding (NEW)                           │
│  Mutations:                                                 │
│  ├── feedback.record (NEW)                                  │
│  ├── feedback.undo (NEW)                                    │
│  └── userPreferences.set (NEW)                              │
│  Actions:                                                   │
│  └── whatsNew.generateDailyReport (extended)               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    AI Pipeline                              │
├─────────────────────────────────────────────────────────────┤
│  OpenAI GPT-4:                                              │
│  ├── Report synthesis (existing)                           │
│  ├── Per-item summaries (NEW)                              │
│  └── Feedback-influenced scoring (NEW)                     │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema Changes

### New Table: `userFeedback`

```typescript
// convex/schema.ts

export default defineSchema({
  // ... existing tables

  userFeedback: defineTable({
    userId: v.id('users'),
    findingId: v.string(), // URL as unique identifier
    sentiment: v.union(v.literal('positive'), v.literal('negative')),
    timestamp: v.number(),
    // Optional: context for better personalization
    findingCategory: v.optional(v.string()), // 'discovery' | 'release' | 'trend' | 'discussion'
    findingSource: v.optional(v.string()), // 'Reddit' | 'GitHub' | etc.
  })
    .index('by_user', ['userId'])
    .index('by_finding', ['findingId'])
    .index('by_user_and_timestamp', ['userId', 'timestamp']),
})
```

### Extended Table: `userPreferences`

```typescript
// Extend existing userPreferences table (or create if doesn't exist)

userPreferences: defineTable({
  userId: v.id('users'),
  // Tooltip state
  navigationChangeTooltipShown: v.optional(v.boolean()),
  // Feedback preferences (future)
  feedbackEnabled: v.optional(v.boolean()),
  // ... other preferences
})
  .index('by_user', ['userId'])
```

### Extended Table: `whatsNewReports`

```typescript
// No schema changes needed - findingsJson already stores extended fields

// Existing findingsJson structure (extended):
interface Finding {
  // ... existing fields
  summary?: string // NEW: AI-generated summary
  thumbnailUrl?: string // NEW: Extracted from OG tags
  authorAvatarUrl?: string // NEW: For social cards
}
```

## API Design

### Queries

#### `api.whatsNew.queries.getLatestFindings` (Extended)

**Existing:** Returns findings with optional category filter

**Extension:** No changes needed - already returns findingsJson with extended fields

**Usage:**
```typescript
const result = useQuery(api.whatsNew.queries.getLatestFindings, {
  category: 'discovery', // optional
})

// result.findings now includes:
// - summary (NEW)
// - thumbnailUrl (NEW)
// - authorAvatarUrl (NEW)
```

---

#### `api.feedback.queries.getHistory` (NEW)

**Description:** Get user's feedback history

**Args:**
```typescript
{
  userId: Id<'users'>
  limit?: number // default 50
  skip?: number // for pagination
}
```

**Returns:**
```typescript
{
  feedback: Array<{
    _id: Id<'userFeedback'>
    findingId: string
    findingTitle: string // fetched from findings
    sentiment: 'positive' | 'negative'
    timestamp: number
  }>
  hasMore: boolean
}
```

---

#### `api.feedback.queries.getByFinding` (NEW)

**Description:** Get feedback for a specific finding

**Args:**
```typescript
{
  findingId: string
  userId?: Id<'users'> // optional, for personal feedback
}
```

**Returns:**
```typescript
{
  positiveCount: number
  negativeCount: number
  userSentiment?: 'positive' | 'negative' // if userId provided
}
```

---

### Mutations

#### `api.feedback.mutations.record` (NEW)

**Description:** Record user feedback for a finding

**Args:**
```typescript
{
  findingId: string
  findingTitle: string
  findingCategory?: string
  findingSource?: string
  sentiment: 'positive' | 'negative'
}
```

**Returns:**
```typescript
{
  feedbackId: Id<'userFeedback'>
  recorded: boolean
}
```

---

#### `api.feedback.mutations.undo` (NEW)

**Description:** Remove user feedback for a finding

**Args:**
```typescript
{
  findingId: string
}
```

**Returns:**
```typescript
{
  undone: boolean
}
```

---

#### `api.userPreferences.mutations.set` (NEW)

**Description:** Set user preference

**Args:**
```typescript
{
  key: 'navigationChangeTooltipShown' | 'feedbackEnabled' | ...
  value: any
}
```

**Returns:**
```typescript
{
  success: boolean
}
```

---

### Actions

#### `api.whatsNew.actions.generateDailyReport` (Extended)

**Existing:** Generates daily report with findings

**Extension:** Add summary generation and image extraction

**Changes:**
1. During synthesis, generate per-item summaries
2. Extract images from Open Graph tags
3. Store extended fields in findingsJson

**Pseudocode:**
```typescript
// After fetching findings
for (const finding of findings) {
  // NEW: Generate summary
  finding.summary = await generateSummary(finding)

  // NEW: Extract image
  finding.thumbnailUrl = await extractImage(finding.url)
}

// Continue with existing synthesis
const reportMarkdown = await llmSynthesizeReport(findings)
```

---

## AI/ML Integration

### Summary Generation

**Model:** OpenAI GPT-4o-mini (cost-effective, fast)

**Prompt:**
```typescript
const summaryPrompt = `Summarize this content in 2-3 sentences (max 150 chars) for an AI engineer.

Title: ${finding.title}
Source: ${finding.source}
URL: ${finding.url}

Focus on:
1. What is this?
2. Why does it matter to an AI engineer?
3. What can I do with this?

Respond with ONLY the summary text. No preamble, no quotes.`

const summary = await generateText({
  model: gpt4oMini(),
  prompt: summaryPrompt,
  maxTokens: 100,
})
```

**Quality Controls:**
- Truncate to 150 characters
- Filter out empty or low-quality summaries
- Fallback to title if generation fails

---

### Feedback-Influenced Scoring

**Algorithm:** Weighted scoring with user preferences

**Pseudocode:**
```typescript
async function scoreFindingsWithFeedback(
  findings: Finding[],
  userFeedback: UserFeedback[]
): Promise<ScoringFinding[]> {
  // 1. Calculate base quality scores (existing LLM scoring)
  const baseScores = await scoreFindingsQuality(findings)

  // 2. Get user preference profile
  const preferenceProfile = buildPreferenceProfile(userFeedback)

  // 3. Adjust scores based on feedback
  for (const finding of baseScores) {
    const similarity = calculateSimilarity(finding, preferenceProfile)
    const userMultiplier = calculateMultiplier(similarity, preferenceProfile)
    finding.finalScore = finding.qualityScore * userMultiplier
    finding.scoreReason = `${finding.qualityReason} + user_adjustment`
  }

  // 4. Sort by final score
  return baseScores.sort((a, b) => b.finalScore - a.finalScore)
}

function buildPreferenceProfile(feedback: UserFeedback[]) {
  // Cluster feedback by:
  // - Source (Reddit, GitHub, etc.)
  // - Category (discovery, release, etc.)
  // - Topics (using embeddings)

  const positiveBySource = groupBy(feedback, 'source')
    .filter(f => f.sentiment === 'positive')

  const negativeBySource = groupBy(feedback, 'source')
    .filter(f => f.sentiment === 'negative')

  return {
    preferredSources: positiveBySource.map(f => f.source),
    avoidedSources: negativeBySource.map(f => f.source),
    // ... more dimensions
  }
}

function calculateSimilarity(finding: Finding, profile: PreferenceProfile): number {
  // Cosine similarity between finding and preferred feedback
  // Use embeddings for topic similarity

  const findingEmbedding = await embed(finding.title + ' ' + finding.summary)
  const preferredEmbeddings = await Promise.all(
    profile.preferredFeedback.map(f => embed(f.title))
  )

  const similarities = preferredEmbeddings.map(e =>
    cosineSimilarity(findingEmbedding, e)
  )

  return Math.max(...similarities) // Max similarity to preferred items
}

function calculateMultiplier(
  similarity: number,
  profile: PreferenceProfile
): number {
  // Similarity 0-1 maps to multiplier 0.5-2.0
  // Neutral (no feedback) = 1.0

  if (similarity < 0.3) return 0.8 // Slight downrank for dissimilar
  if (similarity > 0.7) return 1.3 // Boost for similar
  return 1.0 // Neutral
}
```

**Diversification:**
```typescript
// Prevent filter bubbles by ensuring variety
function diversifyFeed(findings: Finding[]): Finding[] {
  const MAX_PER_SOURCE = 5
  const MIN_SOURCES = 3

  // Group by source
  const bySource = groupBy(findings, 'source')

  // Cap per source
  const capped = Object.values(bySource).map(items =>
    items.slice(0, MAX_PER_SOURCE)
  ).flat()

  // Ensure minimum source variety
  if (Object.keys(bySource).length < MIN_SOURCES) {
    return findings // Not enough data, return all
  }

  return capped
}
```

---

## Image Handling

### Image Extraction Pipeline

**Sources:**
1. **Open Graph tags** - Primary source for articles, videos
2. **YouTube thumbnails** - For YouTube videos
3. **Social avatars** - From API responses (Bluesky, Twitter)
4. **GitHub social previews** - For releases

**Implementation:**
```typescript
async function extractImage(url: string): Promise<string | undefined> {
  try {
    // 1. Check cache
    const cached = await ctx.runQuery(api.images.get, { url })
    if (cached) return cached.thumbnailUrl

    // 2. Fetch HTML
    const response = await fetch(url)
    const html = await response.text()

    // 3. Extract Open Graph image
    const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"\s*\/?>/)
    if (ogImageMatch) {
      const imageUrl = ogImageMatch[1]

      // 4. Optimize image (resize, compress)
      const optimized = await optimizeImage(imageUrl)

      // 5. Cache result
      await ctx.runMutation(api.images.set, { url, thumbnailUrl: optimized })

      return optimized
    }

    return undefined
  } catch (error) {
    console.error('[extractImage] Failed:', error)
    return undefined
  }
}
```

**Optimization Service (Optional):**
- Use Cloudinary, Imgix, or similar
- Resize to max 600x400 (card size)
- Compress to WebP
- Serve via CDN

**Fallback Strategy:**
```typescript
function getDefaultImage(contentType: string): string {
  switch (contentType) {
    case 'video':
      return require('@/assets/images/video-fallback.png')
    case 'article':
      return require('@/assets/images/article-fallback.png')
    case 'social':
      return require('@/assets/images/social-fallback.png')
    case 'release':
      return require('@/assets/images/release-fallback.png')
    default:
      return require('@/assets/images/default-fallback.png')
  }
}
```

---

## Frontend Architecture

### Component Structure

```
components/subscriptions/
├── VideoCard.tsx              # Video content card
├── ArticleCard.tsx            # Article/blog card
├── SocialCard.tsx             # Social media post card
├── ReleaseCard.tsx            # Release/changelog card
├── FeedCard.tsx               # Router component (renders correct variant)
├── FeedbackButtons.tsx        # Thumbs up/down buttons
├── NavigationChangeTooltip.tsx # Onboarding tooltip
├── SubscriptionFeedScreen.tsx # Main feed screen (updated)
└── types.ts                   # TypeScript interfaces
```

---

### State Management

**Local State (useState):**
- Search text
- Selected category filter
- Tooltip visibility
- Card expansion state

**Server State (Convex):**
- Findings data
- Feedback history
- User preferences

**No Global State Needed:**
- All state fits in component or Convex
- No need for Redux/Zustand

---

### Data Flow

```
User opens What's New
    ↓
useWhatsNewFeed() fetches findings
    ↓
Findings mapped to FeedCard components
    ↓
FeedCard routes to appropriate variant (VideoCard, etc.)
    ↓
User interacts (click, feedback)
    ↓
Mutations called (api.feedback.record, etc.)
    ↓
Optimistic updates (local state)
    ↓
Server updates (Convex)
```

---

## Performance Considerations

### Image Loading

**Strategy:** Progressive loading with placeholders

```typescript
import FastImage from 'react-native-fast-image'

function CardImage({ uri, fallback }: { uri?: string; fallback: string }) {
  const [loaded, setLoaded] = useState(false)

  return (
    <View>
      {/* Skeleton while loading */}
      {!loaded && <SkeletonView />}

      {/* Progressive image */}
      <FastImage
        source={{ uri: uri || fallback }}
        onLoad={() => setLoaded(true)}
        resizeMode={FastImage.resizeMode.cover}
      />
    </View>
  )
}
```

**Optimization:**
- Use `react-native-fast-image` for caching and performance
- Preload images for visible cards
- Lazy load images for off-screen cards

---

### List Performance

**Strategy:** FlatList with optimization

```typescript
<FlatList
  data={findings}
  keyExtractor={(item, index) => `${item.url}-${index}`}
  renderItem={renderCard}
  // Performance optimizations
  removeClippedSubviews={true}
  maxToRenderPerBatch={10}
  updateCellsBatchingPeriod={50}
  initialNumToRender={10}
  windowSize={5}
  // Memoization
  getItemType={(item) => item.category} // Reduce re-renders
/>
```

---

### Feedback Latency

**Strategy:** Optimistic updates

```typescript
function FeedbackButtons({ findingId, initialSentiment }: Props) {
  const [sentiment, setSentiment] = useState(initialSentiment)
  const recordFeedback = useMutation(api.feedback.mutations.record)

  const handlePress = async (newSentiment: 'positive' | 'negative') => {
    // Optimistic update
    setSentiment(newSentiment)

    try {
      // Server update
      await recordFeedback({ findingId, sentiment: newSentiment })
    } catch (error) {
      // Rollback on error
      setSentiment(initialSentiment)
    }
  }

  return (
    <View>
      <Button onPress={() => handlePress('positive')}>
        <ThumbsUp filled={sentiment === 'positive'} />
      </Button>
      <Button onPress={() => handlePress('negative')}>
        <ThumbsDown filled={sentiment === 'negative'} />
      </Button>
    </View>
  )
}
```

---

## Testing Strategy

### Unit Tests

**Components:**
```typescript
// VideoCard.test.tsx
describe('VideoCard', () => {
  it('renders with thumbnail', () => {
    const { getByTestId } = render(
      <VideoCard
        thumbnailUrl="https://example.com/thumb.jpg"
        duration="12:34"
        title="Test Video"
        source="YouTube"
      />
    )
    expect(getByTestId('video-card-thumbnail')).toBeTruthy()
  })

  it('renders fallback when no thumbnail', () => {
    const { getByTestId } = render(
      <VideoCard
        title="Test Video"
        source="YouTube"
      />
    )
    expect(getByTestId('video-card-fallback')).toBeTruthy()
  })
})
```

**Hooks:**
```typescript
// useFeedback.test.ts
describe('useFeedback', () => {
  it('records feedback successfully', async () => {
    const { result } = renderHook(() => useFeedback())
    await act(async () => {
      await result.current.recordFeedback({
        findingId: 'test',
        sentiment: 'positive'
      })
    })
    expect(mockRecordFeedback).toHaveBeenCalledWith({
      findingId: 'test',
      sentiment: 'positive'
    })
  })
})
```

---

### Integration Tests

**E2E Flow:**
```typescript
// e2e/whats-new.spec.ts
describe('What\'s New Flow', () => {
  it('user views feed and provides feedback', async () => {
    // 1. Open What's New
    await element(by.id('drawer-what's-new')).tap()

    // 2. Wait for feed to load
    await waitFor(element(by.id('feed-card-0')))
      .toBeVisible()
      .withTimeout(2000)

    // 3. Scroll through feed
    await element(by.id('feed-scroll')).scroll(50, 'down')

    // 4. Provide feedback
    await element(by.id('feedback-positive-0')).tap()

    // 5. Verify feedback state
    await expect(element(by.id('feedback-positive-0'))).toHaveVisibleChild(
      by.id('icon-thumbs-up-filled')
    )
  })
})
```

---

### Performance Tests

**Metrics:**
- Feed load time < 2s
- Scroll FPS > 55
- Memory usage < 200MB
- Image load time < 500ms

**Tools:**
- Flipper Performance plugin
- React DevTools Profiler
- Xcode Instruments (iOS)
- Android Profiler (Android)

---

## Deployment Strategy

### Phased Rollout

**Phase 1: Backend Changes (Day 1)**
- Deploy schema changes
- Deploy new queries/mutations
- Run migration scripts
- Verify with smoke tests

**Phase 2: Frontend Changes (Day 2-3)**
- Deploy navigation changes
- Deploy new card components
- Deploy feedback buttons
- Monitor for crashes

**Phase 3: AI Pipeline (Day 4-5)**
- Deploy summary generation
- Deploy feedback scoring
- Monitor quality metrics
- Adjust prompts if needed

**Phase 4: Polish (Day 6-7)**
- Fix bugs from monitoring
- Optimize performance
- Deploy final polish

---

### Rollback Plan

**If Critical Issues:**

1. **Navigation Revert:**
   - Revert drawer changes
   - Keep subscriptions in main nav
   - Deep links work as before

2. **Cards Revert:**
   - Fall back to existing `WhatsNewFindingCard`
   - Hide new card components
   - Feature flag to disable

3. **Feedback Revert:**
   - Remove feedback buttons
   - Keep existing scoring algorithm
   - Data remains (no deletion)

4. **Summaries Revert:**
   - Hide summary field
   - Show title only
   - No data loss (already generated)

---

## Security & Privacy

### User Data

**Feedback Data:**
- Stored per-user, not shared
- No PII in feedback (just finding URLs)
- Optional: Export/delete on request

**Images:**
- Cached, not stored permanently
- No user content uploaded
- External URLs only

---

### Rate Limiting

**Feedback Recording:**
- Max 10 feedbacks per minute per user
- Prevent abuse/spam

**Report Generation:**
- Max 1 report per 5 minutes per user
- Prevent API abuse

---

## Monitoring & Observability

### Metrics to Track

**Performance:**
- Feed load time (p50, p95, p99)
- Image load time
- Scroll FPS
- Memory usage

**Engagement:**
- Daily active users in What's New
- Cards viewed per session
- Feedback rate (per 100 cards)
- Click-through rate

**Quality:**
- Summary generation success rate
- Feedback recording success rate
- Crash rate
- Error rate

**Business:**
- Session duration in What's New
- Return frequency
- Feature usage (filters, feedback)

---

### Alerts

**Critical:**
- Crash rate > 1%
- Error rate > 5%
- Feed load time p95 > 5s

**Warning:**
- Summary generation failure rate > 10%
- Feedback recording failure rate > 5%
- Image load failure rate > 20%

---

## Open Technical Questions

1. **Image Optimization:** Use external service (Cloudinary) or build custom?
   - **Recommendation:** Start with no optimization, add if needed

2. **Embedding Model:** Which model for feedback similarity?
   - **Recommendation:** OpenAI text-embedding-3-small (cost-effective)

3. **Feedback Weighting:** How much should feedback influence scoring?
   - **Recommendation:** Start conservative (0.8-1.3 multiplier), adjust based on metrics

4. **Summary Storage:** Store in findingsJson or separate table?
   - **Recommendation:** findingsJson (simpler, already structured)

5. **Offline Queue:** Use Convex local cache or custom?
   - **Recommendation:** Convex local cache (built-in, simpler)

---

## Technical Debt & Future Work

### Known Limitations

1. **No Collaborative Filtering:** Personalization is individual-only
2. **No Topic Modeling:** Categories are manual, not auto-discovered
3. **No Advanced Search:** Full-text search not implemented
4. **No A/B Testing:** Cannot test different summary lengths, card layouts

### Future Enhancements

1. **Real-time Updates:** WebSocket for live feed updates
2. **Advanced Filtering:** Filter by topic, source, date range
3. **Export Features:** Export feed as RSS, PDF, etc.
4. **Social Sharing:** Share cards to external platforms
5. **Analytics Dashboard:** User-facing analytics for their engagement

---

## Dependencies

### External Services

- **OpenAI API:** GPT-4o-mini for summaries, text-embedding-3-small for similarity
- **Convex:** Backend, database, cron jobs
- **Expo:** Build and deployment

### Internal Dependencies

- **Existing Components:** WebViewSheet, SearchInput, FilterChip
- **Existing Hooks:** useWebView, useWhatsNewFeed
- **Existing Queries:** whatsNew.getLatestFindings

### New Dependencies

- **react-native-fast-image:** Optimized image loading
- **@react-native-async-storage/async-storage:** Local caching (if needed)

---

## Documentation Requirements

### Code Documentation

- JSDoc comments on all new components
- Inline comments for complex logic (scoring algorithm)
- README updates for new directories

### API Documentation

- Document all new queries/mutations
- Update API reference if exists
- Provide example usage

### Deployment Documentation

- Step-by-step deployment guide
- Rollback procedures
- Feature flag configuration
- Monitoring setup guide

---

## Handoff Checklist

- [ ] All components documented with JSDoc
- [ ] API changes documented
- [ ] Schema changes documented
- [ ] Deployment guide written
- [ ] Rollback procedures documented
- [ ] Monitoring setup completed
- [ ] Alerts configured
- [ ] QA sign-off
- [ ] Security review complete
- [ ] Performance tests passing
- [ ] Accessibility audit complete
- [ ] Stakeholder demo scheduled
