import type { Meta, StoryObj } from '@storybook/react'
import { ExploreScreen } from './ExploreScreen'

const meta = {
  title: 'Screens/ExploreScreen',
  component: ExploreScreen,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ExploreScreen>

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
  {
    id: '4',
    title: 'Machine Learning in Production',
    category: 'academic' as const,
    date: '2026-02-25T16:45:00Z',
    snippet: 'Deploying ML models: infrastructure, monitoring, and scaling considerations.',
    iterationCount: 2,
  },
]

export const Default: Story = {
  args: {
    articles: mockArticles,
    loading: false,
  },
}

export const WithSelectedCategory: Story = {
  args: {
    articles: mockArticles.filter(a => a.category === 'research'),
    selectedCategory: 'research',
    loading: false,
  },
}

export const NoResults: Story = {
  args: {
    articles: [],
    selectedCategory: 'academic',
    loading: false,
  },
}

export const EmptyState: Story = {
  args: {
    articles: [],
    loading: false,
  },
}

export const Loading: Story = {
  args: {
    articles: [],
    loading: true,
  },
}

export const ManyResults: Story = {
  args: {
    articles: [
      ...mockArticles,
      {
        id: '5',
        title: 'Introduction to Quantum Computing',
        category: 'entity' as const,
        date: '2026-02-24T11:20:00Z',
        snippet: 'Exploring the fundamentals of quantum computing.',
      },
      {
        id: '6',
        title: 'Building Scalable APIs',
        category: 'url' as const,
        date: '2026-02-23T08:00:00Z',
        snippet: 'Architecture patterns for high-performance APIs.',
      },
      {
        id: '7',
        title: 'TypeScript Best Practices',
        category: 'general' as const,
        date: '2026-02-22T15:30:00Z',
        snippet: 'Tips and tricks for writing maintainable TypeScript code.',
      },
    ],
    loading: false,
  },
}
