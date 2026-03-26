/**
 * SubscriptionFeedScreen - Display aggregated feed of subscription content
 *
 * Shows feed items with filtering by content type (video, blog, social).
 * Includes settings modal for configuring feed preferences.
 */
import { useState } from 'react'
import { View, ScrollView, StyleSheet, ActivityIndicator, type ViewStyle } from 'react-native'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { SectionHeader } from '@/components/SectionHeader'
import { Settings } from '@/components/ui/icons'
import { SubscriptionFeedFilters } from '@/components/subscriptions/SubscriptionFeedFilters'
import { SubscriptionSettingsModal } from '@/components/subscriptions/SubscriptionSettingsModal'
import { EmptyState } from '@/components/EmptyState'
import { Text } from '@/components/ui/text'
import { Pressable } from 'react-native'
import type { FilterType } from '@/components/subscriptions/SubscriptionFeedFilters'
import { useRouter } from 'expo-router'
import { Inbox } from '@/components/ui/icons'

export function SubscriptionFeedScreen() {
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('all')
  const [settingsVisible, setSettingsVisible] = useState(false)
  const router = useRouter()

  // Fetch feed data with optional content type filter
  const feedItems = useQuery(api.feeds.queries.getFeed, {
    contentType: selectedFilter === 'all' ? undefined : selectedFilter,
    limit: 50,
  })

  // Fetch counts for filter chips
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

  const isLoading = feedItems === undefined || digest === undefined

  const handleSettingsPress = () => {
    setSettingsVisible(true)
  }

  const handleManageSubscriptions = () => {
    setSettingsVisible(false)
    router.push('/subscriptions')
  }

  const renderEmptyState = () => {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" testID="loading-spinner" />
          <Text className="text-muted-foreground mt-4 text-sm">Loading feed...</Text>
        </View>
      )
    }

    return (
      <EmptyState
        icon={Inbox}
        title="No feed items"
        description="Subscribe to creators to see their latest content here."
        size="lg"
      />
    )
  }

  return (
    <View style={styles.container} testID="subscription-feed-screen">
      {/* Header with settings button */}
      <View style={styles.header}>
        <SectionHeader
          title="Subscription Feed"
          size="lg"
          className="flex-1"
        />
        <Pressable
          onPress={handleSettingsPress}
          className="active:opacity-70 p-2"
          testID="settings-button"
        >
          <Settings size={24} className="text-foreground" />
        </Pressable>
      </View>

      {/* Filters */}
      <SubscriptionFeedFilters
        selectedFilter={selectedFilter}
        onFilterChange={setSelectedFilter}
        counts={counts}
        testID="feed-filters"
      />

      {/* Feed content */}
      <ScrollView style={styles.content} testID="feed-content">
        {feedItems && feedItems.length > 0 ? (
          <View style={styles.feedList}>
            {feedItems.map((item: any) => (
              <View key={item._id} style={styles.feedItem} testID={`feed-item-${item._id}`}>
                <Text variant="h4" style={styles.itemTitle}>
                  {item.title}
                </Text>
                <Text variant="small" style={styles.itemMeta}>
                  {item.contentType} • {new Date(item.discoveredAt).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          renderEmptyState()
        )}
      </ScrollView>

      {/* Settings modal */}
      <SubscriptionSettingsModal
        visible={settingsVisible}
        onDismiss={() => setSettingsVisible(false)}
        onManageSubscriptions={handleManageSubscriptions}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  content: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  feedList: {
    padding: 16,
  },
  feedItem: {
    padding: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 12,
    opacity: 0.7,
  },
})
