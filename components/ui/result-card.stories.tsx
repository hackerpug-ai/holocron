import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import {
  ResultCard,
  type CardType,
  type ResultCardData,
} from './result-card'
import type { CategoryType } from '../CategoryBadge'

const meta: Meta<typeof ResultCard> = {
  title: 'UI/ResultCard',
  component: ResultCard,
  parameters: {
    docs: {
      description: {
        component:
          'Displays different card types for knowledge base results. Supports article, stats, category_list, no_results, and category_not_found variants with appropriate styling and interactions.',
      },
    },
  },
  argTypes: {
    cardType: {
      control: { type: 'select' },
      options: ['article', 'stats', 'category_list', 'no_results', 'category_not_found'],
      description: 'Card type determines rendering and layout',
    },
    data: {
      description: 'Data object (structure varies by cardType)',
    },
    onPress: {
      action: 'pressed',
      description: 'Callback when card is pressed',
    },
    testID: {
      control: { type: 'text' },
      description: 'Optional test ID prefix',
    },
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

// Mock data helpers
const mockArticleData = {
  title: 'Understanding Transformer Architectures in Modern NLP',
  category: 'research' as CategoryType,
  snippet:
    'A comprehensive overview of transformer models, attention mechanisms, and their applications in natural language processing tasks.',
  document_id: 'doc-12345',
  metadata: {
    relevance_score: 0.87,
  },
}

const mockStatsData = {
  total_count: 1247,
  category_breakdown: [
    { category: 'Research', count: 423 },
    { category: 'Deep Research', count: 189 },
    { category: 'Factual', count: 312 },
    { category: 'Academic', count: 198 },
    { category: 'Entity', count: 125 },
  ],
  recent_documents: 42,
}

const mockCategoryListData = {
  categories: [
    { name: 'Research', category: 'research' as CategoryType, count: 423 },
    { name: 'Deep Research', category: 'deep-research' as CategoryType, count: 189 },
    { name: 'Factual', category: 'factual' as CategoryType, count: 312 },
    { name: 'Academic', category: 'academic' as CategoryType, count: 198 },
    { name: 'Entity', category: 'entity' as CategoryType, count: 125 },
  ],
}

const mockNoResultsData = {
  message: 'No documents found matching your search criteria.',
}

const mockCategoryNotFoundData = {
  category: 'nonexistent',
  valid_categories: ['research', 'deep-research', 'factual', 'academic', 'entity', 'url', 'general'],
}

export const Default: Story = {
  args: {
    cardType: 'article',
    data: mockArticleData,
  },
}

// Article card variants
export const Article: Story = {
  args: {
    cardType: 'article',
    data: mockArticleData,
  },
}

export const ArticleHighRelevance: Story = {
  args: {
    cardType: 'article',
    data: {
      ...mockArticleData,
      metadata: { relevance_score: 0.95 },
    },
  },
}

export const ArticleMediumRelevance: Story = {
  args: {
    cardType: 'article',
    data: {
      ...mockArticleData,
      metadata: { relevance_score: 0.65 },
    },
  },
}

export const ArticleLowRelevance: Story = {
  args: {
    cardType: 'article',
    data: {
      ...mockArticleData,
      metadata: { relevance_score: 0.45 },
    },
  },
}

export const ArticleWithoutSnippet: Story = {
  args: {
    cardType: 'article',
    data: {
      title: 'Quick Note on React Performance',
      category: 'factual',
      document_id: 'doc-67890',
    },
  },
}

// Stats card variants
export const Stats: Story = {
  args: {
    cardType: 'stats',
    data: mockStatsData,
  },
}

export const StatsMinimal: Story = {
  args: {
    cardType: 'stats',
    data: {
      total_count: 856,
    },
  },
}

// Category list card variants
export const CategoryList: Story = {
  args: {
    cardType: 'category_list',
    data: mockCategoryListData,
  },
}

// No results card variants
export const NoResults: Story = {
  args: {
    cardType: 'no_results',
    data: mockNoResultsData,
  },
}

export const NoResultsCustomMessage: Story = {
  args: {
    cardType: 'no_results',
    data: {
      message: 'No articles found in this category. Try exploring other topics.',
    },
  },
}

// Category not found card variants
export const CategoryNotFound: Story = {
  args: {
    cardType: 'category_not_found',
    data: mockCategoryNotFoundData,
  },
}

// Pressable variants
export const ArticlePressable: Story = {
  args: {
    cardType: 'article',
    data: mockArticleData,
    onPress: (documentId) => console.log('Pressed article:', documentId),
  },
}

export const StatsPressable: Story = {
  args: {
    cardType: 'stats',
    data: mockStatsData,
    onPress: () => console.log('Pressed stats card'),
  },
}

// All variants grid
export const AllVariants: Story = {
  render: () => (
    <View className="gap-3">
      <ResultCard cardType="article" data={mockArticleData} />
      <ResultCard cardType="stats" data={mockStatsData} />
      <ResultCard cardType="category_list" data={mockCategoryListData} />
      <ResultCard cardType="no_results" data={mockNoResultsData} />
      <ResultCard cardType="category_not_found" data={mockCategoryNotFoundData} />
    </View>
  ),
}

// Relevance score examples
export const RelevanceScoreExamples: Story = {
  render: () => (
    <View className="gap-3">
      <ResultCard
        cardType="article"
        data={{
          title: 'High Relevance Match (95%)',
          category: 'research',
          snippet: 'This article closely matches your search query.',
          document_id: 'doc-1',
          metadata: { relevance_score: 0.95 },
        }}
      />
      <ResultCard
        cardType="article"
        data={{
          title: 'Medium Relevance Match (65%)',
          category: 'factual',
          snippet: 'This article has some relevant information.',
          document_id: 'doc-2',
          metadata: { relevance_score: 0.65 },
        }}
      />
      <ResultCard
        cardType="article"
        data={{
          title: 'Low Relevance Match (45%)',
          category: 'general',
          snippet: 'This article may not be what you are looking for.',
          document_id: 'doc-3',
          metadata: { relevance_score: 0.45 },
        }}
      />
    </View>
  ),
}

// Article list example
export const ArticleList: Story = {
  render: () => {
    const articles: ResultCardData[] = [
      {
        title: 'Understanding Transformer Architectures',
        category: 'research',
        snippet: 'Deep dive into self-attention and cross-attention mechanisms.',
        document_id: 'doc-1',
        metadata: { relevance_score: 0.92 },
      },
      {
        title: 'BERT and Language Understanding',
        category: 'deep-research',
        snippet: 'Multi-iteration analysis of BERT model applications.',
        document_id: 'doc-2',
        metadata: { relevance_score: 0.88 },
      },
      {
        title: 'Vision Transformers Explained',
        category: 'academic',
        snippet: 'How transformers revolutionized computer vision tasks.',
        document_id: 'doc-3',
        metadata: { relevance_score: 0.76 },
      },
    ]

    return (
      <View className="gap-3">
        {articles.map((article, index) => (
          <ResultCard
            key={index}
            cardType="article"
            data={article}
            onPress={(docId) => console.log('Pressed article:', docId)}
          />
        ))}
      </View>
    )
  },
}
