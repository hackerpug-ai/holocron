import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { FeedFilterChips, type FeedCategory } from './FeedFilterChips'

const meta: Meta<typeof FeedFilterChips> = {
  title: 'Components/Subscriptions/FeedFilterChips',
  component: FeedFilterChips,
  parameters: {
    docs: {
      description: {
        component:
          'Horizontal scrollable category filter chips for the subscription feed. Displays chips with item counts for All, Video, Articles, Social, and Releases content types.',
      },
    },
  },
  argTypes: {
    activeCategory: {
      control: { type: 'select' },
      options: ['all', 'video', 'articles', 'social', 'releases'],
      description: 'Currently selected category',
    },
    counts: {
      control: { type: 'object' },
      description: 'Count data for each category',
    },
    testID: {
      control: { type: 'text' },
      description: 'Test ID prefix for testing',
    },
  },
  args: {
    activeCategory: 'all',
    counts: {
      all: 42,
      video: 15,
      articles: 20,
      social: 5,
      releases: 2,
    },
    testID: 'feed-filter-chips',
  },
}

export default meta
type Story = StoryObj<typeof FeedFilterChips>

export const Default: Story = {}

export const AllCategoriesActive: Story = {
  render: () => {
    const categories: FeedCategory[] = ['all', 'video', 'articles', 'social', 'releases']
    const counts = {
      all: 42,
      video: 15,
      articles: 20,
      social: 5,
      releases: 2,
    }

    return (
      <View style={{ padding: 16, gap: 16 }}>
        {categories.map((category) => (
          <FeedFilterChips
            key={category}
            activeCategory={category}
            onCategoryChange={() => {}}
            counts={counts}
            testID={`feed-filter-chips-${category}`}
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
      articles: 0,
      social: 0,
      releases: 0,
    },
  },
}

export const LargeCounts: Story = {
  args: {
    counts: {
      all: 999,
      video: 250,
      articles: 500,
      social: 200,
      releases: 49,
    },
  },
}

export const SingleCategory: Story = {
  args: {
    counts: {
      all: 15,
      video: 15,
      articles: 0,
      social: 0,
      releases: 0,
    },
  },
}

export const VideoActive: Story = {
  args: {
    activeCategory: 'video',
  },
}

export const ArticlesActive: Story = {
  args: {
    activeCategory: 'articles',
  },
}

export const SocialActive: Story = {
  args: {
    activeCategory: 'social',
  },
}

export const ReleasesActive: Story = {
  args: {
    activeCategory: 'releases',
  },
}
