import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { ChevronRight, FileText, Search, Sparkles } from '@/components/ui/icons'
import { Pressable, View, type ViewProps } from 'react-native'
import { CategoryBadge, type CategoryType } from './CategoryBadge'

export type ResultType = 'search' | 'article' | 'research' | 'stats'

interface ResultCardProps extends Omit<ViewProps, 'children'> {
  /** Card title */
  title: string
  /** Result type determines icon and styling */
  type: ResultType
  /** Category for article/research results */
  category?: CategoryType
  /** Brief description or snippet */
  snippet?: string
  /** Confidence score (0-100) for research results */
  confidence?: number
  /** Number of sources for research results */
  sourceCount?: number
  /** Callback when card is pressed */
  onPress?: () => void
}

const typeIcons: Record<ResultType, React.ReactNode> = {
  search: <Search size={16} className="text-muted-foreground" />,
  article: <FileText size={16} className="text-muted-foreground" />,
  research: <Sparkles size={16} className="text-primary" />,
  stats: <FileText size={16} className="text-muted-foreground" />,
}

/**
 * ResultCard displays search results, articles, or research findings
 * embedded in the chat stream. Supports different content types with
 * appropriate icons and metadata display.
 */
export function ResultCard({
  title,
  type,
  category,
  snippet,
  confidence,
  sourceCount,
  onPress,
  className,
  ...props
}: ResultCardProps) {
  const content = (
    <Card className={cn('py-4', className)} testID="result-card" {...props}>
      <CardHeader className="flex-row items-start justify-between pb-2">
        <View className="flex-1 gap-2">
          <View className="flex-row items-center gap-2">
            {typeIcons[type]}
            {category && <CategoryBadge category={category} size="sm" />}
          </View>
          <Text className="text-foreground text-base font-semibold" numberOfLines={2}>
            {title}
          </Text>
        </View>
        {onPress && (
          <ChevronRight size={20} className="text-muted-foreground" />
        )}
      </CardHeader>

      {snippet && (
        <CardContent className="pt-0 pb-2">
          <Text className="text-muted-foreground text-sm" numberOfLines={2}>
            {snippet}
          </Text>
        </CardContent>
      )}

      {(confidence !== undefined || sourceCount !== undefined) && (
        <CardContent className="flex-row items-center gap-4 pt-0">
          {confidence !== undefined && (
            <View className="flex-row items-center gap-1">
              <Text className="text-muted-foreground text-xs">Confidence:</Text>
              <Text
                className={cn(
                  'text-xs font-semibold',
                  confidence >= 80
                    ? 'text-success'
                    : confidence >= 60
                    ? 'text-warning'
                    : 'text-destructive'
                )}
              >
                {confidence}%
              </Text>
            </View>
          )}
          {sourceCount !== undefined && (
            <View className="flex-row items-center gap-1">
              <Text className="text-muted-foreground text-xs">Sources:</Text>
              <Text className="text-foreground text-xs font-semibold">
                {sourceCount}
              </Text>
            </View>
          )}
        </CardContent>
      )}
    </Card>
  )

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        className="active:opacity-80"
        testID="result-card-pressable"
      >
        {content}
      </Pressable>
    )
  }

  return content
}
