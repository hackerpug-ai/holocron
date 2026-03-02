import { CategoryBadge, type CategoryType } from '@/components/CategoryBadge'
import { SectionHeader } from '@/components/SectionHeader'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { Calendar, Clock, ExternalLink, Share2 } from 'lucide-react-native'
import { Pressable, ScrollView, View, type ViewProps } from 'react-native'

interface ArticleMetadata {
  source?: string
  sourceUrl?: string
  wordCount?: number
  readingTime?: number
  lastUpdated?: string
}

interface ArticleScreenProps extends Omit<ViewProps, 'children'> {
  /** Article title */
  title: string
  /** Article category */
  category: CategoryType
  /** Publication date (ISO string or Date) */
  date: string | Date
  /** Full article content (markdown or plain text) */
  content: string
  /** Research iteration count (for deep research) */
  iterationCount?: number
  /** Additional metadata */
  metadata?: ArticleMetadata
  /** Related topics/tags */
  tags?: string[]
  /** Callback when share button is pressed */
  onSharePress?: () => void
  /** Callback when source link is pressed */
  onSourcePress?: () => void
  /** Callback when a tag is pressed */
  onTagPress?: (tag: string) => void
}

/**
 * ArticleScreen displays a full article with metadata and content.
 * Composes CategoryBadge and SectionHeader atoms.
 */
export function ArticleScreen({
  title,
  category,
  date,
  content,
  iterationCount,
  metadata,
  tags = [],
  onSharePress,
  onSourcePress,
  onTagPress,
  className,
  ...props
}: ArticleScreenProps) {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const formattedTime = dateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <ScrollView
      className={cn('flex-1 bg-background', className)}
      contentContainerClassName="pb-8"
      testID="article-screen"
      {...props}
    >
      {/* Header */}
      <View className="border-b border-border px-4 pb-4 pt-4">
        <View className="mb-3 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <CategoryBadge category={category} />
            {iterationCount && iterationCount > 1 && (
              <Text className="text-muted-foreground text-xs">
                {iterationCount} iterations
              </Text>
            )}
          </View>
          {onSharePress && (
            <Pressable
              onPress={onSharePress}
              className="rounded-full p-2 active:bg-muted"
              testID="article-share-button"
            >
              <Share2 size={20} className="text-muted-foreground" />
            </Pressable>
          )}
        </View>

        <Text className="text-foreground mb-3 text-2xl font-bold">{title}</Text>

        <View className="flex-row flex-wrap items-center gap-4">
          <View className="flex-row items-center gap-1">
            <Calendar size={14} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-sm">{formattedDate}</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Clock size={14} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-sm">{formattedTime}</Text>
          </View>
          {metadata?.readingTime && (
            <Text className="text-muted-foreground text-sm">
              {metadata.readingTime} min read
            </Text>
          )}
        </View>
      </View>

      {/* Source */}
      {metadata?.source && (
        <View className="border-b border-border px-4 py-3">
          <Pressable
            onPress={onSourcePress}
            disabled={!metadata.sourceUrl}
            className="flex-row items-center gap-2"
            testID="article-source-link"
          >
            <ExternalLink size={14} className="text-primary" />
            <Text className={cn('text-sm', metadata.sourceUrl ? 'text-primary' : 'text-muted-foreground')}>
              {metadata.source}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Content */}
      <View className="px-4 pt-4">
        <Text className="text-foreground text-base leading-7">{content}</Text>
      </View>

      {/* Tags */}
      {tags.length > 0 && (
        <View className="px-4 pt-6">
          <SectionHeader title="Related Topics" size="sm" className="mb-3" />
          <View className="flex-row flex-wrap gap-2">
            {tags.map((tag) => (
              <Pressable
                key={tag}
                onPress={() => onTagPress?.(tag)}
                className="rounded-full bg-muted px-3 py-1.5 active:opacity-70"
                testID={`article-tag-${tag}`}
              >
                <Text className="text-foreground text-sm">{tag}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Metadata Footer */}
      {(metadata?.wordCount || metadata?.lastUpdated) && (
        <View className="mt-6 border-t border-border px-4 pt-4">
          <View className="flex-row flex-wrap gap-4">
            {metadata?.wordCount && (
              <Text className="text-muted-foreground text-xs">
                {metadata.wordCount.toLocaleString()} words
              </Text>
            )}
            {metadata?.lastUpdated && (
              <Text className="text-muted-foreground text-xs">
                Last updated: {new Date(metadata.lastUpdated).toLocaleDateString()}
              </Text>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  )
}
