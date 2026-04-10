/**
 * NewsCard - Card component with media support for What's New
 *
 * Displays news items with optional images, handles image loading errors gracefully.
 * Integrates with feedback system for user preferences.
 */

import { useState } from 'react'
import { Pressable, View, Image, ImageStyle, StyleSheet } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Newspaper, Calendar } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import { FeedbackButtons, type FeedbackType } from '@/components/subscriptions/FeedbackButtons'

export interface NewsCardProps {
  title: string
  summary?: string
  imageUrl?: string
  source?: string
  publishedAt?: number
  testID?: string
  onPress?: () => void
  // Feedback props - uses 'up'/'down' to match Convex schema
  feedback?: 'up' | 'down' | null
  onFeedback?: (type: 'up' | 'down' | null) => void
}

/**
 * Format timestamp to date string
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function NewsCard({
  title,
  summary,
  imageUrl,
  source,
  publishedAt,
  testID = 'news-card',
  onPress,
  feedback,
  onFeedback,
}: NewsCardProps) {
  const { colors: themeColors } = useTheme()
  const [imageError, setImageError] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)

  // Convert between FeedbackButton types ('positive'/'negative') and mutation types ('up'/'down')
  const handleFeedback = (type: FeedbackType) => {
    if (!onFeedback) return

    // Map 'positive' → 'up', 'negative' → 'down', null → null (remove feedback)
    const mappedType: 'up' | 'down' | null = type === 'positive' ? 'up' : type === 'negative' ? 'down' : null
    onFeedback(mappedType)
  }

  const hasMedia = imageUrl && !imageError

  const cardContent = (
    <Card testID={testID} className="border-border bg-card overflow-hidden">
      {/* Media Section */}
      {hasMedia && (
        <View className="relative h-48 w-full bg-muted">
          <Image
            source={{ uri: imageUrl }}
            style={styles.image as ImageStyle}
            resizeMode="cover"
            onLoad={() => setImageLoading(false)}
            onError={() => {
              setImageError(true)
              setImageLoading(false)
            }}
            testID={`${testID}-image`}
            accessibilityLabel={`Image for ${title}`}
          />
          {imageLoading && (
            <View
              style={[styles.loadingOverlay, { backgroundColor: themeColors.muted }]}
              testID={`${testID}-image-loading`}
            />
          )}
        </View>
      )}

      {/* Fallback when image fails to load */}
      {imageUrl && imageError && (
        <View
          className="h-48 w-full items-center justify-center bg-muted"
          testID={`${testID}-image-error`}
        >
          <Newspaper size={40} color={themeColors.mutedForeground} />
          <Text className="text-muted-foreground mt-2 text-sm">Image unavailable</Text>
        </View>
      )}

      {/* Content Section */}
      <View className="p-4">
        {/* Header */}
        <View className="mb-2 flex-row items-center gap-2">
          {source && (
            <Badge variant="outline" className="border-border">
              <Text className="text-muted-foreground text-xs">{source}</Text>
            </Badge>
          )}
          {publishedAt && (
            <View className="flex-row items-center gap-1">
              <Calendar size={12} color={themeColors.mutedForeground} />
              <Text className="text-muted-foreground text-xs">
                {formatDate(publishedAt)}
              </Text>
            </View>
          )}
        </View>

        {/* Title */}
        <Text className="text-foreground mb-2 text-base font-semibold leading-tight">
          {title}
        </Text>

        {/* Summary */}
        {summary && (
          <Text
            className="text-muted-foreground text-sm leading-relaxed"
            numberOfLines={3}
          >
            {summary}
          </Text>
        )}

        {/* Feedback Buttons */}
        {onFeedback && (
          <View className="mt-3 flex-row items-center justify-end">
            <FeedbackButtons
              findingId={testID || 'news-card'}
              currentFeedback={feedback === 'up' ? 'positive' : feedback === 'down' ? 'negative' : null}
              onFeedback={handleFeedback}
              testID={`${testID}-feedback`}
            />
          </View>
        )}
      </View>
    </Card>
  )

  // Wrap in Pressable if onPress is provided
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        testID={`${testID}-pressable`}
        style={({ pressed }) => ({
          opacity: pressed ? 0.8 : 1,
        })}
      >
        {cardContent}
      </Pressable>
    )
  }

  return cardContent
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
