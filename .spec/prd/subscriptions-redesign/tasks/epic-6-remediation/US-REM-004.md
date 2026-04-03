# US-REM-004: Create Missing ArticleCard Component

> Task ID: US-REM-004
> Type: FEATURE
> Priority: P0
> Estimate: 90 minutes
> Assignee: frontend-designer

## CRITICAL CONSTRAINTS

### MUST
- Follow theme system using semantic tokens (no hardcoded colors/spacing)
- Use react-native-paper Text component with variants
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
- Use OptimizedImage for optimized image loading
- Match US-CARD-002 specification exactly

## SPECIFICATION

**Objective:** Build an article card component with hero image, 2-3 line summary, source badge, and read time estimate.

**Success looks like:** Article cards render with hero images (or fallback), scannable summaries, source badges, read time estimates, and are tappable to open content.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | ArticleCard with valid heroImageUrl | Component renders | Hero image displays (16:9) with title and summary below | `getByTestId('article-card-hero')` exists |
| 2 | ArticleCard without heroImageUrl | Component renders | Fallback UI shows gradient or colored background | `getByTestId('article-card-fallback')` exists |
| 3 | ArticleCard with summary | Component renders | Summary truncates to 2-3 lines with ellipsis | Visual verification in Storybook |
| 4 | User taps ArticleCard | onPress fires | Callback invoked with finding data | `fireEvent.press(getByTestId('article-card-pressable'))` |
| 5 | ArticleCard with readTime | Component renders | Read time displays (e.g., "5 min read") | `getByText('5 min read')` exists |

## TEST CRITERIA

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | ArticleCard renders hero image when heroImageUrl prop provided | AC-1 | `getByTestId('article-card-hero')` exists | [ ] TRUE [ ] FALSE |
| 2 | ArticleCard renders fallback UI when heroImageUrl prop omitted | AC-2 | `getByTestId('article-card-fallback')` exists | [ ] TRUE [ ] FALSE |
| 3 | Summary text truncates to 3 lines when summary prop exceeds length | AC-3 | Visual inspection in Storybook | [ ] TRUE [ ] FALSE |
| 4 | onPress callback invoked when user taps ArticleCard | AC-4 | `fireEvent.press` triggers callback | [ ] TRUE [ ] FALSE |
| 5 | Read time displays when readTime prop provided | AC-5 | `getByText` finds read time text | [ ] TRUE [ ] FALSE |

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
- `.spec/prd/subscriptions-redesign/tasks/epic-2-cards/US-CARD-002.md` - Full specification
- `components/subscriptions/VideoCard.tsx` - Pattern reference
- `components/ui/OptimizedImage.tsx` - Image component

### Interaction Notes
- Card should feel tappable (opacity change on press)
- Hero image should be prominent (aspect ratio 16:9)
- Summary should be scannable (2-3 lines max)
- Read time estimate adds value for decision-making

### Code Pattern

Source: `components/subscriptions/VideoCard.tsx` structure

```typescript
/**
 * ArticleCard - Card component for article content with hero image and metadata
 */
import { View, Pressable, StyleSheet } from 'react-native'
import { Text } from '@/components/ui/text'
import { useTheme } from '@/hooks/use-theme'
import { OptimizedImage } from '@/components/ui/OptimizedImage'

export interface ArticleCardProps {
  /** URL to hero image (16:9 aspect ratio) */
  heroImageUrl?: string
  /** Article title */
  title: string
  /** Optional summary text (2-3 lines) */
  summary?: string
  /** Source name (e.g., "TechCrunch", "The Verge") */
  source: string
  /** Read time estimate (e.g., "5 min read") */
  readTime?: string
  /** Optional published timestamp */
  publishedAt?: string
  /** Callback when card is pressed */
  onPress?: () => void
  /** Test ID for testing */
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
  testID = 'article-card',
}: ArticleCardProps) {
  const { colors, spacing, radius } = useTheme()

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          opacity: pressed ? 0.7 : 1,
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: radius.lg,
        },
      ]}
    >
      {/* Hero image container with 16:9 aspect ratio */}
      <View
        style={[
          styles.heroContainer,
          { borderRadius: radius.lg },
        ]}
        testID={`${testID}-hero-container`}
      >
        {heroImageUrl ? (
          <OptimizedImage
            source={{ uri: heroImageUrl }}
            aspectRatio={16 / 9}
            borderRadius={radius.lg}
            testID={`${testID}-hero`}
            priority="normal"
          />
        ) : (
          <View
            style={[
              styles.fallback,
              {
                backgroundColor: colors.muted,
                borderRadius: radius.lg,
              },
            ]}
            testID={`${testID}-fallback`}
          >
            <Text style={{ color: colors.mutedForeground }}>📄</Text>
          </View>
        )}
      </View>

      {/* Metadata section */}
      <View style={[styles.metadata, { padding: spacing.md, gap: spacing.xs }]}>
        {/* Title */}
        <Text
          style={{ color: colors.foreground }}
          className="text-base font-semibold leading-snug"
          numberOfLines={2}
          testID={`${testID}-title`}
        >
          {title}
        </Text>

        {/* Summary */}
        {summary && (
          <Text
            style={{ color: colors.mutedForeground }}
            className="text-sm"
            numberOfLines={3}
            testID={`${testID}-summary`}
          >
            {summary}
          </Text>
        )}

        {/* Source and read time */}
        <View style={[styles.footer, { gap: spacing.sm }]}>
          <Text
            style={{ color: colors.mutedForeground }}
            className="text-sm"
            testID={`${testID}-source`}
          >
            {source}
          </Text>
          {readTime && (
            <>
              <View style={[styles.dot, { backgroundColor: colors.mutedForeground }]} />
              <Text
                style={{ color: colors.mutedForeground }}
                className="text-sm"
                testID={`${testID}-read-time`}
              >
                {readTime}
              </Text>
            </>
          )}
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    width: '100%',
    overflow: 'hidden',
  },
  heroContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    overflow: 'hidden',
  },
  fallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  metadata: {
    width: '100%',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
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

1. `.spec/prd/subscriptions-redesign/tasks/epic-2-cards/US-CARD-002.md` - Full specification
2. `components/subscriptions/VideoCard.tsx` - Follow established patterns
3. `hooks/use-theme.ts` - Theme hook usage

## NOTES

This component follows the same patterns as VideoCard but with article-specific layout. Hero image is the primary visual, with summary and metadata below. Read time helps users decide if they want to invest in reading.

This is the missing piece from Epic 2 - the INDEX.md claimed Epic 2 was "COMPLETE" but ArticleCard was never implemented.
