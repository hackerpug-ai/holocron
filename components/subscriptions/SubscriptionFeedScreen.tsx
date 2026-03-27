import React from 'react'
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { useAction, useQuery } from 'convex/react'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'
import { useSubscriptionFeed } from '@/hooks/use-subscription-feed'
import { api } from '@/convex/_generated/api'
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

  // StyleSheet with theme tokens (defined inside component to access theme)
  const styles = StyleSheet.create({
    listContent: {
      flexGrow: 1,
    },
    emptyListContent: {
      flexGrow: 1,
    },
    itemContainer: {
      paddingVertical: theme.spacing.lg,
      paddingHorizontal: theme.spacing.lg,
      borderBottomWidth: 1,
    },
    emptyContainer: {
      flex: 1,
      paddingHorizontal: theme.spacing.xl,
      paddingVertical: theme.spacing['2xl'],
    },
    emptyCentered: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingContainer: {
      paddingVertical: theme.spacing.lg,
      paddingHorizontal: theme.spacing.lg,
    },
  })

  // Don't pass contentType if it's not one of the supported values
  const safeContentType = contentType === 'mixed' ? undefined : contentType
  const { items, isLoading, hasMore } = useSubscriptionFeed({
    limit: 20,
    contentType: safeContentType,
    searchQuery,
  })

  // Detect whether subscriptionContent records exist even when feed is empty.
  // This distinguishes "feed is building" from "no subscriptions added".
  const hasContent = useQuery(api.subscriptions.queries.hasAnyContent)
  const buildFeed = useAction(api.feeds.actions.buildFeed)

  const [isBuildingFeed, setIsBuildingFeed] = React.useState(false)

  const handleBuildFeed = async () => {
    setIsBuildingFeed(true)
    try {
      await buildFeed({})
    } finally {
      setIsBuildingFeed(false)
    }
  }

  // Load more items when reaching end of list
  const loadMore = () => {
    // Note: Pagination logic will be added when feed queries support cursors
    // For now, hasMore indicates if more items could exist
    if (hasMore && !isLoading) {
      // TODO: pagination when feed queries support cursors
    }
  }

  // Refetch data on pull-to-refresh
  const handleRefresh = () => {
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
  // Distinguishes between "feed is building" (content exists but feed not yet
  // populated) and "no subscriptions added" (no content records at all).
  const EmptyState = () => {
    if (searchQuery) {
      return (
        <View
          testID={`${testID}-empty-state`}
          style={[styles.emptyContainer, styles.emptyCentered]}
        >
          <Text variant="h3" className="text-muted-foreground text-center mb-4">
            {`No results for "${searchQuery}"`}
          </Text>
          <Text variant="p" className="text-muted-foreground text-center">
            Try a different search term
          </Text>
        </View>
      )
    }

    if (hasContent) {
      // Content records exist but feedItems is empty — feed is still building
      return (
        <View
          testID={`${testID}-empty-state-building`}
          style={[styles.emptyContainer, styles.emptyCentered]}
        >
          <ActivityIndicator
            testID={`${testID}-building-indicator`}
            className="mb-4"
          />
          <Text variant="h3" className="text-muted-foreground text-center mb-2">
            Feed is building...
          </Text>
          <Text variant="p" className="text-muted-foreground text-center mb-6">
            Your subscription content is being processed. This may take a moment.
          </Text>
          <Button
            testID={`${testID}-refresh-feed-button`}
            variant="outline"
            onPress={handleBuildFeed}
            disabled={isBuildingFeed}
          >
            <Text>{isBuildingFeed ? 'Refreshing...' : 'Refresh feed'}</Text>
          </Button>
        </View>
      )
    }

    // No content records at all — prompt user to add subscriptions
    return (
      <View
        testID={`${testID}-empty-state`}
        style={[styles.emptyContainer, styles.emptyCentered]}
      >
        <Text variant="h3" className="text-muted-foreground text-center mb-4">
          No content yet
        </Text>
        <Text variant="p" className="text-muted-foreground text-center">
          Subscribe to sources to see their content here
        </Text>
      </View>
    )
  }

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
