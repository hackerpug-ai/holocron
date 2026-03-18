import { Text } from '@/components/ui/text'
import { SwipeableRow } from '@/components/ui/SwipeableRow'
import { cn } from '@/lib/utils'
import { Pressable, View, type ViewProps, useWindowDimensions } from 'react-native'

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
  /** Callback when delete is triggered (swipe past threshold) */
  onDelete?: () => void
}

/**
 * ConversationRow displays a single conversation in the drawer list.
 * Shows title, last message preview, and timestamp.
 * Active conversation is highlighted.
 *
 * Swipe-to-delete:
 * - Swipe left to reveal delete zone
 * - Continue swiping past 35% threshold triggers delete
 * - Release before threshold snaps back
 */
export function ConversationRow({
  title,
  lastMessage,
  lastMessageAt,
  isActive = false,
  onPress,
  onLongPress,
  onDelete,
  className,
  ...props
}: ConversationRowProps) {
  const { width: screenWidth } = useWindowDimensions()
  const formattedTime = lastMessageAt
    ? formatRelativeTime(lastMessageAt)
    : undefined

  const content = (
    <View
      className={cn(
        'flex-row items-center gap-3 rounded-lg px-3 py-3',
        isActive ? 'bg-accent' : 'bg-background',
        className
      )}
      testID="conversation-row"
      {...props}
    >
      {/* Main content area - tappable to open conversation */}
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        className={cn(
          'flex-1',
          !isActive && 'active:bg-muted'
        )}
        accessibilityRole="button"
        accessibilityLabel={`Conversation: ${title}${lastMessage ? `. Last message: ${lastMessage}` : ''}${formattedTime ? `. ${formattedTime}` : ''}${isActive ? '. Currently selected' : ''}`}
        accessibilityHint="Double tap to open conversation. Long press for options. Swipe left to delete."
        accessibilityState={{ selected: isActive }}
      >
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
    </View>
  )

  // If no onDelete callback, just return the content without swipe wrapper
  if (!onDelete) {
    return content
  }

  return (
    <SwipeableRow
      onDelete={onDelete}
      screenWidth={screenWidth}
      testID="conversation-row-swipeable"
    >
      {content}
    </SwipeableRow>
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
