import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { ArticleCard } from './ArticleCard'
import type { CategoryType } from './CategoryBadge'

const meta: Meta<typeof ArticleCard> = {
  title: 'Components/ArticleCard',
  component: ArticleCard,
  parameters: {
    docs: {
      description: {
        component:
          'Summary card for a research article. Displays title, category badge, date/time, and optional content snippet. Supports both regular and compact modes.',
      },
    },
  },
  argTypes: {
    title: {
      control: { type: 'text' },
      description: 'Article title',
    },
    category: {
      control: { type: 'select' },
      options: [
        'research',
        'general',
        'patterns',
        'business',
        'technical-analysis',
        'platforms',
        'libraries',
        'claude-code-configuration',
        'toolbelt',
      ],
      description: 'Article category',
    },
    date: {
      control: { type: 'date' },
      description: 'Publication date',
    },
    snippet: {
      control: { type: 'text' },
      description: 'Optional content snippet',
    },
    iterationCount: {
      control: { type: 'number' },
      description: 'Optional research iteration count (for deep research)',
    },
    onPress: {
      action: 'pressed',
      description: 'Callback when card is pressed',
    },
    compact: {
      control: { type: 'boolean' },
      description: 'Whether the card is in compact mode',
    },
  },
  args: {
    title: 'Understanding Large Language Model Architectures',
    category: 'research',
    date: new Date().toISOString(),
    snippet:
      'An exploration of transformer architectures, attention mechanisms, and the key innovations that enable modern language models.',
    compact: false,
  },
}

export default meta
type Story = StoryObj<typeof ArticleCard>

export const Default: Story = {}

export const TechnicalAnalysis: Story = {
  args: {
    title: 'Comprehensive Analysis of Climate Change Policies',
    category: 'technical-analysis',
    iterationCount: 5,
    snippet:
      'A multi-iteration deep research study examining global climate policies, their effectiveness, and recommendations for future action.',
  },
}

export const Compact: Story = {
  args: {
    title: 'Quick Notes on React Performance',
    category: 'patterns',
    compact: true,
  },
}

export const Pressable: Story = {
  args: {
    title: 'Interactive Article Card',
    category: 'libraries',
    snippet: 'This card responds to press events.',
    onPress: () => console.log('Card pressed'),
  },
}

export const NoSnippet: Story = {
  args: {
    title: 'Article Without Snippet',
    category: 'platforms',
    snippet: undefined,
  },
}

export const ArticleList: Story = {
  render: () => {
    const articles = [
      {
        title: 'Machine Learning Fundamentals',
        category: 'research' as CategoryType,
        date: new Date(2026, 1, 28),
        snippet: 'Introduction to core ML concepts and algorithms.',
      },
      {
        title: 'API Design Best Practices',
        category: 'technical-analysis' as CategoryType,
        date: new Date(2026, 1, 25),
        snippet: 'Comprehensive guide to designing robust APIs.',
        iterationCount: 3,
      },
      {
        title: 'TypeScript 5.0 Features',
        category: 'patterns' as CategoryType,
        date: new Date(2026, 1, 20),
        snippet: 'Overview of new features in TypeScript 5.0.',
      },
    ]

    return (
      <View style={{ gap: 12 }}>
        {articles.map((article, index) => (
          <ArticleCard key={index} {...article} />
        ))}
      </View>
    )
  },
}

export const CompactList: Story = {
  render: () => {
    const articles = [
      { title: 'Quick Note 1', category: 'general' as CategoryType, date: new Date() },
      { title: 'Quick Note 2', category: 'research' as CategoryType, date: new Date() },
      { title: 'Quick Note 3', category: 'business' as CategoryType, date: new Date() },
    ]

    return (
      <View style={{ gap: 8 }}>
        {articles.map((article, index) => (
          <ArticleCard key={index} {...article} compact />
        ))}
      </View>
    )
  },
}
