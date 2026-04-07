import { Text } from '@/components/ui/text'
import { Trash2 } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { Pressable, View, type ViewProps } from 'react-native'
import { useCallback } from 'react'
import { useTheme } from '@/hooks/use-theme'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
} from 'react-native-reanimated'

interface ConversationRowProps extends Omit<ViewProps, 'children'> {
  /** Unique conversation ID */
  id: string
  /** Conversation title */
  title: string
  /** Preview of the last message */
  lastMessage?: string
  /** When the last message was sent */
  lastMessageAt?: Date
  /** Whether this is the active conversation */
  isActive?: boolean
  /** Whether the delete button is currently showing for this row */
  isDeleteVisible?: boolean
  /** Callback when row is pressed */
  onPress?: () => void
  /** Callback when long-press triggers delete reveal */
  onLongPress?: () => void
  /** Callback when delete button is tapped */
  onDelete?: () => void
  /** Callback to dismiss any visible delete button */
  onDismissDelete?: () => void
}

/**
 * ConversationRow displays a single conversation in the drawer list.
 * Shows title, last message preview, and timestamp.
 * Active conversation is highlighted.
 *
 * Long-press reveals an inline delete button (pill) overlaid on the right.
 * Only one row can show the delete button at a time (managed by parent).
 */
export function ConversationRow({
  id,
  title,
  lastMessage,
  lastMessageAt,
  isActive = false,
  isDeleteVisible = false,
  onPress,
  onLongPress,
  onDelete,
  onDismissDelete,
  className,
  ...props
}: ConversationRowProps) {
  const { colors: themeColors, typography, spacing } = useTheme()
  const rowScale = useSharedValue(1)
  const deleteOpacity = useSharedValue(isDeleteVisible ? 1 : 0)
  const deleteScale = useSharedValue(isDeleteVisible ? 1 : 0.6)

  const formattedTime = lastMessageAt
    ? formatRelativeTime(lastMessageAt)
    : undefined

  // Animate delete button in/out when visibility changes
  if (isDeleteVisible) {
    deleteOpacity.value = withSpring(1, { damping: 12, stiffness: 180 })
    deleteScale.value = withSpring(1, { damping: 10, stiffness: 200 })
  } else {
    deleteOpacity.value = withTiming(0, { duration: 150 })
    deleteScale.value = withTiming(0.6, { duration: 150 })
  }

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    // Subtle scale pulse
    rowScale.value = withSequence(
      withTiming(0.97, { duration: 100 }),
      withSpring(1, { damping: 15, stiffness: 200 })
    )
    onLongPress?.()
  }, [onLongPress, rowScale])

  const handlePress = useCallback(() => {
    if (isDeleteVisible) {
      // Tapping on a row with delete showing dismisses it
      onDismissDelete?.()
    } else {
      onPress?.()
    }
  }, [isDeleteVisible, onPress, onDismissDelete])

  const handleDelete = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    onDelete?.()
  }, [onDelete])

  const rowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: rowScale.value }],
  }))

  const deleteButtonAnimatedStyle = useAnimatedStyle(() => ({
    opacity: deleteOpacity.value,
    transform: [{ scale: deleteScale.value }],
  }))

  return (
    <View
      className={cn('relative overflow-hidden', className)}
      testID="conversation-row"
      {...props}
    >
      <Pressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={`Conversation: ${title}${lastMessage ? `. Last message: ${lastMessage}` : ''}${formattedTime ? `. ${formattedTime}` : ''}${isActive ? '. Currently selected' : ''}`}
        accessibilityHint="Double tap to open conversation. Long press for delete."
        accessibilityState={{ selected: isActive }}
      >
        <Animated.View
          style={rowAnimatedStyle}
          className={cn(
            'flex-row items-center gap-3 rounded-lg px-3 py-3',
            isActive ? 'bg-accent' : 'bg-background',
          )}
        >
          <View className="flex-1">
            <View className="flex-row items-center justify-between">
              <Text
                className={cn(
                  'text-base flex-1',
                  isActive ? 'font-semibold text-foreground' : 'font-medium text-foreground'
                )}
                numberOfLines={1}
              >
                {title}
              </Text>
              {formattedTime && (
                <Text className="text-muted-foreground text-xs ml-2">{formattedTime}</Text>
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
        </Animated.View>
      </Pressable>

      {/* Delete button overlay - anchored to right side */}
      {isDeleteVisible && (
        <Animated.View
          style={[
            deleteButtonAnimatedStyle,
            {
              position: 'absolute',
              right: 12,
              top: 0,
              bottom: 0,
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 10,
            },
          ]}
        >
          <Pressable
            onPress={handleDelete}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              borderRadius: 20,
              backgroundColor: themeColors.destructive,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 4,
              elevation: 5,
            }}
            testID="conversation-delete-button"
          >
            <Trash2 size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: typography.label.fontWeight, fontSize: typography.caption.fontSize }}>Delete</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
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
