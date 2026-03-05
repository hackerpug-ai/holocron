import { ArticlesScreen } from '@/screens/articles-screen'
import { useQuery, useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { ArticleDetail, type MockArticle } from '@/components/screens/article-detail'
import { useState } from 'react'
import type { CategoryType } from '@/components/CategoryBadge'
import { ScreenLayout } from '@/components/ui/screen-layout'
import { useRouter } from 'expo-router'
import type { Id } from '@/convex/_generated/dataModel'

interface Article {
  id: string
  title: string
  category: CategoryType
  date: string
  snippet?: string
  iterationCount?: number
}

/**
 * Articles route screen
 * Displays all documents from the Convex knowledge base with filtering and search.
 * Accessed from the drawer navigation.
 */
export default function ArticlesRoute() {
  const router = useRouter()
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [articleDetailVisible, setArticleDetailVisible] = useState(false)
  const [selectedArticle, setSelectedArticle] = useState<MockArticle | null>(null)

  // Map category type to Convex category string
  const convexCategory = selectedCategory === 'research' ||
    selectedCategory === 'deep-research' ||
    selectedCategory === 'factual' ||
    selectedCategory === 'academic'
    ? 'research'
    : undefined

  // Fetch documents using Convex query
  const documents = useQuery(
    api.documents.list,
    convexCategory ? { category: convexCategory } : 'skip'
  )

  // Fetch search results if query is provided
  const searchResults = useAction(
    api.documents.fullTextSearch,
    searchQuery.trim() ? { query: searchQuery.trim(), limit: 50, category: convexCategory } : 'skip'
  )

  // Determine which data source to use (search or list)
  const isLoading = documents === undefined
  const sourceDocuments = searchQuery.trim() && searchResults !== undefined
    ? searchResults
    : (documents ?? [])

  // Transform Convex documents to Article format
  const articles: Article[] = sourceDocuments.map((doc) => ({
    id: doc._id,
    title: doc.title,
    category: doc.category === 'research' ? 'research' : 'general',
    date: doc.date ?? new Date(doc.createdAt).toISOString(),
    snippet: doc.content ? doc.content.slice(0, 200) + '...' : undefined,
    iterationCount: doc.iterations,
  }))

  const handleSearch = (query: string) => {
    setSearchQuery(query)
  }

  const handleCategoryChange = (category?: CategoryType) => {
    setSelectedCategory(category ?? null)
  }

  const handleArticlePress = async (article: Article) => {
    try {
      // article.id is already a Convex ID string
      const docId = article.id as Id<"documents">

      // Find the document in our current list
      const document = sourceDocuments.find((doc) => doc._id === docId)

      if (document) {
        // Transform Document to MockArticle format for ArticleDetail
        const mockArticle: MockArticle = {
          id: document._id, // Convex ID is a string, MockArticle accepts string | number
          title: document.title,
          content: document.content || '',
          category: article.category, // Already a CategoryType from Article
          date: document.date || new Date(document.createdAt).toISOString(),
          time: document.time,
          research_type: document.researchType,
        }

        setSelectedArticle(mockArticle)
        setArticleDetailVisible(true)
      }
    } catch (error) {
      console.error('Failed to fetch article:', error)
    }
  }

  return (
    <ScreenLayout
      header={{
        title: 'Articles',
        showBack: true,
        onBack: () => router.back(),
      }}
      edges="bottom"
      testID="articles-route-layout"
    >
      <ArticlesScreen
        articles={articles}
        selectedCategory={selectedCategory}
        loading={isLoading}
        onSearch={handleSearch}
        onCategoryChange={handleCategoryChange}
        onArticlePress={handleArticlePress}
        testID="articles-route"
      />
      {/* ArticleDetail overlay */}
      {selectedArticle && (
        <ArticleDetail
          article={selectedArticle}
          visible={articleDetailVisible}
          onClose={() => setArticleDetailVisible(false)}
          testID="articles-route-article-detail"
        />
      )}
    </ScreenLayout>
  )
}
