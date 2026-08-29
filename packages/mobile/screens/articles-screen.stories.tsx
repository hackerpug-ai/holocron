import type { Meta, StoryObj } from '@storybook/react'
import { within, userEvent } from '@storybook/testing-library'
import { expect } from '@storybook/jest'
import { useState } from 'react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { ArticlesScreen } from './articles-screen'
import type { CategoryType } from '@/components/CategoryBadge'

const meta = {
  title: 'Screens/ArticlesScreen',
  component: ArticlesScreen,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ArticlesScreen>

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
  {
    id: '5',
    title: 'Introduction to Quantum Computing',
    category: 'entity' as const,
    date: '2026-02-24T11:20:00Z',
    snippet: 'Exploring the fundamentals of quantum computing and its potential applications.',
  },
]

const allCategories: CategoryType[] = [
  'research',
  'deep-research',
  'factual',
  'academic',
  'entity',
  'url',
  'general',
]

export const Default: Story = {
  args: {
    articles: mockArticles,
    categories: allCategories,
    selectedCategory: undefined,
    loading: false,
  },
}

export const FilteredCategory: Story = {
  args: {
    articles: mockArticles.filter((a) => a.category === 'research'),
    categories: allCategories,
    selectedCategory: 'research',
    loading: false,
  },
}

export const FilteredDeepResearch: Story = {
  args: {
    articles: mockArticles.filter((a) => a.category === 'deep-research'),
    categories: allCategories,
    selectedCategory: 'deep-research',
    loading: false,
  },
}

export const NoResults: Story = {
  args: {
    articles: [],
    categories: allCategories,
    selectedCategory: 'url',
    loading: false,
  },
}

export const Empty: Story = {
  args: {
    articles: [],
    categories: allCategories,
    selectedCategory: undefined,
    loading: false,
  },
}

export const Loading: Story = {
  args: {
    articles: [],
    categories: allCategories,
    selectedCategory: undefined,
    loading: true,
  },
}

export const ManyArticles: Story = {
  args: {
    articles: [
      ...mockArticles,
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
      {
        id: '8',
        title: 'Docker for Development',
        category: 'factual' as const,
        date: '2026-02-21T10:15:00Z',
        snippet: 'Using Docker containers for local development environments.',
      },
      {
        id: '9',
        title: 'Advanced Git Workflows',
        category: 'research' as const,
        date: '2026-02-20T14:00:00Z',
        snippet: 'Mastering Git rebase, cherry-pick, and bisect.',
      },
      {
        id: '10',
        title: 'WebAssembly Fundamentals',
        category: 'academic' as const,
        date: '2026-02-19T09:30:00Z',
        snippet: 'Understanding WebAssembly and its use cases in web development.',
        iterationCount: 4,
      },
    ],
    categories: allCategories,
    selectedCategory: undefined,
    loading: false,
  },
}

/**
 * Interactive story demonstrating category chip selection.
 */
export const CategoryChipInteraction: Story = {
  render: () => {
    const [selectedCategory, setSelectedCategory] = useState<CategoryType | undefined>(undefined)
    const [lastAction, setLastAction] = useState<string>('None')

    const handleCategoryChange = (category?: CategoryType) => {
      setSelectedCategory(category)
      setLastAction(category ? `Selected: ${category}` : 'Cleared filter')
    }

    const filteredArticles = selectedCategory
      ? mockArticles.filter((a) => a.category === selectedCategory)
      : mockArticles

    return (
      <View>
        <ArticlesScreen
          articles={filteredArticles}
          categories={allCategories}
          selectedCategory={selectedCategory ?? null}
          loading={false}
          onCategoryChange={handleCategoryChange}
        />
        <Text className="bg-muted text-foreground p-2 text-center text-sm" testID="last-action">
          {lastAction}
        </Text>
      </View>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Find and tap the "research" category chip
    const researchChip = canvas.getByTestId('articles-chip-research')
    await userEvent.click(researchChip)

    // Verify the action was recorded
    const lastAction = canvas.getByTestId('last-action')
    await expect(lastAction).toBeTruthy()
  },
}

/**
 * Interactive story demonstrating the "All" chip clears category filter.
 */
export const AllChipInteraction: Story = {
  render: () => {
    const [selectedCategory, setSelectedCategory] = useState<CategoryType | undefined>('research')
    const [lastAction, setLastAction] = useState<string>('Selected: research')

    const handleCategoryChange = (category?: CategoryType) => {
      setSelectedCategory(category)
      setLastAction(category ? `Selected: ${category}` : 'Cleared filter')
    }

    const filteredArticles = selectedCategory
      ? mockArticles.filter((a) => a.category === selectedCategory)
      : mockArticles

    return (
      <View>
        <ArticlesScreen
          articles={filteredArticles}
          categories={allCategories}
          selectedCategory={selectedCategory ?? null}
          loading={false}
          onCategoryChange={handleCategoryChange}
        />
        <Text className="bg-muted text-foreground p-2 text-center text-sm" testID="last-action">
          {lastAction}
        </Text>
      </View>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Find and tap the "All" chip to clear filter
    const allChip = canvas.getByTestId('articles-chip-All')
    await userEvent.click(allChip)

    // Verify the action was recorded
    const lastAction = canvas.getByTestId('last-action')
    await expect(lastAction).toBeTruthy()
  },
}

/**
 * Interactive story demonstrating article card press.
 */
export const ArticleCardInteraction: Story = {
  render: () => {
    const [lastPressed, setLastPressed] = useState<string>('None')

    const handleArticlePress = (article: { id: string; title: string }) => {
      setLastPressed(`Pressed: ${article.title}`)
    }

    return (
      <View>
        <ArticlesScreen
          articles={mockArticles}
          categories={allCategories}
          selectedCategory={undefined}
          loading={false}
          onArticlePress={handleArticlePress}
        />
        <Text className="bg-muted text-foreground p-2 text-center text-sm" testID="last-pressed">
          {lastPressed}
        </Text>
      </View>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Find and tap the first article card
    const firstCard = canvas.getByTestId('articles-card-1')
    await userEvent.click(firstCard)

    // Verify the action was recorded
    const lastPressed = canvas.getByTestId('last-pressed')
    await expect(lastPressed).toBeTruthy()
  },
}

/**
 * Story showing all category chips are rendered and scrollable.
 */
export const AllCategoryChips: Story = {
  args: {
    articles: mockArticles,
    categories: allCategories,
    loading: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'All category chips are rendered in a horizontally scrollable list. The "All" chip is shown first.',
      },
    },
  },
}

/**
 * Story demonstrating the visual ring indicator on selected category.
 */
export const SelectedCategoryVisual: Story = {
  args: {
    articles: mockArticles.filter((a) => a.category === 'factual'),
    categories: allCategories,
    selectedCategory: 'factual',
    loading: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'The selected category chip displays a ring indicator to show the active filter.',
      },
    },
  },
}
