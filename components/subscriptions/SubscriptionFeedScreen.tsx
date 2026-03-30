/**
 * SubscriptionFeedScreen - What's New briefing feed with search
 *
 * Default mode: Displays AI-curated findings from the latest What's New report.
 * Search mode: Full-text search over subscription content when user types 2+ chars.
 *
 * Uses FlatList for performance with pull-to-refresh in default mode.
 */
import React, { useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Search, Settings, X } from '@/components/ui/icons'
import { Text } from '@/components/ui/text'
import { useTheme } from '@/hooks/use-theme'
import { useWhatsNewFeed } from '@/hooks/use-whats-new-feed'
import { useWebView } from '@/hooks/useWebView'
import { SubscriptionFeedFilters } from '@/components/subscriptions/SubscriptionFeedFilters'
import { FeedItemSkeleton } from '@/components/subscriptions/FeedItemSkeleton'
import { SubscriptionSettingsModal } from '@/components/subscriptions/SubscriptionSettingsModal'
import { WebViewSheet } from '@/components/webview/WebViewSheet'
import { WhatsNewFindingCard } from '@/components/whats-new/WhatsNewFindingCard'
import { SearchContentCard } from '@/components/subscriptions/SearchContentCard'

interface SubscriptionFeedScreenProps {
  testID?: string
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
}

/**
 * Maps the selectedCategory filter key to the hook's category argument.
 */
function toCategoryArg(
  key: string
): 'discovery' | 'release' | 'trend' | 'discussion' | undefined {
  if (
    key === 'discovery' ||
    key === 'release' ||
    key === 'trend' ||
    key === 'discussion'
  ) {
    return key
  }
  return undefined
}

export function SubscriptionFeedScreen({
  testID = 'subscription-feed',
}: SubscriptionFeedScreenProps) {
  const { colors, spacing } = useTheme()
  const router = useRouter()
  const { webViewState, openUrl, closeWebView } = useWebView()

  // Search state
  const [searchText, setSearchText] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Settings modal state
  const [settingsVisible, setSettingsVisible] = useState(false)

  // What's New feed (default mode)
  const { findings, report, isLoading, isRefreshing, refresh } = useWhatsNewFeed({
    category: toCategoryArg(selectedCategory),
  })

  // Search query — only active when 2+ chars entered
  const searchArgs =
    isSearching && searchText.length >= 2
      ? { query: searchText }
      : ('skip' as const)
  const searchResults = useQuery(
    api.subscriptions.queries.searchContent,
    searchArgs
  )

  const handleSettingsPress = () => setSettingsVisible(true)

  const handleManageSubscriptions = () => {
    setSettingsVisible(false)
    router.push('/subscriptions')
  }

  const handleSearchIconPress = () => {
    setIsSearching(true)
  }

  const handleClearSearch = () => {
    setSearchText('')
    setIsSearching(false)
  }

  // Filter chip options derived from latest report counts
  const discussionCount =
    report
      ? Math.max(
          0,
          (report.findingsCount ?? 0) -
            (report.discoveryCount ?? 0) -
            (report.releaseCount ?? 0) -
            (report.trendCount ?? 0)
        )
      : 0

  const filterOptions = [
    { key: 'discovery', label: 'Discoveries', count: report?.discoveryCount ?? 0 },
    { key: 'release', label: 'Releases', count: report?.releaseCount ?? 0 },
    { key: 'trend', label: 'Trends', count: report?.trendCount ?? 0 },
    { key: 'discussion', label: 'Discussions', count: discussionCount },
  ]

  // ---- StyleSheet ----
  const styles = StyleSheet.create({
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
    headerButtons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    iconButton: {
      padding: spacing.sm,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: spacing.sm,
    },
    searchInput: {
      flex: 1,
      paddingVertical: spacing.xs,
    },
    metaBanner: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    generatingBanner: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    listContent: {
      flexGrow: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    emptyContainer: {
      flex: 1,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing['2xl'],
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingContainer: {
      paddingVertical: spacing.lg,
    },
  })

  // ---- Sub-components ----

  const ListHeader = () => (
    <>
      {/* Header row */}
      <View
        style={[styles.header, { borderBottomColor: colors.border }]}
        testID={`${testID}-header`}
      >
        {isSearching ? (
          <Text
            variant="h3"
            style={styles.headerTitle}
            testID={`${testID}-search-title`}
          >
            Search
          </Text>
        ) : (
          <Text
            variant="h3"
            style={styles.headerTitle}
            testID={`${testID}-title`}
          >
            What's New
          </Text>
        )}

        <View style={styles.headerButtons}>
          {!isSearching && (
            <Pressable
              onPress={handleSearchIconPress}
              style={styles.iconButton}
              className="active:opacity-70"
              testID={`${testID}-search-button`}
            >
              <Search size={22} className="text-foreground" />
            </Pressable>
          )}
          <Pressable
            onPress={handleSettingsPress}
            style={styles.iconButton}
            className="active:opacity-70"
            testID={`${testID}-settings-button`}
          >
            <Settings size={22} className="text-foreground" />
          </Pressable>
        </View>
      </View>

      {/* Search input row (visible when searching) */}
      {isSearching && (
        <View
          style={[styles.searchRow, { borderBottomColor: colors.border }]}
          testID={`${testID}-search-row`}
        >
          <Search size={16} className="text-muted-foreground" />
          <TextInput
            autoFocus
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search subscriptions..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            testID={`${testID}-search-input`}
            returnKeyType="search"
            clearButtonMode="never"
          />
          <Pressable
            onPress={handleClearSearch}
            style={styles.iconButton}
            testID={`${testID}-clear-search`}
          >
            <X size={18} className="text-muted-foreground" />
          </Pressable>
        </View>
      )}

      {/* Report metadata banner (default mode only) */}
      {!isSearching && report && (
        <View
          style={[styles.metaBanner, { borderBottomColor: colors.border }]}
          testID={`${testID}-meta-banner`}
        >
          <Text variant="muted" className="text-xs text-muted-foreground">
            {`${report.findingsCount ?? 0} findings from ${
              (report.summaryJson as { sources?: unknown[] } | undefined)?.sources?.length ?? 0
            } sources · Generated ${formatRelativeTime(report.createdAt)}`}
          </Text>
        </View>
      )}

      {/* Generating new report banner */}
      {!isSearching && isRefreshing && (
        <View
          style={[styles.generatingBanner, { borderBottomColor: colors.border }]}
          testID={`${testID}-generating-banner`}
        >
          <ActivityIndicator size="small" />
          <Text variant="muted" className="text-xs text-muted-foreground">
            Generating new report...
          </Text>
        </View>
      )}

      {/* Filter chips (default mode only) */}
      {!isSearching && (
        <SubscriptionFeedFilters
          options={filterOptions}
          selectedFilter={selectedCategory}
          onFilterChange={setSelectedCategory}
          testID={`${testID}-filters`}
        />
      )}
    </>
  )

  // ---- Render helpers ----

  if (isSearching) {
    const results = searchResults ?? []
    const isLoadingSearch = searchText.length >= 2 && searchResults === undefined

    return (
      <>
        <FlatList
          testID={`${testID}-search-list`}
          data={results}
          keyExtractor={(item) => item._id}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <SearchContentCard
              key={item._id}
              title={item.title}
              url={item.url ?? ''}
              contentCategory={item.contentCategory ?? undefined}
              authorHandle={item.authorHandle ?? undefined}
              thumbnailUrl={item.thumbnailUrl ?? undefined}
              aiRelevanceScore={item.aiRelevanceScore ?? undefined}
              discoveredAt={item.discoveredAt}
              testID={`${testID}-search-result-${item._id}`}
              onPress={item.url ? () => openUrl(item.url!) : undefined}
            />
          )}
          ListEmptyComponent={
            isLoadingSearch ? (
              <View
                style={styles.loadingContainer}
                testID={`${testID}-search-loading`}
              >
                <FeedItemSkeleton variant="blog" testID={`${testID}-search-skeleton-0`} />
                <FeedItemSkeleton variant="blog" testID={`${testID}-search-skeleton-1`} />
              </View>
            ) : searchText.length >= 2 ? (
              <View
                style={styles.emptyContainer}
                testID={`${testID}-search-empty`}
              >
                <Text
                  variant="h3"
                  className="text-muted-foreground text-center mb-4"
                >
                  {`No results for "${searchText}"`}
                </Text>
                <Text variant="p" className="text-muted-foreground text-center">
                  Try a different search term
                </Text>
              </View>
            ) : null
          }
        />

        <SubscriptionSettingsModal
          visible={settingsVisible}
          onDismiss={() => setSettingsVisible(false)}
          onManageSubscriptions={handleManageSubscriptions}
          testID={`${testID}-settings-modal`}
        />

        <WebViewSheet
          visible={webViewState.visible}
          url={webViewState.url}
          onClose={closeWebView}
          testID={`${testID}-webview`}
        />
      </>
    )
  }

  // Default mode: What's New feed
  return (
    <>
      <FlatList
        testID={testID}
        data={findings}
        keyExtractor={(_, index) => String(index)}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} />
        }
        renderItem={({ item, index }) => (
          <WhatsNewFindingCard
            title={item.title}
            url={item.url}
            source={item.source}
            category={item.category}
            score={item.score}
            summary={item.summary}
            publishedAt={item.publishedAt}
            author={item.author}
            engagementVelocity={item.engagementVelocity}
            tags={item.tags}
            testID={`${testID}-finding-${index}`}
            onPress={() => openUrl(item.url)}
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <View
              style={styles.loadingContainer}
              testID={`${testID}-loading`}
            >
              <FeedItemSkeleton variant="blog" testID={`${testID}-skeleton-0`} />
              <FeedItemSkeleton variant="blog" testID={`${testID}-skeleton-1`} />
              <FeedItemSkeleton variant="blog" testID={`${testID}-skeleton-2`} />
            </View>
          ) : (
            <View
              style={styles.emptyContainer}
              testID={`${testID}-empty`}
            >
              <Text
                variant="h3"
                className="text-muted-foreground text-center mb-4"
              >
                No reports yet
              </Text>
              <Text variant="p" className="text-muted-foreground text-center">
                Pull down to generate your first briefing.
              </Text>
            </View>
          )
        }
      />

      <SubscriptionSettingsModal
        visible={settingsVisible}
        onDismiss={() => setSettingsVisible(false)}
        onManageSubscriptions={handleManageSubscriptions}
        testID={`${testID}-settings-modal`}
      />

      <WebViewSheet
        visible={webViewState.visible}
        url={webViewState.url}
        onClose={closeWebView}
        testID={`${testID}-webview`}
      />
    </>
  )
}
