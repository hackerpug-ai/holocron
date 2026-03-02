import type { Meta, StoryObj } from '@storybook/react'
import { ResearchScreen } from './ResearchScreen'

const meta = {
  title: 'Screens/ResearchScreen',
  component: ResearchScreen,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ResearchScreen>

export default meta
type Story = StoryObj<typeof meta>

const mockRecentQueries = [
  {
    id: '1',
    query: 'How do transformer models work?',
    category: 'deep-research' as const,
    timestamp: '2026-02-28T10:30:00Z',
  },
  {
    id: '2',
    query: 'React Native vs Flutter comparison',
    category: 'research' as const,
    timestamp: '2026-02-27T14:15:00Z',
  },
  {
    id: '3',
    query: 'Is GraphQL better than REST?',
    category: 'factual' as const,
    timestamp: '2026-02-26T09:00:00Z',
  },
]

export const Default: Story = {
  args: {
    recentQueries: mockRecentQueries,
    loading: false,
  },
}

export const ActiveSearching: Story = {
  args: {
    activeResearch: {
      query: 'How do large language models handle context windows?',
      type: 'deep',
      phase: 'searching',
      progress: 25,
      elapsedTime: 12,
      sources: ['arxiv.org', 'openai.com'],
      statusMessage: 'Searching academic sources...',
    },
    recentQueries: mockRecentQueries,
    loading: false,
  },
}

export const ActiveAnalyzing: Story = {
  args: {
    activeResearch: {
      query: 'How do large language models handle context windows?',
      type: 'deep',
      phase: 'analyzing',
      progress: 55,
      elapsedTime: 45,
      sources: ['arxiv.org', 'openai.com', 'anthropic.com', 'huggingface.co'],
      statusMessage: 'Analyzing 12 relevant papers...',
    },
    recentQueries: mockRecentQueries,
    loading: false,
  },
}

export const ActiveSynthesizing: Story = {
  args: {
    activeResearch: {
      query: 'How do large language models handle context windows?',
      type: 'deep',
      phase: 'synthesizing',
      progress: 80,
      elapsedTime: 78,
      sources: ['arxiv.org', 'openai.com', 'anthropic.com', 'huggingface.co', 'github.com', 'medium.com'],
      statusMessage: 'Synthesizing findings into report...',
    },
    recentQueries: mockRecentQueries,
    loading: false,
  },
}

export const Complete: Story = {
  args: {
    activeResearch: {
      query: 'How do large language models handle context windows?',
      type: 'deep',
      phase: 'complete',
      progress: 100,
      elapsedTime: 120,
      sources: ['arxiv.org', 'openai.com', 'anthropic.com', 'huggingface.co', 'github.com', 'medium.com'],
    },
    recentQueries: mockRecentQueries,
    loading: false,
  },
}

export const NoRecentQueries: Story = {
  args: {
    recentQueries: [],
    loading: false,
  },
}

export const Loading: Story = {
  args: {
    recentQueries: mockRecentQueries,
    loading: true,
  },
}
