import { View, Pressable, ScrollView } from 'react-native'
import { Text } from '@/components/ui/text'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PlatformBadge } from './PlatformBadge'
import { Switch } from '@/components/ui/switch'
import { Trash2, FileText, Calendar } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CreatorGroup } from './types'
import { useState } from 'react'
import { Alert } from 'react-native'

interface CreatorGroupCardProps {
  group: CreatorGroup
  onPress?: () => void
  onUnsubscribe?: (subscriptionIds: string[]) => void
  onToggleAutoResearch?: (subscriptionId: string, currentValue: boolean) => void
  className?: string
}

/**
 * Source type badge for non-creator subscription types.
 * Displays newsletter, changelog, reddit, ebay, whats-new source types.
 */
function SourceTypeBadge({ sourceType }: { sourceType: string }) {
  const config: Record<string, { label: string; color: string }> = {
    newsletter: { label: 'Newsletter', color: 'text-blue-500' },
    changelog: { label: 'Changelog', color: 'text-purple-500' },
    reddit: { label: 'Reddit', color: 'text-orange-500' },
    ebay: { label: 'eBay', color: 'text-yellow-500' },
    'whats-new': { label: "What's New", color: 'text-green-500' },
    youtube: { label: 'YouTube', color: 'text-red-500' },
    creator: { label: 'Creator', color: 'text-indigo-500' },
  }

  const { label, color } = config[sourceType] || { label: sourceType, color: 'text-muted-foreground' }

  return (
    <View className="flex-row items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
      <Text className={cn('text-xs font-medium', color)}>{label}</Text>
    </View>
  )
}

/**
 * CreatorGroupCard displays a grouped subscription with all platforms for a creator.
 *
 * Shows:
 * - Creator name and avatar (if available)
 * - Horizontal scroll of platform badges
 * - Document count badge
 * - Auto-research toggle (syncs across all subscriptions)
 * - Unsubscribe button (removes entire group)
 */
export function CreatorGroupCard({
  group,
  onPress,
  onUnsubscribe,
  onToggleAutoResearch,
  className,
}: CreatorGroupCardProps) {
  const [autoResearch, setAutoResearch] = useState(
    group.subscriptions.length > 0 ? group.subscriptions[0].autoResearch ?? false : false
  )

  // Format timestamp
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return date.toLocaleDateString()
  }

  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  // Handle auto-research toggle - sync across all subscriptions
  const handleToggleAutoResearch = () => {
    const newValue = !autoResearch
    setAutoResearch(newValue)

    // Update all subscriptions in the group
    group.subscriptions.forEach((sub) => {
      onToggleAutoResearch?.(sub._id.toString(), newValue)
    })
  }

  // Handle unsubscribe with confirmation
  const handleUnsubscribe = () => {
    const count = group.subscriptions.length
    Alert.alert(
      'Unsubscribe?',
      `Remove ${count} subscription${count > 1 ? 's' : ''} for ${group.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unsubscribe',
          style: 'destructive',
          onPress: () =>
            onUnsubscribe?.(group.subscriptions.map((s) => s._id.toString())),
        },
      ]
    )
  }

  // Extract platform information from subscriptions
  const platforms = group.subscriptions.map((sub) => {
    const platform = sub.configJson?.platform as string | undefined
    const sourceType = sub.sourceType

    // If we have a platform from configJson, use it for PlatformBadge
    if (platform && ['youtube', 'bluesky', 'github', 'website'].includes(platform)) {
      return {
        type: 'platform' as const,
        platform: platform as 'youtube' | 'bluesky' | 'github' | 'website',
        handle: sub.identifier,
      }
    }

    // Otherwise use source type badge
    return {
      type: 'sourceType' as const,
      sourceType,
    }
  })

  return (
    <Pressable
      onPress={onPress}
      className={cn('rounded-xl border bg-card p-4', className)}
      testID={`creator-group-card-${group.creatorProfileId || 'standalone'}`}
    >
      <View className="flex-row items-start gap-3">
        {/* Left: Avatar + Info */}
        <View className="flex-1 gap-2">
          {/* Header: Avatar + Name + Actions */}
          <View className="flex-row items-center gap-2">
            {/* Avatar */}
            <Avatar className="h-8 w-8" alt={group.name}>
              {group.avatarUrl ? (
                <AvatarImage source={{ uri: group.avatarUrl }} />
              ) : (
                <AvatarFallback>
                  <Text className="text-xs font-semibold text-foreground">
                    {getInitials(group.name)}
                  </Text>
                </AvatarFallback>
              )}
            </Avatar>

            {/* Name */}
            <Text className="text-base font-semibold text-foreground flex-1" numberOfLines={1}>
              {group.name}
            </Text>

            {/* Platform count badge */}
            <View className="rounded-full bg-muted px-2 py-0.5">
              <Text className="text-xs text-muted-foreground">
                {group.platformCount} platform{group.platformCount !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>

          {/* Platform badges - horizontal scroll if needed */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 py-1"
          >
            {platforms.map((item, index) => {
              if (item.type === 'platform') {
                return (
                  <PlatformBadge
                    key={index}
                    platform={item.platform}
                    handle={item.handle}
                  />
                )
              }
              return <SourceTypeBadge key={index} sourceType={item.sourceType} />
            })}
          </ScrollView>

          {/* Subtitle: Document count + Date */}
          <View className="flex-row items-center gap-3">
            <View className="flex-row items-center gap-1">
              <FileText size={12} className="text-muted-foreground" />
              <Text className="text-xs text-muted-foreground">
                {group.documentCount} document{group.documentCount !== 1 ? 's' : ''}
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Calendar size={12} className="text-muted-foreground" />
              <Text className="text-xs text-muted-foreground">
                Added {formatDate(group.lastActivityAt)}
              </Text>
            </View>
          </View>
        </View>

        {/* Right: Actions */}
        <View className="flex-col items-end gap-2">
          {/* Auto-research toggle */}
          <Switch
            checked={autoResearch}
            onCheckedChange={handleToggleAutoResearch}
            testID={`toggle-auto-research-${group.creatorProfileId || 'standalone'}`}
          />

          {/* Unsubscribe button */}
          <Button
            onPress={handleUnsubscribe}
            variant="ghost"
            size="sm"
            className="px-2 py-1"
            testID={`unsubscribe-${group.creatorProfileId || 'standalone'}`}
          >
            <Trash2 size={16} className="text-destructive" />
          </Button>
        </View>
      </View>
    </Pressable>
  )
}
