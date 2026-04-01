# US-CARD-005: FeedCard Router Component

> Task ID: US-CARD-005
> Type: FEATURE
> Priority: P0
> Estimate: 60 minutes
> Assignee: react-native-ui-implementer

## CRITICAL CONSTRAINTS

### MUST
- Route to correct card component based on content type
- Handle fallbacks when data is missing or incomplete
- Provide consistent loading skeletons for all variants
- Support all card variants (video, article, social, release)
- Include testID propagation to child components

### NEVER
- Crash on unknown content types
- Return null without loading state
- Hardcode content type detection logic
- Block rendering while determining card type

### STRICTLY
- Keep router logic simple and testable
- Extract shared loading skeleton to separate component
- Use discriminated union for Finding type

## SPECIFICATION

**Objective:** Build a router component that renders the correct card variant based on finding data.

**Success looks like:** FeedCard accepts a Finding object and automatically renders the appropriate card variant (VideoCard, ArticleCard, SocialCard, or ReleaseCard) with proper loading states.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | FeedCard with video content | Component renders | VideoCard rendered | `getByTestId('feed-card-video')` exists |
| 2 | FeedCard with article content | Component renders | ArticleCard rendered | `getByTestId('feed-card-article')` exists |
| 3 | FeedCard with social content | Component renders | SocialCard rendered | `getByTestId('feed-card-social')` exists |
| 4 | FeedCard with release content | Component renders | ReleaseCard rendered | `getByTestId('feed-card-release')` exists |
| 5 | FeedCard with isLoading=true | Component renders | Skeleton placeholder shown | `getByTestId('feed-card-skeleton')` exists |
| 6 | FeedCard with unknown category | Component renders | ArticleCard fallback (default) | `getByTestId('feed-card-article')` exists |

## GUARDRAILS

### WRITE-ALLOWED
- `components/subscriptions/FeedCard.tsx` (NEW)
- `components/subscriptions/FeedCard.stories.tsx` (NEW)
- `components/subscriptions/FeedCard.test.tsx` (NEW)
- `components/subscriptions/FeedCardSkeleton.tsx` (NEW)

### WRITE-PROHIBITED
- `app/**` - routing changes in separate task
- `convex/**` - backend changes in separate task
- Individual card components - already implemented in previous tasks

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-2.5 Card Factory / Router
- `.spec/prd/subscriptions-redesign/04-technical-considerations.md` - Finding type definition

### Interaction Notes
- Router should be transparent (no visual presence)
- Skeleton should match card heights for smooth loading
- testID should indicate which card type was selected

### Finding Type Detection Logic

```typescript
// Category to card type mapping
type CardCategory = 'discovery' | 'release' | 'trend' | 'discussion'

function getCardType(finding: Finding): 'video' | 'article' | 'social' | 'release' {
  // 1. Check if video (has duration or video source)
  if (finding.duration || isVideoSource(finding.source)) {
    return 'video'
  }
  
  // 2. Check if release (has version or is release category)
  if (finding.category === 'release' || finding.version) {
    return 'release'
  }
  
  // 3. Check if social (has authorHandle or social source)
  if (finding.authorHandle || isSocialSource(finding.source)) {
    return 'social'
  }
  
  // 4. Default to article
  return 'article'
}

function isVideoSource(source: string): boolean {
  return ['YouTube', 'Vimeo', 'Loom'].includes(source)
}

function isSocialSource(source: string): boolean {
  return ['Twitter/X', 'Bluesky', 'Mastodon', 'Reddit'].includes(source)
}
```

### Code Pattern

Source: `US-CARD-001` through `US-CARD-004`

```typescript
// Pattern: Router component with loading state
import { View, StyleSheet } from 'react-native'
import { VideoCard } from './VideoCard'
import { ArticleCard } from './ArticleCard'
import { SocialCard } from './SocialCard'
import { ReleaseCard } from './ReleaseCard'
import { FeedCardSkeleton } from './FeedCardSkeleton'

export interface Finding {
  title: string
  url: string
  source: string
  category: CardCategory
  summary?: string
  publishedAt?: string
  // Video fields
  thumbnailUrl?: string
  duration?: string
  // Article fields
  heroImageUrl?: string
  readTime?: string
  // Social fields
  authorAvatarUrl?: string
  authorName?: string
  authorHandle?: string
  likes?: number
  comments?: number
  // Release fields
  version?: string
  repositoryName?: string
  changelogUrl?: string
}

export type CardCategory = 'discovery' | 'release' | 'trend' | 'discussion'

interface FeedCardProps {
  item: Finding
  isLoading?: boolean
  onPress?: (finding: Finding) => void
  testID?: string
}

export function FeedCard({ 
  item, 
  isLoading = false, 
  onPress,
  testID = 'feed-card'
}: FeedCardProps) {
  const handlePress = () => {
    onPress?.(item)
  }

  if (isLoading) {
    return <FeedCardSkeleton testID={`${testID}-skeleton`} />
  }

  const cardType = getCardType(item)
  const cardTestId = `${testID}-${cardType}`

  switch (cardType) {
    case 'video':
      return (
        <VideoCard
          testID={cardTestId}
          thumbnailUrl={item.thumbnailUrl}
          duration={item.duration}
          title={item.title}
          source={item.source}
          publishedAt={item.publishedAt}
          onPress={handlePress}
        />
      )
    
    case 'social':
      return (
        <SocialCard
          testID={cardTestId}
          authorAvatarUrl={item.authorAvatarUrl}
          authorName={item.authorName || 'Unknown'}
          authorHandle={item.authorHandle || 'unknown'}
          contentPreview={item.summary || item.title}
          likes={item.likes}
          comments={item.comments}
          source={item.source}
          publishedAt={item.publishedAt}
          onPress={handlePress}
        />
      )
    
    case 'release':
      return (
        <ReleaseCard
          testID={cardTestId}
          version={item.version || 'latest'}
          title={item.title}
          summary={item.summary}
          repositoryName={item.repositoryName || item.source}
          source={item.source}
          publishedAt={item.publishedAt}
          changelogUrl={item.changelogUrl}
          onPress={handlePress}
        />
      )
    
    case 'article':
    default:
      return (
        <ArticleCard
          testID={cardTestId}
          heroImageUrl={item.heroImageUrl}
          title={item.title}
          summary={item.summary}
          source={item.source}
          readTime={item.readTime}
          publishedAt={item.publishedAt}
          onPress={handlePress}
        />
      )
  }
}

function getCardType(finding: Finding): 'video' | 'article' | 'social' | 'release' {
  if (finding.duration || isVideoSource(finding.source)) {
    return 'video'
  }
  if (finding.category === 'release' || finding.version) {
    return 'release'
  }
  if (finding.authorHandle || isSocialSource(finding.source)) {
    return 'social'
  }
  return 'article'
}

function isVideoSource(source: string): boolean {
  return ['YouTube', 'Vimeo', 'Loom'].includes(source)
}

function isSocialSource(source: string): boolean {
  return ['Twitter/X', 'Bluesky', 'Mastodon', 'Reddit'].includes(source)
}
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Hardcoded card type, no loading state
if (finding.source === 'YouTube') return <VideoCard />
// ❌ WRONG: No fallback for unknown types
switch (type) {
  case 'video': return <VideoCard />
  // What if type is undefined?
}
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Discriminated unions for type safety
  - Loading states for all dynamic content
  - Graceful fallbacks for edge cases

## DEPENDENCIES

This task depends on:
- US-CARD-001 (Video Card Component)
- US-CARD-002 (Article Card Component)
- US-CARD-003 (Social Card Component) - P1, can stub
- US-CARD-004 (Release Card Component) - P1, can stub

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-2.5 Card Factory
2. `.spec/prd/subscriptions-redesign/04-technical-considerations.md` - Finding interface
3. Previous card component implementations for prop interfaces

## NOTES

This router component is the key integration point. It must handle all content types gracefully and provide consistent loading states. The skeleton component should be reusable across all card types with a generic layout.
