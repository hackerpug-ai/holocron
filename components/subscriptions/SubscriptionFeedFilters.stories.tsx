import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import {
  SubscriptionFeedFilters,
  type FilterType,
} from './SubscriptionFeedFilters'

const meta: Meta<typeof SubscriptionFeedFilters> = {
  title: 'Components/SubscriptionFeedFilters',
  component: SubscriptionFeedFilters,
  parameters: {
    docs: {
      description: {
        component:
          'Horizontal scrollable filter bar for subscription feed content. Displays filter chips with count badges for All, Video, Blog, and Social content types.',
      },
    },
  },
  argTypes: {
    selectedFilter: {
      control: { type: 'select' },
      options: ['all', 'video', 'blog', 'social'],
      description: 'Currently selected filter type',
    },
    counts: {
      control: { type: 'object' },
      description: 'Count data for each filter type',
    },
    testID: {
      control: { type: 'text' },
      description: 'Test ID prefix for testing',
    },
  },
  args: {
    selectedFilter: 'all',
    counts: {
      all: 42,
      video: 15,
      blog: 20,
      social: 7,
    },
    testID: 'feed-filters',
  },
}

export default meta
type Story = StoryObj<typeof SubscriptionFeedFilters>

export const Default: Story = {}

export const AllFiltersSelected: Story = {
  render: () => {
    const filters: FilterType[] = ['all', 'video', 'blog', 'social']
    const counts = {
      all: 42,
      video: 15,
      blog: 20,
      social: 7,
    }

    return (
      <View style={{ padding: 16, gap: 16 }}>
        {filters.map((filter) => (
          <SubscriptionFeedFilters
            key={filter}
            selectedFilter={filter}
            onFilterChange={() => {}}
            counts={counts}
            testID={`feed-filters-${filter}`}
          />
        ))}
      </View>
    )
  },
}

export const ZeroCounts: Story = {
  args: {
    counts: {
      all: 0,
      video: 0,
      blog: 0,
      social: 0,
    },
  },
}

export const LargeCounts: Story = {
  args: {
    counts: {
      all: 999,
      video: 250,
      blog: 500,
      social: 249,
    },
  },
}

export const SingleFilterType: Story = {
  args: {
    counts: {
      all: 15,
      video: 15,
      blog: 0,
      social: 0,
    },
  },
}
