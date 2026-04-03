import { ArticlesScreen } from '@/screens/articles-screen'
import { useQuery, useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import type { CategoryType } from '@/components/CategoryBadge'
import { ScreenLayout } from '@/components/ui/screen-layout'
import { useRouter } from 'expo-router'
import type { Doc } from '@/convex/_generated/dataModel'
import {
  mapDocumentCategoryToCategoryType,
  mapCategoryTypeToDocumentCategory,
} from '@/lib/category-mapping'
import { ArticleImportModal } from '@/components/articles/ArticleImportModal'

interface Article {
  id: string
  title: string
  category: CategoryType
  date: string
  snippet?: string
  iterationCount?: number
}

type DocumentDoc = Doc<'documents'>

/**
 * Custom debounce hook that properly cancels on unmount
 */
function useDebounce<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fnRef = useRef(fn)

  // Keep fn ref up to date
  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => fnRef.current(...args), delay)
    }) as T,
    [delay]
  )
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
  const [searchResults, setSearchResults] = useState<Article[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [importModalVisible, setImportModalVisible] = useState(false)

  // Map category type to Convex category string using centralized mapping
  const convexCategory = mapCategoryTypeToDocumentCategory(selectedCategory)

  // Stable query args to ensure Convex detects changes properly
  const listQueryArgs = useMemo(
    () => (convexCategory ? { category: convexCategory } : {}),
    [convexCategory]
  )

  // Fetch documents using Convex query with stable args
  const documents = useQuery(api.documents.queries.list, listQueryArgs)

  // Fetch total count for accurate display
  const totalCount = useQuery(api.documents.queries.countWithFilter, listQueryArgs)

  // Fetch category counts to sort categories with articles first
  const categoryCounts = useQuery(api.documents.queries.countByCategory, {})

  // Filter to only populated categories, sorted by count descending
  const availableCategories = useMemo(() => {
    if (!categoryCounts) return []

    // Get all category keys from categoryCounts and filter to non-empty
    return (Object.keys(categoryCounts) as CategoryType[])
      .filter((cat) => (categoryCounts[cat] ?? 0) > 0)
      .sort((a, b) => (categoryCounts[b] ?? 0) - (categoryCounts[a] ?? 0))
  }, [categoryCounts])

  // Calculate total article count across all categories
  const totalArticleCount = useMemo(() => {
    if (!categoryCounts) return 0
    return Object.values(categoryCounts as Record<string, number>).reduce(
      (sum, count) => sum + (count ?? 0),
      0
    )
  }, [categoryCounts])

  // Hybrid search action
  const hybridSearch = useAction(api.documents.search.hybridSearch)

  // Search handler
  const performSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults(null)
        return
      }

      setIsSearching(true)
      try {
        const results = await hybridSearch({
          query,
          limit: 50,
          category: convexCategory,
        })

        // Transform results to Article format
        const articles: Article[] = results.map((doc: { _id: string; title: string; category: string; createdAt?: number; content?: string; iterations?: number }) => ({
          id: doc._id,
          title: doc.title,
          category: mapDocumentCategoryToCategoryType(doc.category),
          date: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
          snippet: doc.content?.slice(0, 200) + '...',
          iterationCount: doc.iterations,
        }))

        setSearchResults(articles)
      } catch (error) {
        console.error('Search failed:', error)
        setSearchResults(null)
      } finally {
        setIsSearching(false)
      }
    },
    [hybridSearch, convexCategory]
  )

  // Debounced search (300ms)
  const debouncedSearch = useDebounce(performSearch, 300)

  // Trigger search when query changes
  useEffect(() => {
    debouncedSearch(searchQuery)
  }, [searchQuery, debouncedSearch])

  // Also search when category changes (if there's an active search)
  useEffect(() => {
    if (searchQuery.trim()) {
      performSearch(searchQuery)
    }
  }, [convexCategory, performSearch, searchQuery])

  // Determine which data source to use
  const isLoading = documents === undefined
  const isLoadingCategories = categoryCounts === undefined
  const sourceDocuments = useMemo(() => {
    return documents ?? []
  }, [documents])

  // Transform Convex documents to Article format (for non-search display)
  const articles: Article[] = useMemo(() => {
    return sourceDocuments.map((doc: DocumentDoc) => {
      const category = mapDocumentCategoryToCategoryType(doc.category)

      // Safely convert createdAt timestamp to ISO string
      let dateString = doc.date
      if (!dateString && doc.createdAt) {
        try {
          const date = new Date(doc.createdAt)
          if (!isNaN(date.getTime())) {
            dateString = date.toISOString()
          } else {
            dateString = new Date().toISOString()
          }
        } catch {
          dateString = new Date().toISOString()
        }
      }

      // Convex documents always have _id - it's automatically generated
      const id = doc._id

      return {
        id,
        title: doc.title,
        category,
        date: dateString ?? new Date().toISOString(),
        snippet: doc.content ? doc.content.slice(0, 200) + '...' : undefined,
        iterationCount: doc.iterations,
      }
    })
  }, [sourceDocuments])

  // Use search results when there's an active search, otherwise use all articles
  const displayArticles = searchQuery.trim() && searchResults ? searchResults : articles

  const handleCategoryChange = (category?: CategoryType) => {
    setSelectedCategory(category ?? null)
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
  }

  const handleArticlePress = (article: Article) => {
    // Navigate to the article detail route
    router.push(`/document/${article.id}`)
  }

  const handleImportPress = () => {
    setImportModalVisible(true)
  }

  const handleImportDismiss = () => {
    setImportModalVisible(false)
  }

  const handleImportSuccess = () => {
    // Refresh the articles list after import
    // The query will automatically refetch due to Convex reactivity
  }

  return (
    <>
      <ScreenLayout
      header={{
        title: 'Articles',
        showBack: true,
        onBack: () => router.canGoBack() ? router.back() : router.navigate('/chat/new'),
      }}
      edges="bottom"
      testID="articles-route-layout"
    >
      <ArticlesScreen
        articles={displayArticles}
        totalCount={searchQuery.trim() ? searchResults?.length : totalCount}
        categories={availableCategories}
        categoryCounts={categoryCounts}
        totalArticleCount={totalArticleCount}
        selectedCategory={selectedCategory}
        loading={isLoading || isSearching}
        isLoadingCategories={isLoadingCategories}
        onSearch={handleSearch}
        onCategoryChange={handleCategoryChange}
        onArticlePress={handleArticlePress}
        onImportPress={handleImportPress}
        testID="articles-route"
      />
    </ScreenLayout>

    {/* Import Modal */}
    <ArticleImportModal
      visible={importModalVisible}
      onDismiss={handleImportDismiss}
      onSuccess={handleImportSuccess}
      testID="articles-import-modal"
    />
    </>
  )
}
