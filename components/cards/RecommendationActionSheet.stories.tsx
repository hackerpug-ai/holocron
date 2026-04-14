import type { Meta, StoryObj } from '@storybook/react-native'
import { RecommendationActionSheet } from './RecommendationActionSheet'
import type { RecommendationItemData } from './types/recommendation'

const meta = {
  title: 'Cards/RecommendationActionSheet',
  component: RecommendationActionSheet,
} satisfies Meta<typeof RecommendationActionSheet>

export default meta
type Story = StoryObj<typeof meta>

const mockItem: RecommendationItemData = {
  id: 'rec-1',
  title: 'Jane Doe',
  subtitle: 'Autism Specialist',
  description: 'Specializes in early intervention for children with ASD',
  confidence: 0.9,
  source: { name: 'Test Source', type: 'document' },
  contacts: [{ name: 'Jane Doe', role: 'Specialist', email: 'jane@example.com' }],
  tags: ['autism', 'pediatrics'],
  url: 'https://example.com/jane',
}

export const Open: Story = {
  args: {
    visible: true,
    item: mockItem,
    onDismiss: () => {},
  },
}

export const Closed: Story = {
  args: {
    visible: false,
    item: mockItem,
    onDismiss: () => {},
  },
}

export const NoUrl: Story = {
  args: {
    visible: true,
    item: {
      ...mockItem,
      url: '',
    },
    onDismiss: () => {},
  },
}

export const LongTitle: Story = {
  args: {
    visible: true,
    item: {
      ...mockItem,
      title: 'Dr. Jane Doe-Smith PhD LCSW BCBA with a very long name that might wrap',
    },
    onDismiss: () => {},
  },
}
