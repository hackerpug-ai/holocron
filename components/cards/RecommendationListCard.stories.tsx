import type { Meta, StoryObj } from '@storybook/react-native'
import { RecommendationListCard } from './RecommendationListCard'
import type { RecommendationListCardData } from './types/recommendation'

const meta = {
  title: 'Cards/RecommendationListCard',
  component: RecommendationListCard,
} satisfies Meta<typeof RecommendationListCard>

export default meta
type Story = StoryObj<typeof meta>

const createMockData = (itemCount: number): RecommendationListCardData => ({
  card_type: 'recommendation_list',
  items: Array.from({ length: itemCount }, (_, i) => ({
    id: `rec-${i}`,
    title: `Specialist ${i + 1}`,
    subtitle: `Therapist Type ${i + 1}`,
    description: `Description for specialist ${i + 1}`,
    confidence: 0.8 + (i % 3) * 0.05,
    source: { name: 'Test Source', type: 'document' },
    contacts: [
      {
        name: `Specialist ${i + 1}`,
        role: 'Therapist',
        phone: i % 2 === 0 ? '(415) 555-1234' : undefined,
        location: i % 2 === 0 ? 'Oakland, CA' : undefined,
      },
    ],
    tags: ['therapy', 'autism'],
    url: `https://example.com/${i}`,
  })),
  summary: 'Found specialists for autism therapy in the Oakland area',
})

export const Default: Story = {
  args: {
    data: createMockData(3),
    onItemPress: () => {},
    onSaveAllToKB: () => {},
    onSaveRecommendation: () => {},
  },
}

export const MinimumItems: Story = {
  args: {
    data: createMockData(3),
    onItemPress: () => {},
    onSaveAllToKB: () => {},
    onSaveRecommendation: () => {},
  },
}

export const MaximumItems: Story = {
  args: {
    data: createMockData(7),
    onItemPress: () => {},
    onSaveAllToKB: () => {},
    onSaveRecommendation: () => {},
  },
}

export const WithMissingFields: Story = {
  args: {
    data: {
      card_type: 'recommendation_list',
      items: [
        {
          id: 'rec-1',
          title: 'Incomplete Item',
          confidence: 0.8,
          source: { name: 'Test', type: 'document' },
          contacts: [{ name: 'Test', role: 'Test' }],
          tags: [],
          url: '',
        },
      ],
      summary: 'Test summary',
    },
    onItemPress: () => {},
    onSaveAllToKB: () => {},
    onSaveRecommendation: () => {},
  },
}

export const NoSources: Story = {
  args: {
    data: createMockData(2),
    onItemPress: () => {},
    onSaveAllToKB: () => {},
    onSaveRecommendation: () => {},
  },
}

export const DarkMode: Story = {
  args: {
    data: createMockData(3),
    onItemPress: () => {},
    onSaveAllToKB: () => {},
    onSaveRecommendation: () => {},
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
}

export const LongQuery: Story = {
  args: {
    data: {
      ...createMockData(3),
      summary: 'This is a very long summary that describes in great detail the search results and what they mean for the user. It should wrap properly across multiple lines.',
    },
    onItemPress: () => {},
    onSaveAllToKB: () => {},
    onSaveRecommendation: () => {},
  },
}

export const ActionSheetOpen: Story = {
  args: {
    data: createMockData(1),
    onItemPress: () => {},
    onSaveAllToKB: () => {},
    onSaveRecommendation: () => {},
  },
  parameters: {
    // This story simulates the state after a long-press
    // In a real scenario, the component would manage this internally
  },
}
