import { ScrollView, StyleSheet, View, Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { useTheme } from '@/hooks/use-theme'

export type FeedCategory = 'all' | 'video' | 'articles' | 'social' | 'releases'

interface FeedFilterChipsProps {
  /** Currently selected category */
  activeCategory: FeedCategory
  /** Callback when category is changed */
  onCategoryChange: (category: FeedCategory) => void
  /** Count of items per category */
  counts: Record<FeedCategory, number>
  /** Test ID prefix for testing */
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

/**
 * FeedFilterChips displays horizontally scrollable category filter chips
 * with item counts. Active chip is visually distinct with filled background.
 */
export function FeedFilterChips({
  activeCategory,
  onCategoryChange,
  counts,
  testID = 'feed-filter-chips',
}: FeedFilterChipsProps) {
  const { colors, spacing, radius } = useTheme()

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderBottomColor: colors.border,
          paddingVertical: spacing.md,
        },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: spacing.lg, gap: spacing.sm },
        ]}
        testID={`${testID}-scroll`}
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
              accessibilityRole="button"
              accessibilityLabel={`${isActive ? 'Selected' : 'Filter by'} ${label}. ${count} items`}
              accessibilityHint={isActive ? 'Currently selected' : 'Tap to filter'}
              accessibilityState={{ selected: isActive }}
              style={({ pressed }) => [
                styles.chip,
                {
                  opacity: pressed ? 0.7 : 1,
                  backgroundColor: isActive ? colors.primary : 'transparent',
                  borderColor: isActive ? colors.primary : colors.border,
                  borderWidth: 1,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.full,
                },
              ]}
            >
              <Text
                className="text-xs font-medium uppercase"
                style={{
                  color: isActive ? colors.primaryForeground : colors.foreground,
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: {
    flexDirection: 'row',
  },
  chip: {
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
