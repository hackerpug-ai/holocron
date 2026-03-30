import { ScrollView, StyleSheet, View } from 'react-native'
import { FilterChip } from '@/components/FilterChip'
import { useTheme } from '@/hooks/use-theme'

export interface FilterOption {
  key: string
  label: string
  count: number
}

interface SubscriptionFeedFiltersProps {
  /** Filter options to display (All is prepended automatically) */
  options: FilterOption[]
  /** Currently selected filter key */
  selectedFilter: string
  /** Callback when filter is changed */
  onFilterChange: (filter: string) => void
  /** Test ID prefix for testing */
  testID?: string
}

export function SubscriptionFeedFilters({
  options,
  selectedFilter,
  onFilterChange,
  testID = 'feed-filters',
}: SubscriptionFeedFiltersProps) {
  const { spacing, colors } = useTheme()

  // "All" always prepended, sum of all option counts
  const allCount = options.reduce((sum, opt) => sum + opt.count, 0)
  const allOptions: FilterOption[] = [
    { key: 'all', label: 'All', count: allCount },
    ...options,
  ]

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
        {allOptions.map(({ key, label, count }) => (
          <FilterChip
            key={key}
            label={`${label} (${count})`}
            selected={selectedFilter === key}
            onPress={() => onFilterChange(selectedFilter === key ? 'all' : key)}
            testID={`${testID}-${key}`}
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
