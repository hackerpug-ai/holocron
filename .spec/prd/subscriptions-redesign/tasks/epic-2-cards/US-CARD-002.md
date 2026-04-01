# US-CARD-002: Article Card Component

> Task ID: US-CARD-002
> Type: FEATURE
> Priority: P0
> Estimate: 120 minutes
> Assignee: react-native-ui-implementer

## CRITICAL CONSTRAINTS

### MUST
- Follow theme system using semantic tokens (no hardcoded colors/spacing)
- Use react-native-paper Text component with variants (no react-native Text)
- Include testID on all interactive elements for E2E testing
- Handle missing hero image gracefully with fallback UI
- Support both light and dark modes via theme

### NEVER
- Hardcode colors, spacing, or typography values
- Use react-native Text instead of react-native-paper Text
- Block the UI while images load
- Crash on missing/invalid image URLs

### STRICTLY
- Follow VideoCard patterns for consistency
- Keep component under 200 lines
- Use FastImage for optimized image loading

## SPECIFICATION

**Objective:** Build an article card component with hero image, 2-3 line summary, source badge, and read time estimate.

**Success looks like:** Article cards render with hero images (or fallback), scannable summaries, source badges, read time estimates, and are tappable to open content.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | ArticleCard with valid heroImageUrl | Component renders | Hero image displays (4:3 or 16:9) with title and summary below | `getByTestId('article-card-hero')` exists |
| 2 | ArticleCard without heroImageUrl | Component renders | Fallback UI shows gradient or colored background | `getByTestId('article-card-fallback')` exists |
| 3 | ArticleCard with summary | Component renders | Summary truncates to 2-3 lines with ellipsis | Visual verification in Storybook |
| 4 | User taps ArticleCard | onPress fires | Callback invoked with finding data | `fireEvent.press(getByTestId('article-card-pressable'))` |
| 5 | ArticleCard with readTime | Component renders | Read time displays (e.g., "5 min read") | `getByText('5 min read')` exists |

## GUARDRAILS

### WRITE-ALLOWED
- `components/subscriptions/ArticleCard.tsx` (NEW)
- `components/subscriptions/ArticleCard.stories.tsx` (NEW)
- `components/subscriptions/ArticleCard.test.tsx` (NEW)

### WRITE-PROHIBITED
- `app/**` - routing changes in separate task
- `convex/**` - backend changes in separate task
- `VideoCard.tsx` - modify only if shared patterns need extraction

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-CARD-002 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-2.2 Article Card Component

### Interaction Notes
- Card should feel tappable (opacity change on press)
- Hero image should be prominent (aspect ratio 4:3 or 16:9)
- Summary should be scannable (2-3 lines max)
- Read time estimate adds value for decision-making

### Code Pattern

Source: `US-CARD-001` (VideoCard pattern)

```typescript
// Pattern: Follow VideoCard structure with article-specific layout
import { View, Pressable, StyleSheet } from 'react-native'
import { Text } from 'react-native-paper'
import { useSemanticTheme } from '@/hooks/use-semantic-theme'
import FastImage from 'react-native-fast-image'

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

export function ArticleCard({
  heroImageUrl,
  title,
  summary,
  source,
  readTime,
  publishedAt,
  onPress,
  testID = 'article-card'
}: ArticleCardProps) {
  const { semantic } = useSemanticTheme()
  
  return (
    <Pressable 
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        { 
          opacity: pressed ? 0.7 : 1,
          backgroundColor: semantic.color.surface.default 
        }
      ]}
    >
      {/* Hero image */}
      <View style={styles.heroContainer}>
        {heroImageUrl ? (
          <FastImage
            testID={`${testID}-hero`}
            source={{ uri: heroImageUrl }}
            style={styles.hero}
            resizeMode={FastImage.resizeMode.cover}
          />
        ) : (
          <View 
            testID={`${testID}-fallback`} 
            style={[styles.fallback, { backgroundColor: semantic.color.surface.muted }]}
          >
            <Text variant="headlineMedium" style={{ color: semantic.color.onSurface.muted }}>
              📄
            </Text>
          </View>
        )}
      </View>
      
      {/* Content metadata */}
      <View style={[styles.metadata, { padding: semantic.space.md }]}>
        <Text 
          variant="titleMedium" 
          numberOfLines={2}
          style={{ color: semantic.color.onSurface.default }}
        >
          {title}
        </Text>
        
        {summary && (
          <Text 
            variant="bodyMedium" 
            numberOfLines={3}
            style={{ color: semantic.color.onSurface.muted }}
          >
            {summary}
          </Text>
        )}
        
        <View style={styles.footer}>
          <Text variant="labelSmall" style={{ color: semantic.color.onSurface.subtle }}>
            {source}
          </Text>
          {readTime && (
            <Text variant="labelSmall" style={{ color: semantic.color.onSurface.subtle }}>
              • {readTime}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  heroContainer: {
    aspectRatio: 16/9, // or 4/3
  },
  hero: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  metadata: {
    gap: 8,
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
})
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: No summary truncation, hardcoded layout
<Text>{summary}</Text>
<View style={{ padding: 16, backgroundColor: '#fff' }}>
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use semantic theme tokens for all colors
  - Use react-native-paper Text with variants
  - Include testID on all interactive elements
  - NumberOfLines for text truncation

## DEPENDENCIES

No task dependencies (foundational component).

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-CARD-002 acceptance criteria
2. `US-CARD-001` - Follow established VideoCard patterns
3. `hooks/use-semantic-theme.ts` - Theme hook usage

## NOTES

This component follows the same patterns as VideoCard but with article-specific layout. Hero image is the primary visual, with summary and metadata below. Read time helps users decide if they want to invest in reading.
