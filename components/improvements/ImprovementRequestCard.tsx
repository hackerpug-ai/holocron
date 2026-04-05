import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { GitMerge, Images, EllipsisVertical } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { Pressable, View } from 'react-native'

export interface ImprovementRequestCardProps {
  id: string
  title: string
  description: string
  status: 'open' | 'closed'
  imageCount: number
  createdAt: number
  mergedCount?: number
  onPress?: () => void
  onMenuPress?: () => void
  testID?: string
}

const STATUS_STYLES: Record<
  ImprovementRequestCardProps['status'],
  { badge: string; text: string; label: string }
> = {
  open: {
    badge: 'bg-blue-500/20',
    text: 'text-blue-400',
    label: 'Open',
  },
  closed: {
    badge: 'bg-green-500/20',
    text: 'text-green-400',
    label: 'Closed',
  },
}

function formatRelativeDate(timestamp: number): string {
  const nowMs = Date.now()
  const diffMs = nowMs - timestamp
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)

  if (diffSeconds < 60) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffWeeks < 5) return `${diffWeeks}w ago`
  return `${diffMonths}mo ago`
}

export function ImprovementRequestCard({
  title,
  description,
  status,
  imageCount,
  createdAt,
  mergedCount,
  onPress,
  onMenuPress,
  testID,
}: ImprovementRequestCardProps) {
  const statusStyle = STATUS_STYLES[status]
  const relativeDate = formatRelativeDate(createdAt)

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="active:opacity-80 w-full"
      testID={testID ?? 'improvement-request-card'}
    >
      <Card className="border border-border bg-card w-full overflow-hidden">
        <CardContent className="py-3 px-4">
          {/* Header row: status badge + relative date + menu button */}
          <View className="flex-row items-center justify-between mb-2">
            <View className={cn('px-2 py-0.5 rounded-full self-start', statusStyle.badge)}>
              <Text className={cn('text-xs font-medium', statusStyle.text)}>
                {statusStyle.label}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Text className="text-muted-foreground text-xs">{relativeDate}</Text>
              {onMenuPress && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation()
                    onMenuPress()
                  }}
                  className="h-7 w-7 items-center justify-center rounded-full active:bg-muted"
                  testID={`${testID ?? 'improvement-request-card'}-menu-button`}
                  accessibilityRole="button"
                  accessibilityLabel="More options"
                >
                  <EllipsisVertical size={18} className="text-muted-foreground" />
                </Pressable>
              )}
            </View>
          </View>

          {/* Title */}
          <Text
            className="text-foreground text-sm font-semibold mb-1"
            numberOfLines={1}
            ellipsizeMode="tail"
            testID="improvement-request-card-title"
          >
            {title}
          </Text>

          {/* Description preview */}
          <Text
            className="text-muted-foreground text-sm mb-2"
            numberOfLines={2}
            ellipsizeMode="tail"
            testID="improvement-request-card-description"
          >
            {description}
          </Text>

          {/* Footer: image count + merge count */}
          <View className="flex-row items-center gap-3">
            <View className="flex-row items-center gap-1">
              <Images size={12} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-xs">{imageCount}</Text>
            </View>
            {mergedCount !== undefined && mergedCount > 0 && (
              <View className="flex-row items-center gap-1">
                <GitMerge size={12} className="text-muted-foreground" />
                <Text className="text-muted-foreground text-xs">{mergedCount}</Text>
              </View>
            )}
          </View>
        </CardContent>
      </Card>
    </Pressable>
  )
}
