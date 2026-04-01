# US-CARD-003: Social Card Component

> Task ID: US-CARD-003
> Type: FEATURE
> Priority: P1
> Estimate: 90 minutes
> Assignee: react-native-ui-implementer

## CRITICAL CONSTRAINTS

### MUST
- Follow theme system using semantic tokens (no hardcoded colors/spacing)
- Use react-native-paper Text component with variants (no react-native Text)
- Include testID on all interactive elements for E2E testing
- Handle missing avatar gracefully with initials fallback
- Support both light and dark modes via theme

### NEVER
- Hardcode colors, spacing, or typography values
- Use react-native Text instead of react-native-paper Text
- Block the UI while avatar loads
- Crash on missing/invalid avatar URLs

### STRICTLY
- Follow existing card patterns for consistency
- Keep component under 200 lines
- Use FastImage for optimized avatar loading

## SPECIFICATION

**Objective:** Build a social post card with circular author avatar, content preview, engagement metrics, and source badge.

**Success looks like:** Social cards render with circular avatars (or initials fallback), author info, 2-3 line content preview, and optional engagement metrics.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | SocialCard with valid authorAvatarUrl | Component renders | Circular avatar displays with author name and handle | `getByTestId('social-card-avatar')` exists |
| 2 | SocialCard without authorAvatarUrl | Component renders | Initials fallback shows (e.g., "JD" for John Doe) | `getByTestId('social-card-initials')` exists |
| 3 | SocialCard with engagement metrics | Component renders | Likes and comments display (e.g., "♥ 24 • 💬 8") | `getByText(/24.*8/)` exists |
| 4 | User taps SocialCard | onPress fires | Callback invoked | `fireEvent.press(getByTestId('social-card-pressable'))` |
| 5 | SocialCard with long contentPreview | Component renders | Preview truncates to 2-3 lines | Visual verification in Storybook |

## GUARDRAILS

### WRITE-ALLOWED
- `components/subscriptions/SocialCard.tsx` (NEW)
- `components/subscriptions/SocialCard.stories.tsx` (NEW)
- `components/subscriptions/SocialCard.test.tsx` (NEW)

### WRITE-PROHIBITED
- `app/**` - routing changes in separate task
- `convex/**` - backend changes in separate task
- `VideoCard.tsx`, `ArticleCard.tsx` - modify only if extracting shared patterns

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-CARD-003 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-2.3 Social Card Component

### Interaction Notes
- Card should feel tappable (opacity change on press)
- Avatar should be circular (40x40)
- Content preview should be scannable (2-3 lines)
- Source badge distinguishes platform (Twitter/X, Bluesky, etc.)

### Code Pattern

Source: `US-CARD-001` (VideoCard pattern)

```typescript
// Pattern: Follow card structure with social-specific layout
import { View, Pressable, StyleSheet } from 'react-native'
import { Text } from 'react-native-paper'
import { useSemanticTheme } from '@/hooks/use-semantic-theme'
import FastImage from 'react-native-fast-image'

interface SocialCardProps {
  authorAvatarUrl?: string
  authorName: string
  authorHandle: string
  contentPreview: string
  likes?: number
  comments?: number
  source: string // "Twitter/X" | "Bluesky" | etc.
  publishedAt?: string
  onPress?: () => void
  testID?: string
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function SocialCard({
  authorAvatarUrl,
  authorName,
  authorHandle,
  contentPreview,
  likes,
  comments,
  source,
  publishedAt,
  onPress,
  testID = 'social-card'
}: SocialCardProps) {
  const { semantic } = useSemanticTheme()
  
  return (
    <Pressable 
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        { 
          opacity: pressed ? 0.7 : 1,
          backgroundColor: semantic.color.surface.default,
          borderColor: semantic.color.border.default,
        }
      ]}
    >
      <View style={[styles.header, { padding: semantic.space.md }]}>
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {authorAvatarUrl ? (
            <FastImage
              testID={`${testID}-avatar`}
              source={{ uri: authorAvatarUrl }}
              style={styles.avatar}
              resizeMode={FastImage.resizeMode.cover}
            />
          ) : (
            <View 
              testID={`${testID}-initials`}
              style={[styles.initialsFallback, { backgroundColor: semantic.color.primary.muted }]}
            >
              <Text variant="labelMedium" style={{ color: semantic.color.onPrimary.default }}>
                {getInitials(authorName)}
              </Text>
            </View>
          )}
        </View>
        
        {/* Author info */}
        <View style={styles.authorInfo}>
          <Text variant="titleSmall" numberOfLines={1} style={{ color: semantic.color.onSurface.default }}>
            {authorName}
          </Text>
          <Text variant="bodySmall" style={{ color: semantic.color.onSurface.muted }}>
            @{authorHandle}
          </Text>
        </View>
        
        {/* Source badge */}
        <View style={[styles.sourceBadge, { backgroundColor: semantic.color.surface.muted }]}>
          <Text variant="labelSmall" style={{ color: semantic.color.onSurface.subtle }}>
            {source}
          </Text>
        </View>
      </View>
      
      {/* Content preview */}
      <View style={[styles.content, { paddingHorizontal: semantic.space.md, paddingBottom: semantic.space.md }]}>
        <Text variant="bodyMedium" numberOfLines={3} style={{ color: semantic.color.onSurface.default }}>
          {contentPreview}
        </Text>
        
        {/* Engagement metrics */}
        {(likes !== undefined || comments !== undefined) && (
          <View style={styles.metrics}>
            {likes !== undefined && (
              <Text variant="labelSmall" style={{ color: semantic.color.onSurface.subtle }}>
                ♥ {likes}
              </Text>
            )}
            {comments !== undefined && (
              <Text variant="labelSmall" style={{ color: semantic.color.onSurface.subtle }}>
                • 💬 {comments}
              </Text>
            )}
          </View>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarContainer: {
    width: 40,
    height: 40,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  initialsFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorInfo: {
    flex: 1,
    gap: 2,
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  content: {
    gap: 8,
  },
  metrics: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
})
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Square avatar, no fallback
<Image source={{ uri: authorAvatarUrl }} style={{ width: 40, height: 40 }} />
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use semantic theme tokens for all colors
  - Use react-native-paper Text with variants
  - Include testID on all interactive elements
  - Handle missing data gracefully

## DEPENDENCIES

No task dependencies (foundational component).

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-CARD-003 acceptance criteria
2. `US-CARD-001`, `US-CARD-002` - Follow established card patterns

## NOTES

Social cards have a horizontal layout with avatar on the left, unlike video/article cards which have images on top. The initials fallback provides a polished experience when avatars are unavailable.
