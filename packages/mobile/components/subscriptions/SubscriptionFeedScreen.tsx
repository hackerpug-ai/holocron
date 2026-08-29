/**
 * SubscriptionFeedScreen - durable subscription content feed with search
 *
 * Default mode: Displays researched subscription content grouped by content type.
 * Search mode: Full-text search over subscription content when user types 2+ chars.
 *
 * Uses FlatList for performance with pull-to-refresh in default mode.
 */

import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { subscriptionContentSearch } from '@/app/zero/queries';
import { SearchInput } from '@/components/SearchInput';
import { type FeedCategory, FeedFilterChips } from '@/components/subscriptions/FeedFilterChips';
import { FeedItemSkeleton } from '@/components/subscriptions/FeedItemSkeleton';
import { FeedSkeleton } from '@/components/subscriptions/FeedSkeleton';
import { OfflineBanner } from '@/components/subscriptions/OfflineBanner';
import { QueueIndicator } from '@/components/subscriptions/QueueIndicator';
import { SearchContentCard } from '@/components/subscriptions/SearchContentCard';
import { Text } from '@/components/ui/text';
import { WebViewSheet } from '@/components/webview/WebViewSheet';
import { useTheme } from '@/hooks/use-theme';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { useWebView } from '@/hooks/useWebView';

interface SubscriptionFeedScreenProps {
  testID?: string;
}

type FeedContent = {
  id: string;
  title: string;
  url?: string;
  contentCategory?: string;
  authorHandle?: string;
  thumbnailUrl?: string;
  aiRelevanceScore?: number;
  discoveredAt: number;
  description?: string;
  feedItemId?: string;
};

function categoryForContent(item: FeedContent): Exclude<FeedCategory, 'all'> {
  if (item.contentCategory === 'video') return 'video';
  if (item.contentCategory === 'social') return 'social';
  if (item.contentCategory === 'release' || item.contentCategory === 'changelog') return 'releases';
  return 'articles';
}

function descriptionFromMetadata(metadata: { description?: string } | string | null | undefined) {
  if (!metadata) return undefined;
  if (typeof metadata !== 'string') return metadata.description;
  try {
    return (JSON.parse(metadata) as { description?: string }).description;
  } catch {
    return undefined;
  }
}

export function SubscriptionFeedScreen({
  testID = 'subscription-feed',
}: SubscriptionFeedScreenProps) {
  const { spacing } = useTheme();
  const { webViewState, openUrl, closeWebView } = useWebView();

  // Offline support
  const { queueLength } = useOfflineQueue();

  // Search state
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FeedCategory>('all');

  // Search query — Zero subscription_content, client-filtered when 2+ chars entered
  const isSearching = searchText.length >= 2;
  const [rawSearchRows, searchDetails] = useZeroQuery(subscriptionContentSearch(200));
  const content = useMemo<FeedContent[]>(() => {
    const rows = (rawSearchRows ?? []) as Array<{
      id: string;
      title?: string | null;
      url?: string | null;
      content_category?: string | null;
      author_handle?: string | null;
      thumbnail_url?: string | null;
      ai_relevance_score?: number | null;
      feed_item_id?: string | null;
      discovered_at?: number | null;
      metadata_json?: { description?: string } | string | null;
    }>;
    return rows
      .map((item) => ({
        id: item.id,
        title: item.title ?? 'Untitled',
        url: item.url ?? undefined,
        contentCategory: item.content_category ?? undefined,
        authorHandle: item.author_handle ?? undefined,
        thumbnailUrl: item.thumbnail_url ?? undefined,
        aiRelevanceScore: item.ai_relevance_score ?? undefined,
        feedItemId: item.feed_item_id ?? undefined,
        discoveredAt: item.discovered_at ?? Date.now(),
        description: descriptionFromMetadata(item.metadata_json),
      }))
      .sort((a, b) => b.discoveredAt - a.discoveredAt);
  }, [rawSearchRows]);
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = searchText.toLowerCase();
    return content.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.authorHandle?.toLowerCase() || '').includes(q) ||
        (item.contentCategory?.toLowerCase() || '').includes(q)
    );
  }, [content, isSearching, searchText]);
  const isLoadingSearch =
    isSearching && searchDetails.type !== 'complete' && searchResults.length === 0;

  const handleSearchChange = (query: string) => {
    setSearchText(query);
  };

  const handleClearSearch = () => {
    setSearchText('');
  };

  // ---- Render helpers ----

  const renderSearchResults = () => {
    const results = searchResults;

    if (isLoadingSearch) {
      return (
        <View className="py-4" testID={`${testID}-search-loading`}>
          <FeedItemSkeleton variant="blog" testID={`${testID}-search-skeleton-0`} />
          <FeedItemSkeleton variant="blog" testID={`${testID}-search-skeleton-1`} />
        </View>
      );
    }

    if (results.length === 0 && isSearching) {
      return (
        <View
          className="flex-1 px-8 py-16 items-center justify-center"
          testID={`${testID}-search-empty`}
        >
          <Text variant="h3" className="text-muted-foreground text-center mb-4">
            {`No results for "${searchText}"`}
          </Text>
          <Text variant="p" className="text-muted-foreground text-center">
            Try a different search term
          </Text>
        </View>
      );
    }

    return (
      <View className="gap-3" testID={`${testID}-search-list`}>
        {results.map((item) => (
          <SearchContentCard
            key={item.id}
            title={item.title}
            url={item.url ?? ''}
            contentCategory={item.contentCategory ?? undefined}
            authorHandle={item.authorHandle ?? undefined}
            thumbnailUrl={item.thumbnailUrl ?? undefined}
            aiRelevanceScore={item.aiRelevanceScore ?? undefined}
            discoveredAt={item.discoveredAt}
            description={item.description}
            feedItemId={item.feedItemId}
            testID={`${testID}-search-result-${item.id}`}
            onPress={item.url ? () => openUrl(item.url ?? '') : undefined}
          />
        ))}
      </View>
    );
  };

  // Search mode
  if (isSearching) {
    return (
      <>
        <View className="flex-1 bg-background" testID={`${testID}-search-mode`}>
          {/* Search Input */}
          <View className="px-4 pb-4 pt-4">
            <SearchInput
              value={searchText}
              onChangeText={handleSearchChange}
              onClear={handleClearSearch}
              placeholder="Search subscriptions..."
              testID={`${testID}-search-input`}
              autoFocus
            />
          </View>

          {/* Search Results */}
          <View className="flex-1 px-4">{renderSearchResults()}</View>
        </View>

        <WebViewSheet
          visible={webViewState.visible}
          url={webViewState.url}
          onClose={closeWebView}
          testID={`${testID}-webview`}
        />
      </>
    );
  }

  const counts: Record<FeedCategory, number> = {
    all: content.length,
    video: 0,
    articles: 0,
    social: 0,
    releases: 0,
  };
  for (const item of content) counts[categoryForContent(item)] += 1;
  const filteredContent =
    selectedCategory === 'all'
      ? content
      : content.filter((item) => categoryForContent(item) === selectedCategory);
  const isLoadingContent = searchDetails.type !== 'complete' && content.length === 0;

  // Default mode: durable personalized subscription content.
  return (
    <>
      <OfflineBanner testID={`${testID}-offline-banner`} />

      <FlatList
        testID={testID}
        data={filteredContent}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
        }}
        accessibilityRole="list"
        accessibilityLabel="Content feed"
        accessibilityValue={{ text: `${filteredContent.length} items` }}
        // Performance optimizations for 60fps scrolling
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={10}
        windowSize={5}
        ListHeaderComponent={
          <View className="pb-4">
            {/* Queue indicator */}
            {queueLength > 0 && (
              <View className="mb-2">
                <QueueIndicator count={queueLength} testID={`${testID}-queue-indicator`} />
              </View>
            )}

            {/* Search Input */}
            <SearchInput
              value={searchText}
              onChangeText={handleSearchChange}
              onClear={handleClearSearch}
              placeholder="Search subscriptions..."
              testID={`${testID}-search-input`}
            />

            {content.length > 0 && (
              <View className="py-2 mt-3" testID={`${testID}-meta-banner`}>
                <Text variant="muted" className="text-xs text-muted-foreground">
                  {`${content.length} subscription items · ${counts.articles} articles · ${counts.video} videos · ${counts.releases} releases · ${counts.social} social`}
                </Text>
              </View>
            )}
            <FeedFilterChips
              activeCategory={selectedCategory}
              onCategoryChange={(category) =>
                setSelectedCategory((current) => (current === category ? 'all' : category))
              }
              counts={counts}
              testID={`${testID}-filters`}
            />
          </View>
        }
        renderItem={({ item }) => (
          <SearchContentCard
            title={item.title}
            url={item.url ?? ''}
            contentCategory={item.contentCategory}
            authorHandle={item.authorHandle}
            thumbnailUrl={item.thumbnailUrl}
            aiRelevanceScore={item.aiRelevanceScore}
            discoveredAt={item.discoveredAt}
            description={item.description}
            feedItemId={item.feedItemId}
            testID={`${testID}-item-${item.id}`}
            onPress={item.url ? () => openUrl(item.url ?? '') : undefined}
          />
        )}
        ListEmptyComponent={
          isLoadingContent ? (
            <FeedSkeleton count={5} testID={`${testID}-loading`} />
          ) : (
            <View
              className="flex-1 px-8 py-16 items-center justify-center"
              testID={`${testID}-empty`}
            >
              <Text variant="h3" className="text-muted-foreground text-center mb-4">
                No subscription content yet
              </Text>
              <Text variant="p" className="text-muted-foreground text-center">
                Subscribe to a source or check back after research completes.
              </Text>
            </View>
          )
        }
        scrollIndicatorInsets={{ top: spacing.md }}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
          autoscrollToTopThreshold: 10,
        }}
      />

      <WebViewSheet
        visible={webViewState.visible}
        url={webViewState.url}
        onClose={closeWebView}
        testID={`${testID}-webview`}
      />
    </>
  );
}
