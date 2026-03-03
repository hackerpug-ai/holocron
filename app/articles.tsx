import { ArticlesScreen } from '@/screens/articles-screen'
import { useDocuments, type Article } from '@/hooks/useDocuments'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import type { CategoryType } from '@/components/CategoryBadge'

/**
 * Articles route screen
 * Displays all documents from the Supabase knowledge base with filtering and search.
 * Accessed from the drawer navigation.
 */
export default function ArticlesRoute() {
  const router = useRouter()
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')

  const { articles, loading, error } = useDocuments({
    category: selectedCategory,
    searchQuery,
  })

  const handleSearch = (query: string) => {
    setSearchQuery(query)
  }

  const handleCategoryChange = (category?: CategoryType) => {
    setSelectedCategory(category ?? null)
  }

  const handleArticlePress = (article: Article) => {
    // TODO: Navigate to article detail view
    // This will be implemented in a future task
    console.log('Article pressed:', article.id)
  }

  return (
    <ArticlesScreen
      articles={articles}
      selectedCategory={selectedCategory}
      loading={loading}
      onSearch={handleSearch}
      onCategoryChange={handleCategoryChange}
      onArticlePress={handleArticlePress}
      testID="articles-route"
    />
  )
}
