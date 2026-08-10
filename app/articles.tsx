import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { documentsByCategory, documentsByOwner } from '@/app/zero/queries';
import { ArticleImportModal } from '@/components/articles/ArticleImportModal';
import type { CategoryType } from '@/components/CategoryBadge';
import { ScreenLayout } from '@/components/ui/screen-layout';
import { useDebounce } from '@/hooks/useDebounce';
import {
  mapCategoryTypeToDocumentCategory,
  mapDocumentCategoryToCategoryType,
} from '@/lib/category-mapping';
import { ArticlesScreen } from '@/screens/articles-screen';

interface Article {
  id: string;
  title: string;
  category: CategoryType;
  date: string;
  snippet?: string;
  iterationCount?: number;
}

/** Zero-published documents row (snake_case Postgres columns). */
type ZeroDocument = {
  id: string;
  title?: string | null;
  content?: string | null;
  category?: string | null;
  date?: string | null;
  created_at: number;
  iterations?: number | null;
};

/**
 * Articles route screen
 * Displays all documents from the Zero-synced knowledge base with filtering and search.
 * Accessed from the drawer navigation.
 *
 * Data plane: Zero queries (documentsByOwner / documentsByCategory) per
 * 13-client-data-contract.yaml. Search filters the Zero result set client-side
 * (hybrid search Hono mission is optional when the mission type is available).
 */
export default function ArticlesRoute() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Article[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);

  const documentCategory = mapCategoryTypeToDocumentCategory(selectedCategory);

  // Zero reactive list — category filter when selected, else all owned docs
  const listQuery = useMemo(
    () => (documentCategory ? documentsByCategory(documentCategory) : documentsByOwner()),
    [documentCategory]
  );
  const [rawDocuments, listStatus] = useZeroQuery(listQuery);
  const documents = (rawDocuments ?? []) as unknown as ZeroDocument[];

  // Category counts derived from the full Zero document set (reactive)
  const [allDocuments] = useZeroQuery(documentsByOwner());
  const allDocs = (allDocuments ?? []) as unknown as ZeroDocument[];

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<CategoryType, number>> = {};
    for (const doc of allDocs) {
      const cat = mapDocumentCategoryToCategoryType(doc.category ?? 'general');
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [allDocs]);

  const availableCategories = useMemo(() => {
    return (Object.keys(categoryCounts) as CategoryType[])
      .filter((cat) => (categoryCounts[cat] ?? 0) > 0)
      .sort((a, b) => (categoryCounts[b] ?? 0) - (categoryCounts[a] ?? 0));
  }, [categoryCounts]);

  const toArticle = useCallback((doc: ZeroDocument): Article => {
    const category = mapDocumentCategoryToCategoryType(doc.category ?? 'general');
    let dateString = doc.date ?? undefined;
    if (!dateString && doc.created_at) {
      try {
        const date = new Date(doc.created_at);
        dateString = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
      } catch {
        dateString = new Date().toISOString();
      }
    }
    return {
      id: doc.id,
      title: doc.title ?? 'Untitled',
      category,
      date: dateString ?? new Date().toISOString(),
      snippet: doc.content ? `${doc.content.slice(0, 200)}...` : undefined,
      iterationCount: doc.iterations ?? undefined,
    };
  }, []);

  const articles: Article[] = useMemo(() => documents.map(toArticle), [documents, toArticle]);

  // Client-side search over Zero-synced documents (contract hybrid search is
  // POST /api/missions when a search mission type is registered; until then
  // filter the reactive Zero projection so list stays Zero-bound).
  const performSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults(null);
        return;
      }
      setIsSearching(true);
      try {
        const q = query.trim().toLowerCase();
        const pool = documentCategory
          ? allDocs.filter((d) => d.category === documentCategory)
          : allDocs;
        const matched = pool
          .filter((doc) => {
            const title = (doc.title ?? '').toLowerCase();
            const content = (doc.content ?? '').toLowerCase();
            return title.includes(q) || content.includes(q);
          })
          .map(toArticle);
        setSearchResults(matched);
      } catch (error) {
        console.error('Search failed:', error);
        setSearchResults(null);
      } finally {
        setIsSearching(false);
      }
    },
    [allDocs, documentCategory, toArticle]
  );

  const debouncedSearch = useDebounce(performSearch, 300);

  useEffect(() => {
    debouncedSearch(searchQuery);
  }, [searchQuery, debouncedSearch]);

  useEffect(() => {
    if (searchQuery.trim()) {
      performSearch(searchQuery);
    }
  }, [performSearch, searchQuery]);

  const isLoading = listStatus?.type === 'unknown';
  const isLoadingCategories = allDocuments === undefined;

  const displayArticles = searchQuery.trim() && searchResults ? searchResults : articles;

  const displayCount = useMemo(() => {
    if (searchQuery.trim() && searchResults) {
      return searchResults.length;
    }
    return articles.length;
  }, [searchQuery, searchResults, articles.length]);

  const handleCategoryChange = (category?: CategoryType) => {
    setSelectedCategory(category ?? null);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleArticlePress = (article: Article) => {
    router.push(`/document/${article.id}`);
  };

  const handleImportPress = () => {
    setImportModalVisible(true);
  };

  const handleImportDismiss = () => {
    setImportModalVisible(false);
  };

  const handleImportSuccess = () => {
    // Zero mutator updates are reactive — list refreshes automatically
  };

  return (
    <>
      <ScreenLayout
        header={{
          title: 'Articles',
          showBack: true,
          onBack: () => (router.canGoBack() ? router.back() : router.navigate('/chat/new')),
        }}
        edges="bottom"
        testID="articles-route-layout"
      >
        <ArticlesScreen
          articles={displayArticles}
          totalCount={displayCount}
          categories={availableCategories}
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

      <ArticleImportModal
        visible={importModalVisible}
        onDismiss={handleImportDismiss}
        onSuccess={handleImportSuccess}
        testID="articles-import-modal"
      />
    </>
  );
}
