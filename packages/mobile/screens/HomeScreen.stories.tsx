import type { Meta, StoryObj } from '@storybook/react'
import { HomeScreen } from './HomeScreen'

const meta = {
  title: 'Screens/HomeScreen',
  component: HomeScreen,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HomeScreen>

export default meta
type Story = StoryObj<typeof meta>

const mockArticles = [
  {
    id: '1',
    title: 'Understanding Large Language Models',
    category: 'deep-research' as const,
    date: '2026-02-28T10:30:00Z',
    snippet: 'A comprehensive overview of how LLMs work, from transformers to attention mechanisms.',
    iterationCount: 3,
  },
  {
    id: '2',
    title: 'React Native Performance Optimization',
    category: 'research' as const,
    date: '2026-02-27T14:15:00Z',
    snippet: 'Best practices for optimizing React Native apps, including memo, callbacks, and native modules.',
  },
  {
    id: '3',
    title: 'GraphQL vs REST: When to Use Which',
    category: 'factual' as const,
    date: '2026-02-26T09:00:00Z',
    snippet: 'A comparison of GraphQL and REST APIs with real-world use cases and trade-offs.',
  },
]

const mockStats = {
  totalArticles: 142,
  totalResearch: 28,
  recentQueries: 15,
  weeklyGrowth: 5,
}

export const Default: Story = {
  args: {
    stats: mockStats,
    recentArticles: mockArticles,
    loading: false,
  },
}

export const Loading: Story = {
  args: {
    stats: undefined,
    recentArticles: [],
    loading: true,
  },
}

export const Empty: Story = {
  args: {
    stats: {
      totalArticles: 0,
      totalResearch: 0,
      recentQueries: 0,
    },
    recentArticles: [],
    loading: false,
  },
}

export const WithManyArticles: Story = {
  args: {
    stats: {
      totalArticles: 1250,
      totalResearch: 156,
      recentQueries: 42,
      weeklyGrowth: 12,
    },
    recentArticles: [
      ...mockArticles,
      {
        id: '4',
        title: 'Building Scalable Microservices',
        category: 'academic' as const,
        date: '2026-02-25T16:45:00Z',
        snippet: 'Patterns and practices for designing microservices architectures.',
        iterationCount: 5,
      },
      {
        id: '5',
        title: 'Introduction to Quantum Computing',
        category: 'entity' as const,
        date: '2026-02-24T11:20:00Z',
        snippet: 'Exploring the fundamentals of quantum computing and its potential applications.',
      },
    ],
    loading: false,
  },
}

export const NegativeTrend: Story = {
  args: {
    stats: {
      totalArticles: 98,
      totalResearch: 22,
      recentQueries: 8,
      weeklyGrowth: -3,
    },
    recentArticles: mockArticles.slice(0, 2),
    loading: false,
  },
}
