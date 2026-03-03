import { ArticlesScreen } from '@/screens/articles-screen'
import { useDocuments, type Article } from '@/hooks/useDocuments'
import { ArticleDetail, type MockArticle } from '@/components/screens/article-detail'
import { getDocument, type DocumentCategory } from '@/lib/supabase'
import { useState } from 'react'
import type { CategoryType } from '@/components/CategoryBadge'
import { ScreenLayout } from '@/components/ui/screen-layout'
import { useRouter } from 'expo-router'

/**
 * Articles route screen
 * Displays all documents from the Supabase knowledge base with filtering and search.
 * Accessed from the drawer navigation.
 */
export default function ArticlesRoute() {
  const router = useRouter()
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [articleDetailVisible, setArticleDetailVisible] = useState(false)
  const [selectedArticle, setSelectedArticle] = useState<MockArticle | null>(null)

  const { articles, loading } = useDocuments({
    category: selectedCategory,
    searchQuery,
  })

  const handleSearch = (query: string) => {
    setSearchQuery(query)
  }

  const handleCategoryChange = (category?: CategoryType) => {
    setSelectedCategory(category ?? null)
  }

  const handleArticlePress = async (article: Article) => {
    try {
      // Parse article ID (may be string or number)
      const id = typeof article.id === 'string' ? parseInt(article.id, 10) : article.id

      // Fetch full document from Supabase
      const document = await getDocument(id)

      if (document) {
        // Transform Document to MockArticle format for ArticleDetail
        const mockArticle: MockArticle = {
          id: document.id,
          title: document.title,
          content: document.content || '',
          category: article.category, // Already a CategoryType from Article
          date: document.created_at || document.date || article.date,
          time: document.time,
          research_type: document.research_type,
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
        loading={loading}
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
