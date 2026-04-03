/**
 * SearchContentCard - Simplified card for subscription content search results
 */

import React from 'react'
import { View, Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { User } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import { OptimizedImage } from '@/components/ui/OptimizedImage'

export interface SearchContentCardProps {
  title: string
  url: string
  contentCategory?: string
  authorHandle?: string
  thumbnailUrl?: string
  aiRelevanceScore?: number
  discoveredAt: number
  testID?: string
  onPress?: () => void
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
}

export const SearchContentCard = React.memo(function SearchContentCard({
  title,
  thumbnailUrl,
  contentCategory,
  authorHandle,
  aiRelevanceScore,
  discoveredAt,
  testID = 'search-content-card',
  onPress,
}: SearchContentCardProps) {
  const { colors: themeColors } = useTheme()
  const relevancePercent =
    aiRelevanceScore !== undefined
      ? `${Math.round(aiRelevanceScore * 100)}%`
      : null

  // Build accessibility label for screen readers
  const accessibilityLabel = `${contentCategory ? `${contentCategory}. ` : ''}${title}${authorHandle ? `. By ${authorHandle}` : ''}${relevancePercent ? `. Relevance: ${relevancePercent}` : ''}. ${formatRelativeTime(discoveredAt)}. Tap to open.`

  return (
    <Card testID={testID} className="border-border bg-card mb-2 overflow-hidden">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Opens content in web view"
        accessibilityState={{ disabled: !onPress }}
        testID={`${testID}-pressable`}
      >
      {/* Thumbnail with 16:9 aspect ratio */}
      {thumbnailUrl && (
        <View
          accessible={true}
          accessibilityRole="image"
          accessibilityLabel={`Thumbnail for ${title}`}
        >
          <OptimizedImage
            source={{ uri: thumbnailUrl }}
            aspectRatio={16 / 9}
            borderRadius={0}
            testID={`${testID}-thumbnail`}
            
          />
        </View>
      )}

      <View className="px-4 pb-3 pt-3 gap-2">
        {/* Title */}
        <View
          testID={`${testID}-title-container`}
          accessible={true}
          accessibilityRole="text"
          accessibilityLabel={`Title: ${title}`}
        >
          <Text
            className="text-foreground text-base font-bold leading-snug"
            numberOfLines={2}
            testID={`${testID}-title`}
          >
            {title}
          </Text>
        </View>

        {/* Bottom row: category + author + time + relevance */}
        <View className="flex-row items-center gap-2 flex-wrap">
          {contentCategory && (
            <Badge
              variant="secondary"
              className="border-border"
              testID={`${testID}-category-badge`}
            >
              <Text className="text-secondary-foreground text-xs">{contentCategory}</Text>
            </Badge>
          )}

          {authorHandle && (
            <View className="flex-row items-center gap-1" testID={`${testID}-author`}>
              <User size={12} color={themeColors.mutedForeground} />
              <Text className="text-muted-foreground text-xs">{authorHandle}</Text>
            </View>
          )}

          <Text
            className="text-muted-foreground text-xs flex-1"
            testID={`${testID}-time`}
          >
            {formatRelativeTime(discoveredAt)}
          </Text>

          {relevancePercent && (
            <Badge
              variant="outline"
              className="border-border"
              testID={`${testID}-relevance-badge`}
            >
              <Text className="text-muted-foreground text-xs">{relevancePercent}</Text>
            </Badge>
          )}
        </View>
      </View>
      </Pressable>
    </Card>
  )
})
