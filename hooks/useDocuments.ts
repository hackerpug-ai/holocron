import { useCallback, useEffect, useState } from 'react'
import { listDocuments, searchFTS, type Document, type DocumentCategory } from '@/lib/supabase'
import type { CategoryType } from '@/components/CategoryBadge'

/**
 * Maps Supabase document categories to UI display categories
 * All document categories map to 'general' except 'research' which maps to 'research'
 */
export function mapDocumentCategoryToCategoryType(docCategory: DocumentCategory): CategoryType {
  return docCategory === 'research' ? 'research' : 'general'
}

/**
 * Maps UI category type back to Supabase document category
 * Only 'research' (and research-related types) map directly to 'research'
 * All others return undefined (no filter applied)
 */
export function mapCategoryTypeToDocumentCategory(categoryType: CategoryType | undefined): DocumentCategory | undefined {
  // Research-related categories map to 'research' in Supabase
  if (categoryType === 'research' || categoryType === 'deep-research' || categoryType === 'factual' || categoryType === 'academic') {
    return 'research'
  }
  // All other categories return undefined (no filter)
  return undefined
}

/**
 * Transforms a Supabase Document to an Article for ArticlesScreen
 */
function transformDocumentToArticle(document: Document) {
  return {
    id: String(document.id),
    title: document.title,
    category: mapDocumentCategoryToCategoryType(document.category),
    date: document.created_at || document.date || new Date().toISOString(),
    snippet: document.content ? document.content.slice(0, 200) + '...' : undefined,
    iterationCount: document.iterations,
  }
}

export interface Article {
  id: string
  title: string
  category: CategoryType
  date: string
  snippet?: string
  iterationCount?: number
}

interface UseDocumentsOptions {
  category?: CategoryType | null
  searchQuery?: string
  enabled?: boolean
}

interface UseDocumentsResult {
  articles: Article[]
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * Hook for fetching and filtering documents from Supabase
 * Supports category filtering and text search
 */
export function useDocuments({
  category,
  searchQuery,
  enabled = true,
}: UseDocumentsOptions = {}): UseDocumentsResult {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchDocuments = useCallback(async () => {
    if (!enabled) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      let documents: Document[] = []

      // Map UI category to Supabase category
      const supabaseCategory = mapCategoryTypeToDocumentCategory(category ?? undefined)

      if (searchQuery && searchQuery.trim().length > 0) {
        // Use full-text search when query is provided
        const searchResults = await searchFTS(searchQuery.trim(), {
          category: supabaseCategory,
          limit: 50,
        })
        // Convert search results to documents
        documents = searchResults.map((result) => ({
          id: result.id,
          title: result.title,
          category: result.category as DocumentCategory,
          content: result.content,
          created_at: new Date().toISOString(), // Search results don't have created_at
        }))
      } else {
        // List all documents with optional category filter
        documents = await listDocuments({
          category: supabaseCategory,
          limit: 50,
        })
      }

      // Transform documents to articles
      const transformedArticles = documents.map(transformDocumentToArticle)
      setArticles(transformedArticles)
    } catch (err) {
      console.error('Error fetching documents:', err)
      setError(err instanceof Error ? err : new Error('Failed to fetch documents'))
      setArticles([])
    } finally {
      setLoading(false)
    }
  }, [enabled, category, searchQuery])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  return {
    articles,
    loading,
    error,
    refetch: fetchDocuments,
  }
}
