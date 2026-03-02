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

interface ExploreScreenProps extends Omit<ViewProps, 'children'> {
  /** Articles to display */
  articles?: Article[]
  /** Available categories for filtering */
  categories?: CategoryType[]
  /** Currently selected category filter */
  selectedCategory?: CategoryType | null
  /** Whether data is loading */
  loading?: boolean
  /** Callback when search is submitted */
  onSearch?: (query: string) => void
  /** Callback when an article is pressed */
  onArticlePress?: (article: Article) => void
  /** Callback when a category filter is selected */
  onCategorySelect?: (category: CategoryType | null) => void
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
 * ExploreScreen provides search and category filtering for the knowledge base.
 * Composes SearchInput, CategoryBadge, ArticleCard, SectionHeader, and EmptyState atoms.
 */
export function ExploreScreen({
  articles = [],
  categories = defaultCategories,
  selectedCategory,
  loading = false,
  onSearch,
  onArticlePress,
  onCategorySelect,
  className,
  ...props
}: ExploreScreenProps) {
  const [searchValue, setSearchValue] = useState('')

  const handleSearch = () => {
    onSearch?.(searchValue)
  }

  const handleClear = () => {
    setSearchValue('')
    onSearch?.('')
  }

  const handleCategoryPress = (category: CategoryType) => {
    if (selectedCategory === category) {
      onCategorySelect?.(null)
    } else {
      onCategorySelect?.(category)
    }
  }

  const hasResults = articles.length > 0
  const isSearching = searchValue.length > 0 || selectedCategory !== null

  return (
    <View className={cn('flex-1 bg-background', className)} testID="explore-screen" {...props}>
      {/* Search Header */}
      <View className="border-b border-border px-4 pb-4 pt-4">
        <SearchInput
          value={searchValue}
          onChangeText={setSearchValue}
          placeholder="Search knowledge base..."
          onSubmit={handleSearch}
          onClear={handleClear}
          disabled={loading}
        />

        {/* Category Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3"
          contentContainerClassName="gap-2"
        >
          {categories.map((category) => (
            <Pressable
              key={category}
              onPress={() => handleCategoryPress(category)}
              testID={`category-filter-${category}`}
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

      {/* Results */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-8"
      >
        {hasResults ? (
          <>
            <SectionHeader
              title={`Results (${articles.length})`}
              size="md"
              className="mb-3"
            />
            <View className="gap-3">
              {articles.map((article) => (
                <ArticleCard
                  key={article.id}
                  title={article.title}
                  category={article.category}
                  date={article.date}
                  snippet={article.snippet}
                  iterationCount={article.iterationCount}
                  onPress={() => onArticlePress?.(article)}
                />
              ))}
            </View>
          </>
        ) : (
          <EmptyState
            type={isSearching ? 'no-results' : 'no-data'}
            title={isSearching ? 'No results found' : 'Start exploring'}
            description={
              isSearching
                ? 'Try adjusting your search or filters to find what you\'re looking for.'
                : 'Search the knowledge base or select a category to browse articles.'
            }
            actionLabel={isSearching ? 'Clear filters' : undefined}
            onActionPress={isSearching ? () => {
              setSearchValue('')
              onCategorySelect?.(null)
            } : undefined}
          />
        )}
      </ScrollView>
    </View>
  )
}
