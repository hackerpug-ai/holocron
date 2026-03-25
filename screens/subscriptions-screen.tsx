import { useState } from 'react'
import { View, ScrollView, FlatList, type ViewProps } from 'react-native'
import { Text } from '@/components/ui/text'
import { SearchInput } from '@/components/SearchInput'
import { FilterChip } from '@/components/FilterChip'
import { EmptyState } from '@/components/EmptyState'
import { SubscriptionCard, type SubscriptionSource } from '@/components/subscriptions/SubscriptionCard'
import { SectionHeader } from '@/components/SectionHeader'
import { cn } from '@/lib/utils'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Loader2, Bell as BellIcon } from '@/components/ui/icons'

type PlatformType = 'youtube' | 'newsletter' | 'changelog' | 'reddit' | 'ebay' | 'whats-new' | 'creator' | 'all'

const PLATFORM_LABELS: Record<PlatformType, string> = {
  all: 'All',
  youtube: 'YouTube',
  newsletter: 'Newsletter',
  changelog: 'Changelog',
  reddit: 'Reddit',
  ebay: 'eBay',
  'whats-new': "What's New",
  creator: 'Creator',
}

interface SubscriptionsScreenProps extends Omit<ViewProps, 'children'> {
  /** Callback when a subscription is pressed */
  onSubscriptionPress?: (subscription: SubscriptionSource) => void
  /** Callback when unsubscribe is triggered */
  onUnsubscribe?: (id: string) => void
}

/**
 * SubscriptionsScreen - manage all subscription sources
 *
 * Displays a searchable, filterable list of all subscriptions with
 * quick actions for toggling auto-research and unsubscribing.
 * Organized by platform type with horizontal filter chips.
 */
export function SubscriptionsScreen({
  onSubscriptionPress,
  onUnsubscribe,
  className,
  ...props
}: SubscriptionsScreenProps) {
  const [searchValue, setSearchValue] = useState('')
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('all')

  // Fetch subscriptions with optional filtering
  const subscriptionsListArgs =
    selectedPlatform !== 'all' ? { sourceType: selectedPlatform } : 'skip'
  const subscriptions = useQuery(api.subscriptions.queries.list, subscriptionsListArgs)

  // Mutation for toggling auto-research
  const toggleAutoResearch = useMutation(api.subscriptions.mutations.update)

  // Filter by search query
  const filteredSubscriptions = subscriptions?.filter((sub: SubscriptionSource) => {
    if (!searchValue) return true
    const query = searchValue.toLowerCase()
    return (
      sub.name?.toLowerCase().includes(query) ||
      sub.identifier.toLowerCase().includes(query)
    )
  })

  // Get platform counts for chips
  const platformCounts = subscriptions?.reduce(
    (acc: Record<string, number>, sub: SubscriptionSource) => {
      acc[sub.sourceType] = (acc[sub.sourceType] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  // Get available platforms with counts
  const availablePlatforms: PlatformType[] = [
    'all',
    ...(Object.keys(platformCounts || {}) as PlatformType[]),
  ]

  const handleSearchChange = (query: string) => {
    setSearchValue(query)
  }

  const handleClear = () => {
    setSearchValue('')
  }

  const handlePlatformChange = (platform: string) => {
    setSelectedPlatform(platform as PlatformType)
  }

  const handleToggleAutoResearch = async (id: string) => {
    const subscription = subscriptions?.find((s: SubscriptionSource) => s._id === id)
    if (subscription) {
      await toggleAutoResearch({
        id: id as Id<'subscriptionSources'>,
        autoResearch: !subscription.autoResearch,
      })
    }
  }

  const renderEmptyState = () => {
    if (subscriptions === undefined) {
      return (
        <View className="flex-1 items-center justify-center p-8">
          <Loader2 size={32} className="text-muted-foreground animate-spin" />
          <Text className="mt-4 text-center text-muted-foreground">
            Loading subscriptions...
          </Text>
        </View>
      )
    }

    if (selectedPlatform !== 'all') {
      return (
        <EmptyState
          icon={BellIcon}
          title={`No ${PLATFORM_LABELS[selectedPlatform]} subscriptions`}
          description={`You don't have any ${PLATFORM_LABELS[selectedPlatform].toLowerCase()} subscriptions yet.`}
        />
      )
    }

    return (
      <EmptyState
        icon={BellIcon}
        title="No subscriptions"
        description="Subscribe to creators, newsletters, or other content sources to see them here."
      />
    )
  }

  return (
    <View className={cn('flex-1 bg-background', className)} {...props}>
      {/* Header */}
      <SectionHeader
        title="Subscriptions"
        className="border-b border-border px-4 pb-4"
      />

      {/* Search */}
      <View className="px-4 pt-4">
        <SearchInput
          value={searchValue}
          onChangeText={handleSearchChange}
          onClear={handleClear}
          placeholder="Search subscriptions..."
          testID="subscriptions-search"
        />
      </View>

      {/* Platform filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-4 py-4 gap-2"
      >
        {availablePlatforms.map((platform) => {
          const count =
            platform === 'all'
              ? subscriptions?.length || 0
              : (platformCounts?.[platform] || 0)

          return (
            <FilterChip
              key={platform}
              label={`${PLATFORM_LABELS[platform]}${count > 0 ? ` (${count})` : ''}`}
              selected={selectedPlatform === platform}
              onPress={() => handlePlatformChange(platform)}
              testID={`platform-filter-${platform}`}
            />
          )
        })}
      </ScrollView>

      {/* Subscription list or empty state */}
      {filteredSubscriptions && filteredSubscriptions.length > 0 ? (
        <FlatList
          data={filteredSubscriptions}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <SubscriptionCard
              subscription={item}
              onToggleAutoResearch={handleToggleAutoResearch}
              onUnsubscribe={onUnsubscribe}
              onPress={() => onSubscriptionPress?.(item)}
              className="mx-4 mb-3"
            />
          )}
          contentContainerClassName="pb-4"
          testID="subscriptions-list"
        />
      ) : (
        renderEmptyState()
      )}
    </View>
  )
}
