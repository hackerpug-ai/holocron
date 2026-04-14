import type { Meta, StoryObj } from '@storybook/react-native'
import { RecommendationItem } from './RecommendationItem'
import type { RecommendationItemData } from './types/recommendation'

const meta = {
  title: 'Cards/RecommendationItem',
  component: RecommendationItem,
} satisfies Meta<typeof RecommendationItem>

export default meta
type Story = StoryObj<typeof meta>

const baseItem: RecommendationItemData = {
  id: 'rec-1',
  title: 'Jane Doe',
  subtitle: 'Autism Specialist',
  description: 'Specializes in early intervention for children with ASD',
  confidence: 0.9,
  source: { name: 'Test Source', type: 'document' },
  contacts: [
    {
      name: 'Jane Doe',
      role: 'Specialist',
      email: 'jane@example.com',
      phone: '(415) 555-1234',
      location: 'Oakland, CA',
      avatarUrl: 'https://example.com/avatar.jpg',
    },
  ],
  tags: ['autism', 'pediatrics'],
  url: 'https://example.com/jane',
}

export const Default: Story = {
  args: {
    item: baseItem,
    index: 0,
    onLongPress: () => {},
  },
}

export const WithAllFields: Story = {
  args: {
    item: {
      ...baseItem,
      description: 'A comprehensive description of why this specialist is recommended for your specific needs.',
    },
    index: 0,
    onLongPress: () => {},
  },
}

export const WithMissingFields: Story = {
  args: {
    item: {
      id: 'rec-2',
      title: 'John Smith',
      confidence: 0.8,
      source: { name: 'Test', type: 'tool' },
      contacts: [{ name: 'John Smith', role: 'Therapist' }],
      tags: [],
      url: '',
    },
    index: 0,
    onLongPress: () => {},
  },
}

export const LongDescription: Story = {
  args: {
    item: {
      ...baseItem,
      description: 'This is a very long description that should wrap properly across multiple lines without breaking the layout or causing any overflow issues.',
    },
    index: 0,
    onLongPress: () => {},
  },
}

export const ManyTags: Story = {
  args: {
    item: {
      ...baseItem,
      tags: ['autism', 'pediatrics', 'speech-therapy', 'occupational-therapy', 'behavioral-therapy', 'early-intervention'],
    },
    index: 0,
    onLongPress: () => {},
  },
}

export const DarkMode: Story = {
  args: {
    item: baseItem,
    index: 0,
    onLongPress: () => {},
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
}
