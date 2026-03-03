import { ArticleCard } from '@/components/ArticleCard'
import { CategoryBadge, type CategoryType } from '@/components/CategoryBadge'
import { EmptyState } from '@/components/EmptyState'
import { SearchInput } from '@/components/SearchInput'
import { SectionHeader } from '@/components/SectionHeader'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { Pressable, ScrollView, View, type ViewProps } from 'react-native'

interface Article {
  id: string
  title: string
  category: CategoryType
  date: string
  snippet?: string
  iterationCount?: number
}

interface ArticlesScreenProps extends Omit<ViewProps, 'children'> {
  /** Articles to display */
  articles?: Article[]
  /** Available categories for filtering */
  categories?: CategoryType[]
  /** Currently selected category filter */
  selectedCategory?: CategoryType | null
  /** Whether data is loading */
  loading?: boolean
  /** Callback when search query changes */
  onSearch?: (_query: string) => void
  /** Callback when an article is pressed */
  onArticlePress?: (_article: Article) => void
  /** Callback when a category filter is selected */
  onCategoryChange?: (_category?: CategoryType) => void
}

const defaultCategories: CategoryType[] = [
  'research',
  'deep-research',
  'factual',
  'academic',
  'entity',
  'url',
  'general',
]

/**
 * ArticlesScreen provides a browsable list of all articles in the knowledge base.
 * Features horizontal category chip filters, search input, and scrollable article cards.
 * This is the main articles view accessed from the drawer.
 */
export function ArticlesScreen({
  articles = [],
  categories = defaultCategories,
  selectedCategory,
  loading = false,
  onSearch,
  onArticlePress,
  onCategoryChange,
  className,
  ...props
}: ArticlesScreenProps) {
  const [searchValue, setSearchValue] = useState('')

  const handleSearchChange = (query: string) => {
    setSearchValue(query)
    onSearch?.(query)
  }

  const handleClear = () => {
    setSearchValue('')
    onSearch?.('')
  }

  const handleCategoryPress = (category: CategoryType) => {
    const isCurrentlySelected = selectedCategory === category
    if (isCurrentlySelected) {
      onCategoryChange?.(undefined)
    } else {
      onCategoryChange?.(category)
    }
  }

  const handleAllPress = () => {
    if (selectedCategory === null || selectedCategory === undefined) {
      return
    }
    onCategoryChange?.(undefined)
  }

  const hasResults = articles.length > 0
  const isFiltering = searchValue.length > 0 || selectedCategory !== null && selectedCategory !== undefined

  return (
    <View className={cn('flex-1 bg-background', className)} testID="articles-screen" {...props}>
      {/* Header Section with Search and Categories */}
      <View className="border-b border-border px-4 pb-4 pt-4">
        {/* Search Input */}
        <SearchInput
          value={searchValue}
          onChangeText={handleSearchChange}
          placeholder="Search articles..."
          onClear={handleClear}
          disabled={loading}
          testID="articles-search-input"
        />

        {/* Horizontal Category Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3"
          contentContainerClassName="gap-2"
          testID="articles-category-chips"
        >
          {/* "All" Chip */}
          <Pressable
            onPress={handleAllPress}
            testID="articles-chip-All"
          >
            <CategoryBadge
              category="general"
              label="All"
              className={cn(
                (!selectedCategory || selectedCategory === undefined) && 'ring-2 ring-primary ring-offset-1'
              )}
            />
          </Pressable>

          {/* Category Chips */}
          {categories.map((category) => (
            <Pressable
              key={category}
              onPress={() => handleCategoryPress(category)}
              testID={`articles-chip-${category}`}
            >
              <CategoryBadge
                category={category}
                className={cn(
                  selectedCategory === category && 'ring-2 ring-primary ring-offset-1'
                )}
              />
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Article List */}
      <ScrollView className="flex-1" contentContainerClassName="p-4 pb-8">
        {hasResults ? (
          <>
            {/* Results Count Header */}
            <SectionHeader
              title={`${isFiltering ? 'Results' : 'All Articles'} (${articles.length})`}
              size="md"
              className="mb-3"
              testID="articles-count-header"
            />

            {/* Article Cards */}
            <View className="gap-3" testID="articles-list">
              {articles.map((article) => (
                <ArticleCard
                  key={article.id}
                  title={article.title}
                  category={article.category}
                  date={article.date}
                  snippet={article.snippet}
                  iterationCount={article.iterationCount}
                  onPress={() => onArticlePress?.(article)}
                  testID={`articles-card-${article.id}`}
                />
              ))}
            </View>
          </>
        ) : (
          <EmptyState
            type={isFiltering ? 'no-results' : 'no-data'}
            title={isFiltering ? 'No articles found' : 'No articles yet'}
            description={
              isFiltering
                ? 'Try adjusting your search or filters to find what you\'re looking for.'
                : 'Your knowledge base is empty. Add articles through chat or research.'
            }
            actionLabel={isFiltering ? 'Clear filters' : undefined}
            onActionPress={
              isFiltering
                ? () => {
                    setSearchValue('')
                    onCategoryChange?.(undefined)
                  }
                : undefined
            }
            testID="articles-empty-state"
          />
        )}
      </ScrollView>
    </View>
  )
}
