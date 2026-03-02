import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import type { MessageRole } from '@/lib/types/conversations'
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns'

export interface MessageBubbleProps {
  role: MessageRole
  content: string
  createdAt?: Date
  showTimestamp?: boolean
  testID?: string
}

/**
 * Format timestamp for display
 * - "just now" for < 1 minute
 * - "X min ago" for < 1 hour
 * - "h:mm a" for today
 * - "Yesterday, h:mm a" for yesterday
 * - "MMM d, h:mm a" for older
 */
function formatTimestamp(date: Date): string {
  const now = new Date()
  const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000)

  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`
  if (isToday(date)) return format(date, 'h:mm a')
  if (isYesterday(date)) return `Yesterday, ${format(date, 'h:mm a')}`
  return format(date, 'MMM d, h:mm a')
}

export function MessageBubble({
  role,
  content,
  createdAt,
  showTimestamp = true,
  testID = 'message-bubble',
}: MessageBubbleProps) {
  const isUser = role === 'user'
  const isSystem = role === 'system'

  return (
    <View
      className={cn(
        'my-1 px-4',
        isUser && 'items-end',
        isSystem && 'items-center',
        !isUser && !isSystem && 'items-start'
      )}
      testID={testID}
    >
      <View
        className={cn(
          'rounded-lg p-3',
          isUser && 'bg-primary max-w-[75%]',
          isSystem && 'bg-muted max-w-[80%]',
          !isUser && !isSystem && 'bg-card max-w-[75%]'
        )}
      >
        <Text
          variant={isSystem ? 'small' : 'default'}
          className={cn(
            isUser && 'text-primary-foreground',
            isSystem && 'text-muted-foreground',
            !isUser && !isSystem && 'text-foreground'
          )}
        >
          {content}
        </Text>
      </View>
      {showTimestamp && createdAt && (
        <Text
          variant="small"
          className={cn(
            'text-muted-foreground mt-0.5 text-xs',
            isUser && 'self-end',
            isSystem && 'self-center',
            !isUser && !isSystem && 'self-start'
          )}
          testID={`${testID}-timestamp`}
        >
          {formatTimestamp(createdAt)}
        </Text>
      )}
    </View>
  )
}
