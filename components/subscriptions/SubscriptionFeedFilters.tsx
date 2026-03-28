import { ScrollView, StyleSheet, View } from 'react-native'
import { FilterChip } from '@/components/FilterChip'
import { useTheme } from '@/hooks/use-theme'

export type FilterType = 'all' | 'video' | 'blog' | 'social'

interface FilterOption {
  type: FilterType
  label: string
  count: number
}

interface SubscriptionFeedFiltersProps {
  /** Currently selected filter type */
  selectedFilter: FilterType
  /** Callback when filter is changed */
  onFilterChange: (filter: FilterType) => void
  /** Count data for each filter type */
  counts: {
    all: number
    video: number
    blog: number
    social: number
  }
  /** Test ID prefix for testing */
  testID?: string
}

const FILTER_OPTIONS: FilterOption[] = [
  { type: 'all', label: 'All', count: 0 },
  { type: 'video', label: 'Video', count: 0 },
  { type: 'blog', label: 'Blog', count: 0 },
  { type: 'social', label: 'Social', count: 0 },
]

export function SubscriptionFeedFilters({
  selectedFilter,
  onFilterChange,
  counts,
  testID = 'feed-filters',
}: SubscriptionFeedFiltersProps) {
  const { spacing, colors } = useTheme()

  const optionsWithCounts = FILTER_OPTIONS.map((opt) => ({
    ...opt,
    count: counts[opt.type],
  }))

  return (
    <View
      style={[
        styles.container,
        {
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          borderBottomColor: colors.border,
        },
      ]}
      testID={testID}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { gap: spacing.sm }]}
        testID={`${testID}-scroll`}
      >
        {optionsWithCounts.map(({ type, label, count }) => (
          <FilterChip
            key={type}
            label={`${label} (${count})`}
            selected={selectedFilter === type}
            onPress={() => onFilterChange(selectedFilter === type ? 'all' : type)}
            testID={`${testID}-${type}`}
          />
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: {
    gap: 0,
  },
})
