import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { NewsfeedFilterBar, type NewsfeedFilterBarOption } from './NewsfeedFilterBar'

const meta = {
  title: 'Components/NewsfeedFilterBar',
  component: NewsfeedFilterBar,
  parameters: {
    docs: {
      description: {
        component:
          'Horizontal scrollable filter bar for newsfeed categories. Shows ALL pill with total count, plus individual category pills with icons and counts.',
      },
    },
  },
  argTypes: {
    options: {
      control: { type: 'object' },
      description: 'Array of filter options with key, label, and count',
    },
    selected: {
      control: { type: 'text' },
      description: 'Currently selected filter key (or "all")',
    },
    onChange: {
      action: 'onChange',
      description: 'Callback when filter is changed',
    },
  },
  args: {
    options: [
      { key: 'discovery', label: 'Discovery', count: 5 },
      { key: 'release', label: 'Release', count: 3 },
      { key: 'trend', label: 'Trend', count: 2 },
      { key: 'discussion', label: 'Discussion', count: 1 },
    ],
    selected: 'all',
  },
  decorators: [
    (Story) => (
      <View className="bg-background">
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof NewsfeedFilterBar>

export default meta
type Story = StoryObj<typeof NewsfeedFilterBar>

export const Default: Story = {}

export const AllVariants: Story = {
  args: {
    options: [
      { key: 'discovery', label: 'Discovery', count: 5 },
      { key: 'release', label: 'Release', count: 3 },
      { key: 'trend', label: 'Trend', count: 2 },
      { key: 'discussion', label: 'Discussion', count: 1 },
    ],
    selected: 'all',
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows all filter variants including ALL pill and all category pills (discovery, release, trend, discussion).',
      },
    },
  },
}

export const DiscoverySelected: Story = {
  args: {
    options: [
      { key: 'discovery', label: 'Discovery', count: 5 },
      { key: 'release', label: 'Release', count: 3 },
      { key: 'trend', label: 'Trend', count: 2 },
      { key: 'discussion', label: 'Discussion', count: 1 },
    ],
    selected: 'discovery',
  },
  parameters: {
    docs: {
      description: {
        story: 'Discovery filter selected with active styling.',
      },
    },
  },
}

export const ReleaseSelected: Story = {
  args: {
    options: [
      { key: 'discovery', label: 'Discovery', count: 5 },
      { key: 'release', label: 'Release', count: 3 },
      { key: 'trend', label: 'Trend', count: 2 },
      { key: 'discussion', label: 'Discussion', count: 1 },
    ],
    selected: 'release',
  },
  parameters: {
    docs: {
      description: {
        story: 'Release filter selected with active styling.',
      },
    },
  },
}

export const TrendSelected: Story = {
  args: {
    options: [
      { key: 'discovery', label: 'Discovery', count: 5 },
      { key: 'release', label: 'Release', count: 3 },
      { key: 'trend', label: 'Trend', count: 2 },
      { key: 'discussion', label: 'Discussion', count: 1 },
    ],
    selected: 'trend',
  },
  parameters: {
    docs: {
      description: {
        story: 'Trend filter selected with active styling.',
      },
    },
  },
}

export const DiscussionSelected: Story = {
  args: {
    options: [
      { key: 'discovery', label: 'Discovery', count: 5 },
      { key: 'release', label: 'Release', count: 3 },
      { key: 'trend', label: 'Trend', count: 2 },
      { key: 'discussion', label: 'Discussion', count: 1 },
    ],
    selected: 'discussion',
  },
  parameters: {
    docs: {
      description: {
        story: 'Discussion filter selected with active styling.',
      },
    },
  },
}

export const ZeroCounts: Story = {
  args: {
    options: [
      { key: 'discovery', label: 'Discovery', count: 0 },
      { key: 'release', label: 'Release', count: 0 },
      { key: 'trend', label: 'Trend', count: 0 },
      { key: 'discussion', label: 'Discussion', count: 0 },
    ],
    selected: 'all',
  },
  parameters: {
    docs: {
      description: {
        story: 'All categories have zero counts (edge case handling).',
      },
    },
  },
}

export const LargeCounts: Story = {
  args: {
    options: [
      { key: 'discovery', label: 'Discovery', count: 999 },
      { key: 'release', label: 'Release', count: 500 },
      { key: 'trend', label: 'Trend', count: 250 },
      { key: 'discussion', label: 'Discussion', count: 100 },
    ],
    selected: 'all',
  },
  parameters: {
    docs: {
      description: {
        story: 'Large count numbers to test layout stability.',
      },
    },
  },
}

export const SingleCategory: Story = {
  args: {
    options: [{ key: 'discovery', label: 'Discovery', count: 1 }],
    selected: 'all',
  },
  parameters: {
    docs: {
      description: {
        story: 'Single category available (minimal state).',
      },
    },
  },
}
