import { cn } from '@/lib/utils'
import { Trash2 } from '@/components/ui/icons'
import * as Haptics from 'expo-haptics'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated'
import { StyleSheet, View, type ViewProps } from 'react-native'
import { Text } from '@/components/ui/text'
import { useCallback } from 'react'
import { useTheme } from '@/hooks/use-theme'

// Convert hex color to "r, g, b" string for use in rgba() inside animated worklets
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r}, ${g}, ${b}`
}

// Physics constants per plan
const SWIPE_THRESHOLD_PERCENT = 0.35 // 35% to commit
const MAX_DRAG_PERCENT = 0.85 // 85% max drag
const SNAP_SPRING_CONFIG = { damping: 15, stiffness: 150 }
const COLLAPSE_DURATION = 250

interface SwipeableRowProps extends Omit<ViewProps, 'children'> {
  /** Content to render inside the swipeable row */
  children: React.ReactNode
  /** Callback when delete is triggered (swipe past threshold) */
  onDelete: () => void
  /** Threshold to trigger delete (0-1, default 0.35) */
  deleteThreshold?: number
  /** Whether swipe is disabled */
  disabled?: boolean
  /** Screen width for calculating thresholds (required) */
  screenWidth: number
}

/**
 * SwipeableRow provides a swipe-to-delete gesture pattern.
 *
 * UX Flow:
 * 1. Swipe left reveals delete zone with trash icon
 * 2. Continue swiping past threshold (35%) triggers delete
 * 3. Release before threshold snaps back
 * 4. Delete triggers collapse animation
 *
 * Visual feedback:
 * - Red zone emerges from right edge
 * - Icon scales up as threshold approaches
 * - Color intensifies with progress
 */
export function SwipeableRow({
  children,
  onDelete,
  deleteThreshold = SWIPE_THRESHOLD_PERCENT,
  disabled = false,
  screenWidth,
  className,
  ...props
}: SwipeableRowProps) {
  const { colors: themeColors } = useTheme()
  const destructiveRgb = hexToRgb(themeColors.destructive)

  // Animation values
  const translateX = useSharedValue(0)
  const height = useSharedValue(-1) // -1 means "use auto"
  const isDeleting = useSharedValue(false)

  // Computed values based on screen width
  const swipeThreshold = screenWidth * deleteThreshold
  const maxDrag = screenWidth * MAX_DRAG_PERCENT

  // Haptic feedback wrappers
  const triggerLightHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [])

  const triggerMediumHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }, [])

  const triggerSuccessHaptic = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  }, [])

  // Handle delete action
  const handleDelete = useCallback(() => {
    onDelete()
  }, [onDelete])

  // Animated styles for the row content
  const rowAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      Math.abs(translateX.value),
      [0, 50],
      [1.0, 1.02],
      Extrapolation.CLAMP
    )

    return {
      transform: [
        { translateX: translateX.value },
        { scale },
      ],
      height: height.value >= 0 ? height.value : undefined,
      opacity: height.value >= 0 && height.value < 10 ? withTiming(0, { duration: 100 }) : 1,
    }
  })

  // Animated styles for the delete zone background
  const deleteZoneAnimatedStyle = useAnimatedStyle(() => {
    const progress = Math.abs(translateX.value) / maxDrag
    const opacity = interpolate(
      progress,
      [0, 0.1, 0.5, 1],
      [0, 0.3, 0.6, 1],
      Extrapolation.CLAMP
    )

    return {
      opacity,
      backgroundColor: `rgba(${destructiveRgb}, ${opacity})`,
    }
  })

  // Animated styles for the trash icon
  const iconAnimatedStyle = useAnimatedStyle(() => {
    const progress = Math.abs(translateX.value) / maxDrag
    const scale = interpolate(
      progress,
      [0, 0.5, 0.8, 1],
      [0.8, 1.0, 1.2, 1.1],
      Extrapolation.CLAMP
    )

    return {
      transform: [{ scale }],
    }
  })

  // Pan gesture handler
  const panGesture = Gesture.Pan()
    .activeOffsetX(-10) // Require 10px horizontal movement to activate
    .failOffsetY(10) // Fail if vertical movement detected first
    .enabled(!disabled)
    .onChange((event) => {
      // Only allow leftward swipes
      if (event.translationX < 0 && !isDeleting.value) {
        translateX.value = Math.max(event.translationX, -maxDrag)
      }
    })
    .onFinalize((event) => {
      if (isDeleting.value) return

      const shouldDelete = event.translationX < -swipeThreshold

      if (shouldDelete) {
        // Mark as deleting to prevent further gestures
        isDeleting.value = true

        // Trigger haptics
        runOnJS(triggerSuccessHaptic)()

        // Animate collapse and trigger callback
        height.value = withTiming(0, { duration: COLLAPSE_DURATION })
        translateX.value = withTiming(-screenWidth, { duration: COLLAPSE_DURATION })

        // Call onDelete after animation starts
        runOnJS(handleDelete)()
      } else {
        // Spring back to original position
        translateX.value = withSpring(0, SNAP_SPRING_CONFIG)
      }
    })

  // Track when we cross threshold for haptic feedback
  const lastThresholdCrossed = useSharedValue(false)

  // Update threshold crossing detection in onChange
  const panGestureWithHaptics = Gesture.Pan()
    .activeOffsetX(-10)
    .failOffsetY(10)
    .enabled(!disabled)
    .onChange((event) => {
      if (event.translationX < 0 && !isDeleting.value) {
        translateX.value = Math.max(event.translationX, -maxDrag)

        // Check threshold crossing for haptic
        const crossedThreshold = event.translationX < -swipeThreshold
        if (crossedThreshold && !lastThresholdCrossed.value) {
          runOnJS(triggerMediumHaptic)()
          lastThresholdCrossed.value = true
        } else if (!crossedThreshold && lastThresholdCrossed.value) {
          lastThresholdCrossed.value = false
        }
      }
    })
    .onFinalize((event) => {
      lastThresholdCrossed.value = false

      if (isDeleting.value) return

      const shouldDelete = event.translationX < -swipeThreshold

      if (shouldDelete) {
        isDeleting.value = true
        runOnJS(triggerSuccessHaptic)()
        height.value = withTiming(0, { duration: COLLAPSE_DURATION })
        translateX.value = withTiming(-screenWidth, { duration: COLLAPSE_DURATION })
        runOnJS(handleDelete)()
      } else {
        translateX.value = withSpring(0, SNAP_SPRING_CONFIG)
      }
    })

  return (
    <View
      className={cn('relative overflow-hidden', className)}
      style={styles.container}
      {...props}
    >
      {/* Delete zone background */}
      <Animated.View style={[styles.deleteZone, deleteZoneAnimatedStyle]}>
        <Animated.View style={iconAnimatedStyle}>
          <Trash2 size={24} className="text-white" />
        </Animated.View>
        <Text className="ml-2 font-semibold text-white">DELETE</Text>
      </Animated.View>

      {/* Swipeable content */}
      <GestureDetector gesture={panGestureWithHaptics}>
        <Animated.View style={[styles.content, rowAnimatedStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  deleteZone: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingRight: 24,
  },
  content: {
    backgroundColor: 'transparent',
  },
})
