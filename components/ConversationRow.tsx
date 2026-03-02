import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { MessageCircle } from 'lucide-react-native'
import { Pressable, View, type ViewProps } from 'react-native'

interface ConversationRowProps extends Omit<ViewProps, 'children'> {
  /** Conversation title */
  title: string
  /** Preview of the last message */
  lastMessage?: string
  /** When the last message was sent */
  lastMessageAt?: Date
  /** Whether this is the active conversation */
  isActive?: boolean
  /** Callback when row is pressed */
  onPress?: () => void
  /** Callback when row is long-pressed (for management actions) */
  onLongPress?: () => void
}

/**
 * ConversationRow displays a single conversation in the drawer list.
 * Shows title, last message preview, and timestamp.
 * Active conversation is highlighted.
 */
export function ConversationRow({
  title,
  lastMessage,
  lastMessageAt,
  isActive = false,
  onPress,
  onLongPress,
  className,
  ...props
}: ConversationRowProps) {
  const formattedTime = lastMessageAt
    ? formatRelativeTime(lastMessageAt)
    : undefined

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      className={cn(
        'flex-row items-center gap-3 rounded-lg px-3 py-3',
        isActive ? 'bg-accent' : 'active:bg-muted',
        className
      )}
      testID="conversation-row"
      accessibilityRole="button"
      accessibilityLabel={`Conversation: ${title}${lastMessage ? `. Last message: ${lastMessage}` : ''}${formattedTime ? `. ${formattedTime}` : ''}${isActive ? '. Currently selected' : ''}`}
      accessibilityHint="Double tap to open conversation. Long press for options."
      accessibilityState={{ selected: isActive }}
      {...props}
    >
      <View
        className={cn(
          'h-10 w-10 items-center justify-center rounded-full',
          isActive ? 'bg-primary' : 'bg-muted'
        )}
      >
        <MessageCircle
          size={20}
          className={isActive ? 'text-primary-foreground' : 'text-muted-foreground'}
        />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text
            className={cn(
              'text-base',
              isActive ? 'font-semibold text-foreground' : 'font-medium text-foreground'
            )}
            numberOfLines={1}
          >
            {title}
          </Text>
          {formattedTime && (
            <Text className="text-muted-foreground text-xs">{formattedTime}</Text>
          )}
        </View>
        {lastMessage && (
          <Text
            className="text-muted-foreground mt-0.5 text-sm"
            numberOfLines={1}
          >
            {lastMessage}
          </Text>
        )}
      </View>
    </Pressable>
  )
}

/**
 * Format a date as relative time (e.g., "2m", "1h", "Yesterday")
 */
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'Now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}
