/**
 * SubscriptionFeedScreen - Display aggregated feed of subscription content
 *
 * Shows feed items with filtering by content type (video, blog, social).
 * Includes settings modal for configuring feed preferences.
 * Uses FlatList for performance with infinite scroll and pull-to-refresh.
 */
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import type { Doc } from '@/convex/_generated/dataModel'
import { api } from '@/convex/_generated/api'
import { Settings } from '@/components/ui/icons'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'
import { useSubscriptionFeed } from '@/hooks/use-subscription-feed'
import { useWebView } from '@/hooks/useWebView'
import { SubscriptionFeedFilters } from '@/components/subscriptions/SubscriptionFeedFilters'
import { SubscriptionFeedItem } from '@/components/subscriptions/SubscriptionFeedItem'
import { SubscriptionSettingsModal } from '@/components/subscriptions/SubscriptionSettingsModal'
import { WebViewSheet } from '@/components/webview/WebViewSheet'
import type { FilterType } from '@/components/subscriptions/SubscriptionFeedFilters'

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
  const { colors, spacing } = useTheme()
  const router = useRouter()
  const { webViewState, openUrl, closeWebView } = useWebView()

  // Filter state
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('all')
  // Settings modal state
  const [settingsVisible, setSettingsVisible] = useState(false)

  // Mutation to fetch URL when opening a feed item
  const openFeedItemMutation = useMutation(api.feeds.mutations.openFeedItem)

  // Fetch digest summary for filter counts
  const digest = useQuery(api.feeds.queries.getDigestSummary, {
    limit: 1000, // Get all items for accurate counts
  })

  // Calculate counts from digest summary
  const counts = {
    all: digest?.counts.total ?? 0,
    video: digest?.counts.video ?? 0,
    blog: digest?.counts.blog ?? 0,
    social: digest?.counts.social ?? 0,
  }

  // Map filter type to contentType for query
  const filterContentType = selectedFilter === 'all' ? undefined : selectedFilter

  // Don't pass contentType if it's not one of the supported values
  const safeContentType = contentType === 'mixed' ? undefined : contentType
  const { items, isLoading, loadMore, reset } = useSubscriptionFeed({
    limit: 20,
    contentType: filterContentType ?? safeContentType,
    searchQuery,
  })

  // Detect whether subscriptionContent records exist even when feed is empty.
  // This distinguishes "feed is building" from "no subscriptions added".
  const hasContent = useQuery(api.subscriptions.queries.hasAnyContent)
  const buildFeed = useAction(api.feeds.actions.buildFeed)

  const [isBuildingFeed, setIsBuildingFeed] = useState(false)

  const handleBuildFeed = async () => {
    setIsBuildingFeed(true)
    try {
      await buildFeed({})
    } finally {
      setIsBuildingFeed(false)
    }
  }

  const handleSettingsPress = () => {
    setSettingsVisible(true)
  }

  const handleManageSubscriptions = () => {
    setSettingsVisible(false)
    router.push('/subscriptions')
  }

  const handleItemPress = async (item: Doc<'feedItems'>) => {
    try {
      const url = await openFeedItemMutation({ feedItemId: item._id })
      if (url) {
        openUrl(url)
      } else {
        console.warn('[Feed] No URL available for item:', item._id)
      }
    } catch (error) {
      console.error('[Feed] Failed to open item:', error)
    }
  }

  // Load more items when reaching end of list
  const handleLoadMore = () => {
    if (!isLoading) {
      loadMore()
    }
  }

  // Refetch data on pull-to-refresh
  const handleRefresh = () => {
    // Reset to initial limit and refetch
    reset()
  }

  // Reset feed when filters change
  useEffect(() => {
    reset()
  }, [selectedFilter, searchQuery, reset])

  // StyleSheet with theme tokens (defined inside component to access theme)
  const styles = StyleSheet.create({
    listContent: {
      flexGrow: 1,
    },
    emptyListContent: {
      flexGrow: 1,
    },
    itemContainer: {
      paddingVertical: spacing.sm,
    },
    emptyContainer: {
      flex: 1,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing['2xl'],
    },
    emptyCentered: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingContainer: {
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: {
      flex: 1,
    },
    settingsButton: {
      padding: spacing.sm,
    },
  })

  // Default item renderer using SubscriptionFeedItem card component
  const defaultRenderItem = ({ item }: { item: Doc<'feedItems'> }) => {
    if (renderItem) {
      return renderItem(item) as React.ReactElement
    }

    return (
      <View style={styles.itemContainer}>
        <SubscriptionFeedItem
          feedItemId={item._id}
          groupKey={item.groupKey}
          title={item.title}
          summary={item.summary}
          contentType={item.contentType}
          itemCount={item.itemCount}
          thumbnailUrl={item.thumbnailUrl}
          viewed={item.viewed}
          publishedAt={item.publishedAt}
          authorHandle={item.authorHandle}
          creatorName={item.creatorName}
          onPress={() => handleItemPress(item)}
          testID={`${testID}-item-${item._id}`}
        />
      </View>
    )
  }

  // List header with settings button
  const ListHeader = () => (
    <>
      {/* Header with settings button */}
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.border }
        ]}
        testID={`${testID}-header`}
      >
        <Text variant="h3" style={styles.headerTitle}>
          Subscription Feed
        </Text>
        <Pressable
          onPress={handleSettingsPress}
          style={styles.settingsButton}
          className="active:opacity-70"
          testID={`${testID}-settings-button`}
        >
          <Settings size={24} className="text-foreground" />
        </Pressable>
      </View>

      {/* Filters */}
      <SubscriptionFeedFilters
        selectedFilter={selectedFilter}
        onFilterChange={setSelectedFilter}
        counts={counts}
        testID={`${testID}-filters`}
      />
    </>
  )

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
    <>
      <FlatList
        testID={testID}
        data={items}
        renderItem={defaultRenderItem}
        keyExtractor={keyExtractor}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={handleRefresh}
          />
        }
        ListHeaderComponent={ListHeader}
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

      {/* Settings modal */}
      <SubscriptionSettingsModal
        visible={settingsVisible}
        onDismiss={() => setSettingsVisible(false)}
        onManageSubscriptions={handleManageSubscriptions}
        testID={`${testID}-settings-modal`}
      />

      {/* WebViewSheet for feed item content */}
      <WebViewSheet
        visible={webViewState.visible}
        url={webViewState.url}
        onClose={closeWebView}
        testID={`${testID}-webview`}
      />
    </>
  )
}
