import type { Meta, StoryObj } from '@storybook/react'
import { within, userEvent, waitFor } from '@storybook/testing-library'
import { expect } from '@storybook/jest'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import {
  ResultCard,
  type CardType,
  type ResultCardData,
} from './result-card'

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
const mockArticleData: ResultCardData = {
  card_type: 'article',
  title: 'Understanding Transformer Architectures in Modern NLP',
  category: 'research',
  snippet:
    'A comprehensive overview of transformer models, attention mechanisms, and their applications in natural language processing tasks.',
  document_id: 12345,
  metadata: {
    relevance_score: 0.87,
  },
}

// Mock article with markdown content (including frontmatter that should be stripped)
const mockArticleWithMarkdown: ResultCardData = {
  card_type: 'article',
  title: 'Stripe Minions: One-Shot End-to-End Coding Agents Architecture',
  category: 'research',
  snippet: `---
title: Stripe Minions: One-Shot End-to-End Coding Agents Architecture
date: 2024-03-01
---

This paper introduces a novel approach to **coding agents** using a _hierarchical_ architecture. Key contributions:

- Multi-agent coordination
- Context-aware planning
- Real-time adaptation`,
  document_id: 99999,
  metadata: {
    relevance_score: 0.09,
  },
}

const mockStatsData: ResultCardData = {
  card_type: 'stats',
  total_count: 1247,
  category_breakdown: [
    { category: 'Research', count: 423 },
    { category: 'Deep Research', count: 189 },
    { category: 'Factual', count: 312 },
    { category: 'Academic', count: 198 },
    { category: 'Entity', count: 125 },
  ],
  recent_count: 42,
}

const mockCategoryListData: ResultCardData = {
  card_type: 'category_list',
  categories: [
    { name: 'Research', count: 423 },
    { name: 'Deep Research', count: 189 },
    { name: 'Factual', count: 312 },
    { name: 'Academic', count: 198 },
    { name: 'Entity', count: 125 },
  ],
}

const mockNoResultsData: ResultCardData = {
  card_type: 'no_results',
  message: 'No documents found matching your search criteria.',
}

const mockCategoryNotFoundData: ResultCardData = {
  card_type: 'category_not_found',
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
      card_type: 'article',
      title: 'Quick Note on React Performance',
      category: 'factual',
      document_id: 67890,
    } as ResultCardData,
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
      card_type: 'stats',
      total_count: 856,
    } as ResultCardData,
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
      card_type: 'no_results',
      message: 'No articles found in this category. Try exploring other topics.',
    } as ResultCardData,
  },
}

// Category not found card variants
export const CategoryNotFound: Story = {
  args: {
    cardType: 'category_not_found',
    data: mockCategoryNotFoundData,
  },
}

// Pressable variants with play functions
export const ArticlePressable: Story = {
  args: {
    cardType: 'article',
    data: mockArticleData,
    onPress: (documentId) => console.log('Pressed article:', documentId),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pressable = canvas.getByTestId('result-card-article-pressable')

    // Verify pressable exists
    await expect(pressable).toBeTruthy()

    // Simulate press event
    await userEvent.click(pressable)
  },
}

export const StatsPressable: Story = {
  args: {
    cardType: 'stats',
    data: mockStatsData,
    onPress: () => console.log('Pressed stats card'),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pressable = canvas.getByTestId('result-card-stats-pressable')

    // Verify pressable exists
    await expect(pressable).toBeTruthy()

    // Simulate press event
    await userEvent.click(pressable)
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
          card_type: 'article',
          title: 'High Relevance Match (95%)',
          category: 'research',
          snippet: 'This article closely matches your search query.',
          document_id: 1,
          metadata: { relevance_score: 0.95 },
        } as ResultCardData}
      />
      <ResultCard
        cardType="article"
        data={{
          card_type: 'article',
          title: 'Medium Relevance Match (65%)',
          category: 'factual',
          snippet: 'This article has some relevant information.',
          document_id: 2,
          metadata: { relevance_score: 0.65 },
        } as ResultCardData}
      />
      <ResultCard
        cardType="article"
        data={{
          card_type: 'article',
          title: 'Low Relevance Match (45%)',
          category: 'general',
          snippet: 'This article may not be what you are looking for.',
          document_id: 3,
          metadata: { relevance_score: 0.45 },
        } as ResultCardData}
      />
    </View>
  ),
}

// Article list example
export const ArticleList: Story = {
  render: () => {
    const articles: ResultCardData[] = [
      {
        card_type: 'article',
        title: 'Understanding Transformer Architectures',
        category: 'research',
        snippet: 'Deep dive into self-attention and cross-attention mechanisms.',
        document_id: 1,
        metadata: { relevance_score: 0.92 },
      },
      {
        card_type: 'article',
        title: 'BERT and Language Understanding',
        category: 'deep-research',
        snippet: 'Multi-iteration analysis of BERT model applications.',
        document_id: 2,
        metadata: { relevance_score: 0.88 },
      },
      {
        card_type: 'article',
        title: 'Vision Transformers Explained',
        category: 'academic',
        snippet: 'How transformers revolutionized computer vision tasks.',
        document_id: 3,
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

// Loading state stories with play functions
export const LoadingArticle: Story = {
  args: {
    cardType: 'article',
    data: mockArticleData,
    loading: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const loadingCard = canvas.getByTestId('result-card-article-loading')

    // Verify loading state is displayed
    await expect(loadingCard).toBeTruthy()

    // Verify loading text is present
    await expect(canvas.getByText('Loading...')).toBeTruthy()
  },
}

export const LoadingStats: Story = {
  args: {
    cardType: 'stats',
    data: mockStatsData,
    loading: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const loadingCard = canvas.getByTestId('result-card-stats-loading')

    // Verify loading state is displayed
    await expect(loadingCard).toBeTruthy()
  },
}

// Error state stories with play functions
export const ErrorArticle: Story = {
  args: {
    cardType: 'article',
    data: mockArticleData,
    error: 'Failed to load article',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const errorCard = canvas.getByTestId('result-card-article-error')

    // Verify error state is displayed
    await expect(errorCard).toBeTruthy()

    // Verify error message is present
    await expect(canvas.getByText('Failed to load article')).toBeTruthy()
  },
}

export const ErrorStats: Story = {
  args: {
    cardType: 'stats',
    data: mockStatsData,
    error: 'Network error occurred',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const errorCard = canvas.getByTestId('result-card-stats-error')

    // Verify error state is displayed
    await expect(errorCard).toBeTruthy()

    // Verify error message is present
    await expect(canvas.getByText('Network error occurred')).toBeTruthy()
  },
}

// Content verification stories with play functions
export const ArticleContentVerification: Story = {
  args: {
    cardType: 'article',
    data: mockArticleData,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify title is displayed
    await expect(
      canvas.getByText('Understanding Transformer Architectures in Modern NLP')
    ).toBeTruthy()

    // Verify snippet is displayed
    await expect(
      canvas.getByText(
        'A comprehensive overview of transformer models, attention mechanisms, and their applications in natural language processing tasks.'
      )
    ).toBeTruthy()

    // Verify relevance score is displayed (87% from mock data)
    await expect(canvas.getByText('Match:')).toBeTruthy()
    await expect(canvas.getByText('87%')).toBeTruthy()
  },
}

export const StatsContentVerification: Story = {
  args: {
    cardType: 'stats',
    data: mockStatsData,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify total count is displayed
    await expect(canvas.getByText('1247')).toBeTruthy()
    await expect(canvas.getByText('total documents')).toBeTruthy()

    // Verify category breakdown header
    await expect(canvas.getByText('By Category')).toBeTruthy()

    // Verify first category in breakdown
    await expect(canvas.getByText('Research')).toBeTruthy()
    await expect(canvas.getByText('423')).toBeTruthy()
  },
}

export const CategoryNotFoundContentVerification: Story = {
  args: {
    cardType: 'category_not_found',
    data: mockCategoryNotFoundData,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify error title
    await expect(canvas.getByText('Category Not Found')).toBeTruthy()

    // Verify category name is displayed
    await expect(canvas.getByText('"nonexistent"')).toBeTruthy()

    // Verify valid categories section
    await expect(canvas.getByText('Valid Categories')).toBeTruthy()

    // Verify first valid category badge
    const firstCategory = canvas.getByTestId('result-card-category_not_found-valid-category-0')
    await expect(firstCategory).toBeTruthy()
  },
}

// Markdown snippet rendering - demonstrates frontmatter stripping and markdown formatting
export const ArticleWithMarkdownSnippet: Story = {
  args: {
    cardType: 'article',
    data: mockArticleWithMarkdown,
  },
  parameters: {
    docs: {
      description: {
        story: 'Article card with markdown content in snippet. YAML frontmatter is automatically stripped and markdown formatting (bold, italic, lists) is rendered.',
      },
    },
  },
}

// Comparison: Before/After markdown rendering
export const MarkdownSnippetComparison: Story = {
  render: () => (
    <View className="gap-4">
      <View>
        <View className="mb-2 px-1">
          <View className="rounded-md bg-primary/10 px-2 py-1">
            <Text className="text-xs font-medium text-primary">With Markdown Rendering</Text>
          </View>
        </View>
        <ResultCard cardType="article" data={mockArticleWithMarkdown} />
      </View>
    </View>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Demonstrates how markdown content is rendered in article snippets. The frontmatter (---...---) is stripped, and markdown formatting like **bold**, _italic_, and bullet lists are properly rendered.',
      },
    },
  },
}
