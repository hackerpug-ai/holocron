import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { Calendar, Clock } from 'lucide-react-native'
import { Pressable, View, type ViewProps } from 'react-native'
import { CategoryBadge, type CategoryType } from './CategoryBadge'

interface ArticleCardProps extends Omit<ViewProps, 'children'> {
  /** Article title */
  title: string
  /** Article category */
  category: CategoryType
  /** Publication date (ISO string or Date) */
  date: string | Date
  /** Optional content snippet */
  snippet?: string
  /** Optional research iteration count (for deep research) */
  iterationCount?: number
  /** Callback when card is pressed */
  onPress?: () => void
  /** Whether the card is in a compact mode */
  compact?: boolean
}

/**
 * ArticleCard displays a summary of a research article.
 * Shows title, category, date, and an optional snippet.
 */
export function ArticleCard({
  title,
  category,
  date,
  snippet,
  iterationCount,
  onPress,
  compact = false,
  className,
  ...props
}: ArticleCardProps) {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const formattedTime = dateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  const content = (
    <Card className={cn(compact && 'py-4', className)} testID="article-card" {...props}>
      <CardHeader className={cn(compact && 'pb-2')}>
        <View className="mb-2 flex-row items-center gap-2">
          <CategoryBadge category={category} size="sm" />
          {iterationCount && iterationCount > 1 && (
            <Text className="text-muted-foreground text-xs">{iterationCount} iterations</Text>
          )}
        </View>
        <Text className={cn('text-foreground font-semibold', compact ? 'text-base' : 'text-lg')}>
          {title}
        </Text>
      </CardHeader>
      {!compact && snippet && (
        <CardContent className="pt-0">
          <Text className="text-muted-foreground text-sm" numberOfLines={2}>
            {snippet}
          </Text>
        </CardContent>
      )}
      <CardContent className={cn('pt-2', compact && 'pt-0')}>
        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1">
            <Calendar size={12} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-xs">{formattedDate}</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Clock size={12} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-xs">{formattedTime}</Text>
          </View>
        </View>
      </CardContent>
    </Card>
  )

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="active:opacity-80" testID="article-card-pressable">
        {content}
      </Pressable>
    )
  }

  return content
}
