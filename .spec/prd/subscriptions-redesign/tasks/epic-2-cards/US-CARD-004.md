# US-CARD-004: Release Card Component

> Task ID: US-CARD-004
> Type: FEATURE
> Priority: P1
> Estimate: 90 minutes
> Assignee: react-native-ui-implementer

## CRITICAL CONSTRAINTS

### MUST
- Follow theme system using semantic tokens (no hardcoded colors/spacing)
- Use react-native-paper Text component with variants (no react-native Text)
- Include testID on all interactive elements for E2E testing
- Display version badge prominently
- Support both light and dark modes via theme

### NEVER
- Hardcode colors, spacing, or typography values
- Use react-native Text instead of react-native-paper Text
- Hide version badge (key differentiator for releases)
- Block the UI while loading

### STRICTLY
- Follow existing card patterns for consistency
- Keep component under 200 lines
- Version badge should be visually distinct (pill shape)

## SPECIFICATION

**Objective:** Build a release card with version badge, 2-3 line summary, repository name, and optional changelog link.

**Success looks like:** Release cards render with prominent version badges, concise summaries, and are tappable to view changelog or release notes.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | ReleaseCard with version "v2.1.0" | Component renders | Version badge displays prominently as pill | `getByText('v2.1.0')` exists |
| 2 | ReleaseCard with summary | Component renders | Summary truncates to 2-3 lines | Visual verification in Storybook |
| 3 | ReleaseCard with changelogUrl | Component renders | "View changelog" button displays | `getByTestId('release-card-changelog-btn')` exists |
| 4 | User taps ReleaseCard | onPress fires | Callback invoked | `fireEvent.press(getByTestId('release-card-pressable'))` |
| 5 | ReleaseCard without repositoryName | Component renders | Falls back to source name | `getByText('GitHub')` exists |

## GUARDRAILS

### WRITE-ALLOWED
- `components/subscriptions/ReleaseCard.tsx` (NEW)
- `components/subscriptions/ReleaseCard.stories.tsx` (NEW)
- `components/subscriptions/ReleaseCard.test.tsx` (NEW)

### WRITE-PROHIBITED
- `app/**` - routing changes in separate task
- `convex/**` - backend changes in separate task
- Other card components - modify only if extracting shared patterns

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-CARD-004 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-2.4 Release Card Component

### Interaction Notes
- Version badge should stand out (semantic color.primary or similar)
- Repository name helps identify source
- "View changelog" is secondary action (if available)
- Card should feel tappable (opacity change on press)

### Code Pattern

Source: `US-CARD-001` (VideoCard pattern)

```typescript
// Pattern: Follow card structure with release-specific layout
import { View, Pressable, StyleSheet } from 'react-native'
import { Text, Button } from 'react-native-paper'
import { useSemanticTheme } from '@/hooks/use-semantic-theme'

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

export function ReleaseCard({
  version,
  title,
  summary,
  repositoryName,
  source,
  publishedAt,
  changelogUrl,
  onPress,
  testID = 'release-card'
}: ReleaseCardProps) {
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
      {/* Header with version badge */}
      <View style={[styles.header, { padding: semantic.space.md }]}>
        <View 
          testID={`${testID}-version-badge`}
          style={[
            styles.versionBadge, 
            { backgroundColor: semantic.color.primary.default }
          ]}
        >
          <Text 
            variant="labelMedium" 
            style={{ color: semantic.color.onPrimary.default }}
          >
            {version}
          </Text>
        </View>
        
        <View style={styles.sourceInfo}>
          <Text 
            variant="labelSmall" 
            style={{ color: semantic.color.onSurface.subtle }}
          >
            {repositoryName || source}
          </Text>
          {publishedAt && (
            <Text 
              variant="labelSmall" 
              style={{ color: semantic.color.onSurface.subtle }}
            >
              • {publishedAt}
            </Text>
          )}
        </View>
      </View>
      
      {/* Content */}
      <View style={[styles.content, { paddingHorizontal: semantic.space.md, paddingBottom: semantic.space.md }]}>
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
        
        {/* Changelog link */}
        {changelogUrl && (
          <Button 
            testID={`${testID}-changelog-btn`}
            mode="text" 
            compact
            onPress={onPress}
            style={{ alignSelf: 'flex-start', marginTop: semantic.space.sm }}
          >
            View changelog
          </Button>
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
    justifyContent: 'space-between',
  },
  versionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16, // Pill shape
  },
  sourceInfo: {
    flexDirection: 'row',
    gap: 4,
  },
  content: {
    gap: 8,
  },
})
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Plain version text, no badge styling
<Text>v2.1.0</Text>
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use semantic theme tokens for all colors
  - Use react-native-paper Text with variants
  - Include testID on all interactive elements
  - Button component from paper for actions

## DEPENDENCIES

No task dependencies (foundational component).

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-CARD-004 acceptance criteria
2. `US-CARD-001`, `US-CARD-002`, `US-CARD-003` - Follow established card patterns

## NOTES

Release cards are for developers tracking library updates. The version badge is the key visual element that helps developers quickly identify if they need this update. Repository name helps when tracking multiple libraries.
