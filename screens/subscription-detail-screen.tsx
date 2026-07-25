import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View, type ViewProps } from 'react-native';
import { documentsByOwner, subscriptionContentByGroup } from '@/app/zero/queries';
import { ArticleCard } from '@/components/ArticleCard';
import type { CategoryType } from '@/components/CategoryBadge';
import { EmptyState } from '@/components/EmptyState';
import { SearchInput } from '@/components/SearchInput';
import { SectionHeader } from '@/components/SectionHeader';
import { FileText as FileTextIcon, Loader2 } from '@/components/ui/icons';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface SubscriptionDetailScreenProps extends Omit<ViewProps, 'children'> {
  /** Subscription IDs to fetch content for */
  subscriptionIds: string[];
  /** Display name for the subscription group */
  groupName: string;
}

type SubscriptionContentRow = {
  id: string;
  source_id?: string | null;
  title?: string | null;
  research_status?: string | null;
  discovered_at?: number | null;
  document_id?: string | null;
  metadata_json?: {
    description?: string;
    [key: string]: unknown;
  } | null;
  created_at: number;
};

type DocumentRow = {
  id: string;
  title?: string | null;
  content?: string | null;
  category?: string | null;
  created_at: number;
};

type JoinedItem = {
  content: SubscriptionContentRow;
  document: DocumentRow | null;
};

/**
 * SubscriptionDetailScreen displays all researched documents for a subscription group.
 *
 * Shows articles/documents generated from subscription content with search and filtering.
 * Reuses ArticleCard component for consistent document display.
 *
 * Data via Zero: subscription_content ⨝ documents (client-side join).
 * CAP-CUT-01 — no convex/react.
 */
export function SubscriptionDetailScreen({
  subscriptionIds,
  groupName,
  className,
  ...props
}: SubscriptionDetailScreenProps) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const idSet = useMemo(() => new Set(subscriptionIds), [subscriptionIds]);

  const [rawContent, contentDetails] = useZeroQuery(subscriptionContentByGroup(200));
  const [rawDocuments, docsDetails] = useZeroQuery(documentsByOwner());

  const contentRows = (rawContent ?? []) as unknown as SubscriptionContentRow[];
  const documentRows = (rawDocuments ?? []) as unknown as DocumentRow[];
  const isLoading =
    (contentDetails.type !== 'complete' && contentRows.length === 0) ||
    (docsDetails.type !== 'complete' && documentRows.length === 0);

  const contentWithDocuments = useMemo<JoinedItem[] | undefined>(() => {
    if (isLoading) return undefined;

    const docsById = new Map(documentRows.map((d) => [d.id, d]));

    const joined = contentRows
      .filter(
        (c) => c.research_status === 'researched' && c.source_id != null && idSet.has(c.source_id)
      )
      .map((c) => ({
        content: c,
        document: c.document_id ? (docsById.get(c.document_id) ?? null) : null,
      }))
      .sort(
        (a, b) =>
          (b.content.discovered_at ?? b.content.created_at) -
          (a.content.discovered_at ?? a.content.created_at)
      );

    return joined;
  }, [contentRows, documentRows, idSet, isLoading]);

  // Filter by search query
  const filteredContent = contentWithDocuments?.filter((item) => {
    if (!searchValue) return true;
    const query = searchValue.toLowerCase();
    return (
      item.content.title?.toLowerCase().includes(query) ||
      item.document?.title?.toLowerCase().includes(query)
    );
  });

  const handleSearchChange = (query: string) => {
    setSearchValue(query);
  };

  const handleClear = () => {
    setSearchValue('');
  };

  const handleArticlePress = (documentId: string) => {
    if (documentId) {
      router.push(`/document/${documentId}`);
    }
  };

  const renderEmptyState = () => {
    if (contentWithDocuments === undefined) {
      return (
        <View className="flex-1 items-center justify-center p-8">
          <Loader2 size={32} className="text-muted-foreground animate-spin" />
          <Text className="mt-4 text-center text-muted-foreground">Loading documents...</Text>
        </View>
      );
    }

    if (searchValue) {
      return (
        <EmptyState
          icon={FileTextIcon}
          title="No matching documents"
          description="No documents match your search query."
        />
      );
    }

    return (
      <EmptyState
        icon={FileTextIcon}
        title="No documents yet"
        description={`No researched documents found for ${groupName}. Documents will appear here when content is researched.`}
      />
    );
  };

  return (
    <View className={cn('flex-1 bg-background', className)} {...props}>
      {/* Header */}
      <SectionHeader title={groupName} className="border-b border-border px-4 pb-4" />

      {/* Search */}
      <View className="px-4 pt-4">
        <SearchInput
          value={searchValue}
          onChangeText={handleSearchChange}
          onClear={handleClear}
          placeholder="Search documents..."
          testID="subscription-documents-search"
        />
      </View>

      {/* Document count */}
      {filteredContent && filteredContent.length > 0 && (
        <View className="px-4 pt-3">
          <Text className="text-sm text-muted-foreground">
            {filteredContent.length} document{filteredContent.length !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {/* Document list or empty state */}
      {filteredContent && filteredContent.length > 0 ? (
        <FlatList
          data={filteredContent}
          keyExtractor={(item) => item.content.id}
          renderItem={({ item }) => {
            // Extract document data for ArticleCard
            const title = item.document?.title || item.content.title || 'Untitled';
            const date = new Date(item.content.discovered_at ?? item.content.created_at);
            const category = (item.document?.category || 'general') as CategoryType;
            // Use content field for snippet (first 200 chars)
            const snippet = item.document?.content
              ? `${item.document.content.slice(0, 200)}${item.document.content.length > 200 ? '...' : ''}`
              : item.content.metadata_json?.description;

            return (
              <View className="mx-4 mb-3">
                <ArticleCard
                  title={title}
                  category={category}
                  date={date}
                  snippet={snippet}
                  onPress={() => handleArticlePress(item.document?.id || '')}
                  compact={false}
                />
              </View>
            );
          }}
          contentContainerClassName="pt-3 pb-4"
          testID="subscription-documents-list"
        />
      ) : (
        renderEmptyState()
      )}
    </View>
  );
}
