import { useState } from 'react'
import { View, Pressable, ScrollView } from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, User } from '@/components/ui/icons'
import { PlatformBadge, type PlatformType } from './PlatformBadge'

export interface CreatorPlatformData {
  handle: string
  verified?: boolean
}

export interface SubscriptionSuggestionData {
  name: string
  handle: string
  bio?: string
  avatarUrl?: string
  platforms: {
    youtube?: CreatorPlatformData
    bluesky?: CreatorPlatformData
    github?: CreatorPlatformData
    website?: CreatorPlatformData | { url: string; verified?: boolean }
  }
  existingSubscriptions?: PlatformType[]
}

export interface SubscriptionSuggestionCardProps {
  data: SubscriptionSuggestionData
  onSubscribe?: (platforms: PlatformType[]) => void
  onPlatformToggle?: (platform: PlatformType) => void
  loading?: boolean
  className?: string
  testID?: string
}

/**
 * SubscriptionSuggestionCard - displays a creator suggestion with platform options
 *
 * Shows creator info, discovered platforms with verification status, and
 * provides "Subscribe All" or "Subscribe Selected" actions.
 *
 * Expands to show individual platform toggles for granular selection.
 */
export function SubscriptionSuggestionCard({
  data,
  onSubscribe,
  onPlatformToggle,
  loading = false,
  className,
}: SubscriptionSuggestionCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<PlatformType>>(
    new Set()
  )

  const { name, handle, bio, avatarUrl, platforms, existingSubscriptions } =
    data

  // Ensure existingSubscriptions is always an array
  const subscribedPlatforms = existingSubscriptions ?? []

  // Get all available platforms
  const availablePlatforms = Object.entries(platforms)
    .filter(([_, data]) => data !== undefined)
    .map(([platform, _]) => platform as PlatformType)

  // Check if all platforms are already subscribed
  const allSubscribed =
    availablePlatforms.length > 0 &&
    availablePlatforms.every((p) => subscribedPlatforms.includes(p))

  // Check if any platforms are available to subscribe to
  const canSubscribe =
    availablePlatforms.length > 0 &&
    availablePlatforms.some((p) => !subscribedPlatforms.includes(p))

  // Handle subscribe all
  const handleSubscribeAll = () => {
    const platformsToSubscribe = availablePlatforms.filter(
      (p) => !subscribedPlatforms.includes(p)
    )
    onSubscribe?.(platformsToSubscribe)
  }

  // Handle subscribe selected
  const handleSubscribeSelected = () => {
    const platformsToSubscribe = Array.from(selectedPlatforms).filter(
      (p) => !subscribedPlatforms.includes(p)
    )
    onSubscribe?.(platformsToSubscribe)
  }

  // Handle platform toggle
  const handlePlatformPress = (platform: PlatformType) => {
    const newSelected = new Set(selectedPlatforms)
    if (newSelected.has(platform)) {
      newSelected.delete(platform)
    } else {
      newSelected.add(platform)
    }
    setSelectedPlatforms(newSelected)
    onPlatformToggle?.(platform)
  }

  // Count available (non-subscribed) platforms
  const availableCount = availablePlatforms.filter(
    (p) => !subscribedPlatforms.includes(p)
  ).length

  return (
    <View
      className={cn(
        'rounded-xl border border-border bg-card p-4',
        className
      )}
      testID="subscription-suggestion-card"
    >
      {/* Header: Creator info + expand/collapse */}
      <Pressable
        onPress={() => setExpanded(!expanded)}
        className="flex-row items-start gap-3"
        disabled={availablePlatforms.length === 0}
      >
        {/* Avatar or fallback */}
        <View className="h-12 w-12 items-center justify-center rounded-full bg-muted">
          {avatarUrl ? (
            <Text className="text-2xl">👤</Text>
          ) : (
            <User size={24} className="text-muted-foreground" />
          )}
        </View>

        {/* Creator info */}
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-base font-semibold text-foreground">
              {name}
            </Text>
            {allSubscribed && (
              <View className="rounded-full bg-emerald-500/10 px-2 py-0.5">
                <Text className="text-xs font-medium text-emerald-500">
                  Subscribed
                </Text>
              </View>
            )}
          </View>
          <Text className="text-sm text-muted-foreground">@{handle}</Text>
          {bio && expanded && (
            <Text className="mt-1 text-sm text-muted-foreground" numberOfLines={2}>
              {bio}
            </Text>
          )}
        </View>

        {/* Expand/collapse icon */}
        {availablePlatforms.length > 0 && (
          <View className="pt-1">
            {expanded ? (
              <ChevronUp size={20} className="text-muted-foreground" />
            ) : (
              <ChevronDown size={20} className="text-muted-foreground" />
            )}
          </View>
        )}
      </Pressable>

      {/* Expanded content: Platform badges + actions */}
      {expanded && availablePlatforms.length > 0 && (
        <View className="mt-4 gap-4">
          {/* Platform badges grid */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
          >
            {availablePlatforms.map((platform) => {
              const platformData = platforms[platform]
              if (!platformData) return null

              const isSubscribed = subscribedPlatforms.includes(platform)
              const isSelected = selectedPlatforms.has(platform)

              // Handle website platform which has 'url' instead of 'handle'
              const handle =
                'url' in platformData
                  ? platformData.url
                  : (platformData as CreatorPlatformData).handle

              return (
                <PlatformBadge
                  key={platform}
                  platform={platform}
                  handle={handle}
                  verified={platformData.verified}
                  selected={isSelected}
                  onPress={
                    isSubscribed ? undefined : () => handlePlatformPress(platform)
                  }
                  className={cn(
                    'pressable-opacity',
                    isSubscribed && 'opacity-50'
                  )}
                />
              )
            })}
          </ScrollView>

          {/* Action buttons */}
          <View className="flex-row gap-2">
            {selectedPlatforms.size > 0 ? (
              <>
                <Button
                  onPress={handleSubscribeSelected}
                  disabled={loading}
                  className="flex-1"
                  testID="subscribe-selected-button"
                >
                  <Text className="font-medium text-primary-foreground">
                    Subscribe Selected ({selectedPlatforms.size})
                  </Text>
                </Button>
                <Button
                  onPress={handleSubscribeAll}
                  variant="outline"
                  disabled={loading}
                  testID="subscribe-all-button"
                >
                  <Text className="font-medium text-foreground">All</Text>
                </Button>
              </>
            ) : (
              <Button
                onPress={handleSubscribeAll}
                disabled={loading || !canSubscribe}
                className="flex-1"
                testID="subscribe-all-button"
              >
                <Text className="font-medium text-primary-foreground">
                  {loading
                    ? 'Subscribing...'
                    : `Subscribe All${availableCount > 1 ? ` (${availableCount})` : ''}`}
                </Text>
              </Button>
            )}
          </View>

          {/* Helper text */}
          <Text className="text-center text-xs text-muted-foreground">
            {selectedPlatforms.size > 0
              ? 'Tap platforms to customize selection'
              : 'Tap to expand and customize selection'}
          </Text>
        </View>
      )}

      {/* No platforms available message */}
      {expanded && availablePlatforms.length === 0 && (
        <View className="mt-4 items-center">
          <Text className="text-center text-sm text-muted-foreground">
            No platforms available for this creator
          </Text>
        </View>
      )}
    </View>
  )
}
