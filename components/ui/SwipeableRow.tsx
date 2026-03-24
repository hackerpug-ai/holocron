import { cn } from '@/lib/utils'
import { Trash2 } from '@/components/ui/icons'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  runOnJS,
} from 'react-native-reanimated'
import { StyleSheet, View, Pressable, type ViewProps } from 'react-native'
import { Text } from '@/components/ui/text'
import { useCallback, useState, useRef, useEffect } from 'react'
import { useTheme } from '@/hooks/use-theme'

const COLLAPSE_DURATION = 250
const DISMISS_DELAY = 4000 // auto-dismiss delete button after 4s

interface SwipeableRowProps extends Omit<ViewProps, 'children'> {
  /** Content to render inside the row */
  children: React.ReactNode
  /** Callback when delete is triggered */
  onDelete: () => void
  /** @deprecated No longer used - kept for API compat */
  deleteThreshold?: number
  /** Whether long-press is disabled */
  disabled?: boolean
  /** Screen width for animations */
  screenWidth: number
}

/**
 * SwipeableRow provides a long-press-to-delete pattern.
 *
 * UX Flow:
 * 1. Long press on message triggers haptic + reveals delete button
 * 2. Tap delete button to confirm deletion
 * 3. Tap anywhere else or wait 4s to dismiss
 * 4. Delete triggers collapse animation
 */
export function SwipeableRow({
  children,
  onDelete,
  disabled = false,
  screenWidth,
  className,
  ...props
}: SwipeableRowProps) {
  const { colors: themeColors } = useTheme()
  const [showDelete, setShowDelete] = useState(false)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Animation values
  const height = useSharedValue(-1)
  const deleteOpacity = useSharedValue(0)
  const deleteScale = useSharedValue(0.6)
  const rowScale = useSharedValue(1)
  const isDeleting = useSharedValue(false)

  const clearDismissTimer = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current)
      dismissTimer.current = null
    }
  }, [])

  // Auto-dismiss after delay
  useEffect(() => {
    if (showDelete) {
      clearDismissTimer()
      dismissTimer.current = setTimeout(() => {
        handleDismiss()
      }, DISMISS_DELAY)
    }
    return clearDismissTimer
  }, [showDelete, clearDismissTimer])

  const handleLongPress = useCallback(() => {
    if (disabled || isDeleting.value) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    // Subtle scale pulse on the row
    rowScale.value = withSequence(
      withTiming(0.97, { duration: 100 }),
      withSpring(1, { damping: 15, stiffness: 200 })
    )
    // Reveal delete button
    deleteOpacity.value = withSpring(1, { damping: 12, stiffness: 180 })
    deleteScale.value = withSpring(1, { damping: 10, stiffness: 200 })
    setShowDelete(true)
  }, [disabled, isDeleting, rowScale, deleteOpacity, deleteScale])

  const handleDismiss = useCallback(() => {
    if (isDeleting.value) return
    clearDismissTimer()
    deleteOpacity.value = withTiming(0, { duration: 150 })
    deleteScale.value = withTiming(0.6, { duration: 150 })
    // Delay state change so animation plays
    setTimeout(() => setShowDelete(false), 160)
  }, [isDeleting, clearDismissTimer, deleteOpacity, deleteScale])

  const handleDelete = useCallback(() => {
    if (isDeleting.value) return
    isDeleting.value = true
    clearDismissTimer()
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    // Collapse animation
    height.value = withTiming(0, { duration: COLLAPSE_DURATION })
    onDelete()
  }, [isDeleting, clearDismissTimer, height, onDelete])

  const rowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: rowScale.value }],
    height: height.value >= 0 ? height.value : undefined,
    opacity: height.value >= 0 && height.value < 10 ? withTiming(0, { duration: 100 }) : 1,
  }))

  const deleteButtonAnimatedStyle = useAnimatedStyle(() => ({
    opacity: deleteOpacity.value,
    transform: [{ scale: deleteScale.value }],
  }))

  return (
    <View
      className={cn('relative overflow-hidden', className)}
      style={styles.container}
      {...props}
    >
      {/* Row content with long-press */}
      <Pressable
        onLongPress={handleLongPress}
        delayLongPress={400}
        disabled={disabled}
        onPress={showDelete ? handleDismiss : undefined}
      >
        <Animated.View style={[styles.content, rowAnimatedStyle]}>
          {children}
        </Animated.View>
      </Pressable>

      {/* Delete button overlay - anchored to right side */}
      {showDelete && (
        <Animated.View style={[styles.deleteOverlay, deleteButtonAnimatedStyle]}>
          <Pressable
            onPress={handleDelete}
            style={[styles.deleteButton, { backgroundColor: themeColors.destructive }]}
            testID="message-delete-button"
          >
            <Trash2 size={18} color="#fff" />
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  content: {
    backgroundColor: 'transparent',
  },
  deleteOverlay: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  deleteText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
})
