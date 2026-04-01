# US-CARD-006: Category Filter Chips

> Task ID: US-CARD-006
> Type: FEATURE
> Priority: P0
> Estimate: 60 minutes
> Assignee: react-native-ui-implementer

## CRITICAL CONSTRAINTS

### MUST
- Follow theme system using semantic tokens (no hardcoded colors/spacing)
- Use react-native-paper Text component with variants (no react-native Text)
- Include testID on all interactive elements for E2E testing
- Show count of items per category
- Persist filter selection across refreshes (via state)

### NEVER
- Hardcode colors, spacing, or typography values
- Use react-native Text instead of react-native-paper Text
- Reset filter selection on every render
- Block UI while calculating counts

### STRICTLY
- Reuse existing FilterChip component if available
- Support horizontal scrolling for many categories
- Keep chip layout responsive

## SPECIFICATION

**Objective:** Build category filter chips that allow users to filter the feed by content type (All, Video, Articles, Social, Releases).

**Success looks like:** Filter chips appear below the search bar, show item counts, active chip is visually distinct, and selection persists across refreshes.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | FeedFilterChips with categories | Component renders | Chips display with counts (e.g., "All (42)") | `getByText(/All.*42/)` exists |
| 2 | User taps inactive chip | onPress fires | onCategoryChange called with new category | `fireEvent.press(getByTestId('filter-chip-video'))` |
| 3 | Chip is active | Component renders | Active chip has distinct visual style | Visual verification in Storybook |
| 4 | User taps active chip | onPress fires | Filter remains active (no toggle off) | State remains unchanged |
| 5 | Category has zero items | Component renders | Chip shows count of 0 but remains tappable | `getByText(/Releases.*0/)` exists |

## GUARDRAILS

### WRITE-ALLOWED
- `components/subscriptions/FeedFilterChips.tsx` (NEW)
- `components/subscriptions/FeedFilterChips.stories.tsx` (NEW)
- `components/subscriptions/FeedFilterChips.test.tsx` (NEW)

### WRITE-PROHIBITED
- `app/**` - routing changes in separate task
- `convex/**` - backend changes in separate task
- `FeedScreen.tsx` - integration in separate task (US-CARD-007)

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-CARD-005 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-5.1 Category Filtering

### Interaction Notes
- Chips should be horizontally scrollable
- Active chip should be visually distinct (filled background)
- Inactive chips should have outlined style
- Counts should update when feed data changes

### Code Pattern

Source: `components/subscriptions/SubscriptionFeedFilters.tsx:1-50`

```typescript
// Pattern: Horizontal scrollable chip list with active state
import { View, ScrollView, Pressable, StyleSheet } from 'react-native'
import { Text } from 'react-native-paper'
import { useSemanticTheme } from '@/hooks/use-semantic-theme'

export type FeedCategory = 'all' | 'video' | 'articles' | 'social' | 'releases'

interface CategoryCount {
  category: FeedCategory
  count: number
  label: string
}

interface FeedFilterChipsProps {
  activeCategory: FeedCategory
  onCategoryChange: (category: FeedCategory) => void
  counts: Record<FeedCategory, number>
  testID?: string
}

const CATEGORY_ORDER: FeedCategory[] = ['all', 'video', 'articles', 'social', 'releases']

const CATEGORY_LABELS: Record<FeedCategory, string> = {
  all: 'All',
  video: 'Video',
  articles: 'Articles',
  social: 'Social',
  releases: 'Releases',
}

export function FeedFilterChips({
  activeCategory,
  onCategoryChange,
  counts,
  testID = 'feed-filter-chips'
}: FeedFilterChipsProps) {
  const { semantic } = useSemanticTheme()
  
  return (
    <View 
      testID={testID}
      style={[
        styles.container, 
        { 
          backgroundColor: semantic.color.surface.default,
          borderBottomColor: semantic.color.border.default,
          borderBottomWidth: 1,
        }
      ]}
    >
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent, 
          { paddingHorizontal: semantic.space.md, gap: semantic.space.sm }
        ]}
      >
        {CATEGORY_ORDER.map((category) => {
          const isActive = activeCategory === category
          const count = counts[category]
          const label = CATEGORY_LABELS[category]
          
          return (
            <Pressable
              key={category}
              testID={`filter-chip-${category}`}
              onPress={() => onCategoryChange(category)}
              style={({ pressed }) => [
                styles.chip,
                {
                  opacity: pressed ? 0.7 : 1,
                  backgroundColor: isActive 
                    ? semantic.color.primary.default 
                    : 'transparent',
                  borderColor: isActive 
                    ? semantic.color.primary.default 
                    : semantic.color.border.default,
                  borderWidth: 1,
                  paddingHorizontal: semantic.space.md,
                  paddingVertical: semantic.space.sm,
                }
              ]}
            >
              <Text
                variant="labelMedium"
                style={{
                  color: isActive 
                    ? semantic.color.onPrimary.default 
                    : semantic.color.onSurface.default,
                }}
              >
                {label} ({count})
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  scrollContent: {
    flexDirection: 'row',
  },
  chip: {
    borderRadius: 16, // Pill shape
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Hardcoded colors, no counts
<TouchableOpacity style={{ backgroundColor: '#007AFF' }}>
  <Text>Video</Text>
</TouchableOpacity>
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use semantic theme tokens for all colors
  - Use react-native-paper Text with variants
  - Include testID on all interactive elements
  - Horizontal scroll for responsive layouts

## DEPENDENCIES

This task depends on:
- US-CARD-005 (FeedCard Router Component) - for category types

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-CARD-005 acceptance criteria
2. `components/subscriptions/SubscriptionFeedFilters.tsx` - existing filter patterns
3. `hooks/use-semantic-theme.ts` - Theme hook usage

## NOTES

The filter chips are a key navigation element for the feed. The "All" category should be first and selected by default. Counts help users understand content distribution. The horizontal scroll pattern allows for future category additions without layout changes.
