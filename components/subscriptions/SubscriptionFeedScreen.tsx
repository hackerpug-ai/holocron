import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/text'
import { useTheme } from '@/hooks/use-theme'
import { useSubscriptionFeed } from '@/hooks/use-subscription-feed'
import type { Doc } from '@/convex/_generated/dataModel'

interface SubscriptionFeedScreenProps {
  /** Content type filter - "mixed" shows all types (frontend concept) */
  contentType?: 'video' | 'blog' | 'social' | 'mixed'
  /** Search query for filtering content */
  searchQuery?: string
  /** Optional test ID prefix for testing */
  testID?: string
  /** Optional custom renderer for feed items (defaults to simple rendering) */
  renderItem?: (item: Doc<'feedItems'>) => React.ReactNode
}

/**
 * SubscriptionFeedScreen displays subscription content with infinite scroll
 * and pull-to-refresh. Uses FlatList for performance and semantic theme tokens.
 *
 * @example
 * ```tsx
 * <SubscriptionFeedScreen
 *   contentType="mixed"
 *   searchQuery="react"
 *   testID="subscription-feed"
 * />
 * ```
 */
export function SubscriptionFeedScreen({
  contentType,
  searchQuery,
  testID = 'subscription-feed',
  renderItem,
}: SubscriptionFeedScreenProps) {
  const theme = useTheme()
  // Don't pass contentType if it's not one of the supported values
  const safeContentType = contentType === 'mixed' ? undefined : contentType
  const { items, isLoading, hasMore } = useSubscriptionFeed({
    limit: 20,
    contentType: safeContentType,
    searchQuery,
  })

  // Load more items when reaching end of list
  const loadMore = () => {
    // Note: Pagination logic will be added when feed queries support cursors
    // For now, hasMore indicates if more items could exist
    if (hasMore && !isLoading) {
      console.log('[SubscriptionFeedScreen] Load more triggered - pagination to be implemented')
    }
  }

  // Refetch data on pull-to-refresh
  const handleRefresh = () => {
    console.log('[SubscriptionFeedScreen] Refresh triggered')
    // Convex useQuery automatically refetches when the component re-renders
    // The isLoading state will update automatically
  }

  // Default item renderer (simple text-based for now)
  const defaultRenderItem = ({ item }: { item: Doc<'feedItems'> }) => {
    if (renderItem) {
      return renderItem(item) as React.ReactElement
    }

    return (
      <View
        testID={`${testID}-item-${item._id}`}
        style={[
          styles.itemContainer,
          { borderBottomColor: theme.colors.border }
        ]}
      >
        <Text variant="h3">{item.title || 'Untitled'}</Text>
        {item.summary && (
          <Text variant="p" className="text-muted-foreground mt-2">
            {item.summary}
          </Text>
        )}
        <Text variant="small" className="text-muted-foreground mt-2">
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </View>
    )
  }

  // Empty state component
  const EmptyState = () => (
    <View
      testID={`${testID}-empty-state`}
      style={[styles.emptyContainer, !items.length && styles.emptyCentered]}
    >
      <Text variant="h3" className="text-muted-foreground text-center mb-4">
        {searchQuery
          ? `No results for "${searchQuery}"`
          : 'No content yet'}
      </Text>
      <Text variant="p" className="text-muted-foreground text-center">
        {searchQuery
          ? 'Try a different search term'
          : 'Subscribe to sources to see their content here'}
      </Text>
    </View>
  )

  // Key extractor for FlatList
  const keyExtractor = (item: Doc<'feedItems'>) => item._id

  return (
    <FlatList
      testID={testID}
      data={items}
      renderItem={defaultRenderItem}
      keyExtractor={keyExtractor}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={handleRefresh}
        />
      }
      ListEmptyComponent={EmptyState}
      contentContainerStyle={[
        styles.listContent,
        !items.length && styles.emptyListContent,
      ]}
      ListFooterComponent={
        isLoading && items.length > 0 ? (
          <View style={styles.loadingContainer}>
            <Text variant="small" className="text-muted-foreground text-center">
              Loading more...
            </Text>
          </View>
        ) : undefined
      }
    />
  )
}

const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  itemContainer: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  emptyContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  emptyCentered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
})
