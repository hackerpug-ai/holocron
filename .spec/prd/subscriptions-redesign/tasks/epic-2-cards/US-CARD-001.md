# US-CARD-001: Video Card Component

> Task ID: US-CARD-001
> Type: FEATURE
> Priority: P0
> Estimate: 120 minutes
> Assignee: react-native-ui-implementer

## CRITICAL CONSTRAINTS

### MUST
- Follow theme system using semantic tokens (no hardcoded colors/spacing)
- Use react-native-paper Text component with variants (no react-native Text)
- Include testID on all interactive elements for E2E testing
- Handle missing thumbnail gracefully with fallback UI
- Support both light and dark modes via theme

### NEVER
- Hardcode colors, spacing, or typography values
- Use react-native Text instead of react-native-paper Text
- Block the UI while images load
- Crash on missing/invalid thumbnail URLs

### STRICTLY
- Follow existing card patterns from codebase
- Keep component under 200 lines
- Use FastImage for optimized image loading

## SPECIFICATION

**Objective:** Build a visually rich video card component with 16:9 thumbnail, duration overlay, play icon, and metadata.

**Success looks like:** Video cards render with thumbnails (or fallback), duration badges, source info, and are tappable to open content in WebViewSheet.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | VideoCard with valid thumbnailUrl | Component renders | 16:9 FastImage displays with duration overlay and play icon | `getByTestId('video-card-thumbnail')` exists |
| 2 | VideoCard without thumbnailUrl | Component renders | Fallback UI shows play icon on colored background | `getByTestId('video-card-fallback')` exists |
| 3 | User taps VideoCard | onPress fires | Callback invoked with finding data | `fireEvent.press(getByTestId('video-card-pressable'))` |
| 4 | VideoCard with long title | Component renders | Title truncates to 2 lines with ellipsis | Visual verification in Storybook |
| 5 | Dark mode active | Component renders | All colors from semantic theme | Visual verification in Storybook |

## GUARDRAILS

### WRITE-ALLOWED
- `components/subscriptions/VideoCard.tsx` (NEW)
- `components/subscriptions/VideoCard.stories.tsx` (NEW)
- `components/subscriptions/VideoCard.test.tsx` (NEW)

### WRITE-PROHIBITED
- `app/**` - routing changes in separate task
- `convex/**` - backend changes in separate task
- `hooks/useWhatsNewFeed*` - hook modifications in separate task

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-CARD-001 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-2.1 Video Card Component

### Interaction Notes
- Card should feel tappable (opacity change on press)
- Image should load progressively (skeleton → image)
- Duration badge positioned bottom-right of thumbnail
- Play icon centered on thumbnail

### Code Pattern

Source: `components/subscriptions/WhatsNewFindingCard.tsx:1-100`

```typescript
// Pattern: Existing card structure with theme tokens
import { View, Pressable, StyleSheet } from 'react-native'
import { Text } from 'react-native-paper'
import { useSemanticTheme } from '@/hooks/use-semantic-theme'
import FastImage from 'react-native-fast-image'

export function VideoCard({ thumbnailUrl, duration, title, source, onPress, testID }: VideoCardProps) {
  const { semantic } = useSemanticTheme()
  
  return (
    <Pressable 
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        { opacity: pressed ? 0.7 : 1 }
      ]}
    >
      {/* Thumbnail with overlays */}
      <View style={styles.thumbnailContainer}>
        {thumbnailUrl ? (
          <FastImage
            testID={`${testID}-thumbnail`}
            source={{ uri: thumbnailUrl }}
            style={styles.thumbnail}
            resizeMode={FastImage.resizeMode.cover}
          />
        ) : (
          <View testID={`${testID}-fallback`} style={styles.fallback}>
            <PlayIcon />
          </View>
        )}
        {duration && (
          <View style={styles.durationBadge}>
            <Text variant="labelSmall">{duration}</Text>
          </View>
        )}
        <View style={styles.playIcon}>
          <PlayIcon />
        </View>
      </View>
      
      {/* Metadata below thumbnail */}
      <View style={styles.metadata}>
        <Text variant="titleMedium" numberOfLines={2}>{title}</Text>
        <Text variant="bodySmall" style={{ color: semantic.color.onSurface.muted }}>
          {source}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumbnailContainer: {
    aspectRatio: 16/9,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#333', // Will be replaced with theme token
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  playIcon: {
    position: 'absolute',
    alignSelf: 'center',
    justifyContent: 'center',
  },
  metadata: {
    padding: 12,
    gap: 4,
  },
})
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Hardcoded colors, wrong Text component
import { Text, View } from 'react-native'

<Text style={{ color: '#666', fontSize: 14 }}>{source}</Text>
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use semantic theme tokens for all colors
  - Use react-native-paper Text with variants
  - Include testID on all interactive elements
  - Handle loading and error states gracefully

## DEPENDENCIES

No task dependencies (foundational component).

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-CARD-001 acceptance criteria
2. `components/subscriptions/WhatsNewFindingCard.tsx` - Existing card patterns
3. `hooks/use-semantic-theme.ts` - Theme hook usage

## NOTES

This is a foundational component for the multimedia card stream. Other card variants will follow this pattern. Focus on getting the 16:9 thumbnail layout, overlays, and fallback behavior correct first.
