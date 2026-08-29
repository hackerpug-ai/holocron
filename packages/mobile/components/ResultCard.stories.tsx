import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { ResultCard, type ResultType } from './ResultCard'
import type { CategoryType } from './CategoryBadge'

const meta: Meta<typeof ResultCard> = {
  title: 'Components/ResultCard',
  component: ResultCard,
  parameters: {
    docs: {
      description: {
        component:
          'Displays search results, articles, or research findings as tappable cards in the chat stream. Supports different content types with appropriate icons and metadata.',
      },
    },
  },
  argTypes: {
    title: {
      control: { type: 'text' },
      description: 'Card title',
    },
    type: {
      control: { type: 'select' },
      options: ['search', 'article', 'research', 'stats'],
      description: 'Result type determines icon and styling',
    },
    category: {
      control: { type: 'select' },
      options: ['research', 'deep-research', 'factual', 'academic', 'entity', 'url', 'general'],
      description: 'Category for article/research results',
    },
    snippet: {
      control: { type: 'text' },
      description: 'Brief description or snippet',
    },
    confidence: {
      control: { type: 'number', min: 0, max: 100 },
      description: 'Confidence score (0-100) for research results',
    },
    sourceCount: {
      control: { type: 'number' },
      description: 'Number of sources for research results',
    },
    onPress: {
      action: 'pressed',
      description: 'Callback when card is pressed',
    },
  },
  args: {
    title: 'Understanding Transformer Architectures',
    type: 'article',
    category: 'research',
    snippet: 'A comprehensive overview of transformer models and their applications in NLP.',
  },
  decorators: [
    (Story) => (
      <View className="bg-background p-4">
        <Story />
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ResultCard>

export const Default: Story = {}

export const SearchResult: Story = {
  args: {
    title: 'Machine Learning Basics',
    type: 'search',
    category: 'factual',
    snippet: 'Introduction to fundamental ML concepts and algorithms.',
  },
}

export const ResearchResult: Story = {
  args: {
    title: 'Climate Change Policy Analysis',
    type: 'research',
    category: 'deep-research',
    snippet: 'Multi-iteration analysis of global climate policies and their effectiveness.',
    confidence: 85,
    sourceCount: 12,
  },
}

export const HighConfidence: Story = {
  args: {
    title: 'Verified Research Finding',
    type: 'research',
    category: 'academic',
    confidence: 95,
    sourceCount: 24,
  },
}

export const MediumConfidence: Story = {
  args: {
    title: 'Preliminary Research Finding',
    type: 'research',
    category: 'research',
    confidence: 65,
    sourceCount: 6,
  },
}

export const LowConfidence: Story = {
  args: {
    title: 'Uncertain Finding',
    type: 'research',
    category: 'general',
    confidence: 45,
    sourceCount: 2,
  },
}

export const Pressable: Story = {
  args: {
    title: 'Tap to View Full Article',
    type: 'article',
    category: 'entity',
    snippet: 'This card responds to press events.',
    onPress: () => console.log('Card pressed'),
  },
}

export const ResultList: Story = {
  render: () => {
    const results: Array<{
      title: string
      type: ResultType
      category: CategoryType
      snippet?: string
      confidence?: number
      sourceCount?: number
    }> = [
      {
        title: 'Understanding Attention Mechanisms',
        type: 'article',
        category: 'research',
        snippet: 'Deep dive into self-attention and cross-attention.',
      },
      {
        title: 'BERT and Language Understanding',
        type: 'research',
        category: 'deep-research',
        confidence: 88,
        sourceCount: 15,
      },
      {
        title: 'Vision Transformers Explained',
        type: 'search',
        category: 'academic',
        snippet: 'How transformers revolutionized computer vision.',
      },
    ]

    return (
      <View className="gap-3">
        {results.map((result, index) => (
          <ResultCard
            key={index}
            {...result}
            onPress={() => console.log('Pressed:', result.title)}
          />
        ))}
      </View>
    )
  },
}
