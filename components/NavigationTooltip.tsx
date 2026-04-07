import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useTheme } from '@/hooks/use-theme'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import Animated, {
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated'

/**
 * Navigation change tooltip
 *
 * One-time tooltip explaining the navigation changes.
 * Shows on first visit to What's New screen, then never again.
 *
 * Features:
 * - Points to drawer menu (left side)
 * - "Got it" button dismisses permanently
 * - Tap outside to dismiss
 * - Server-side dismissal tracking
 */
interface NavigationTooltipProps {
  visible: boolean
  onDismiss: () => void
  testID?: string
}

export function NavigationTooltip({
  visible,
  onDismiss,
  testID = 'navigation-tooltip',
}: NavigationTooltipProps) {
  const { colors: themeColors, spacing, radius, typography } = useTheme()
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const tooltipRef = useRef<View>(null)
  const [isAnimating, setIsAnimating] = useState(false)

  // Position tooltip to point to drawer (left side of screen)
  useEffect(() => {
    if (visible && !isAnimating) {
      setIsAnimating(true)
      // Position on left side, pointing to drawer
      setPosition({
        x: spacing.lg,
        y: 120, // Below header area
      })
    }
  }, [visible, isAnimating, spacing])

  const handleDismiss = () => {
    setIsAnimating(false)
    // Small delay for exit animation
    setTimeout(() => {
      onDismiss()
    }, 200)
  }

  const handleBackdropPress = () => {
    handleDismiss()
  }

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: withSpring(position.x, {
          damping: 15,
          stiffness: 150,
        }),
      },
      {
        translateY: withSpring(position.y, {
          damping: 15,
          stiffness: 150,
        }),
      },
    ],
    opacity: withSpring(visible ? 1 : 0, {
      damping: 15,
      stiffness: 150,
    }),
  }))

  if (!visible && !isAnimating) {
    return null
  }

  return (
    <>
      {/* Backdrop - tap to dismiss */}
      {visible && (
        <Pressable
          onPress={handleBackdropPress}
          style={StyleSheet.absoluteFill}
          testID={`${testID}-backdrop`}
        >
          <View style={[styles.backdrop, { backgroundColor: themeColors.overlay }]} />
        </Pressable>
      )}

      {/* Tooltip */}
      <Animated.View
        ref={tooltipRef}
        style={[
          styles.tooltipContainer,
          {
            backgroundColor: themeColors.popover,
            borderColor: themeColors.border,
            borderRadius: radius.lg,
            shadowColor: themeColors.shadow,
            maxWidth: 280,
          },
          animatedStyle,
        ]}
        testID={testID}
      >
        {/* Arrow pointing to drawer */}
        <View
          style={[
            styles.arrow,
            {
              borderTopColor: themeColors.border,
              borderRightColor: 'transparent',
              borderBottomColor: 'transparent',
              borderLeftColor: 'transparent',
            },
          ]}
        />

        {/* Content */}
        <View
          style={{
            padding: spacing.lg,
            gap: spacing.md,
          }}
        >
          <Text
            style={{
              fontSize: typography.bodySmall.fontSize,
              fontWeight: typography.bodySmall.fontWeight,
              color: themeColors.foreground,
              lineHeight: 20,
            }}
          >
            Subscriptions moved to Settings. What's New is now your content feed.
          </Text>

          <Button
            onPress={handleDismiss}
            testID={`${testID}-got-it-button`}
            style={{
              alignSelf: 'flex-start',
              minWidth: 80,
            }}
          >
            <Text>Got it</Text>
          </Button>
        </View>
      </Animated.View>
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  tooltipContainer: {
    position: 'absolute',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1000,
  },
  arrow: {
    position: 'absolute',
    left: -8,
    top: 24,
    width: 0,
    height: 0,
    borderTopWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 10,
    borderLeftWidth: 0,
    transform: [{ rotate: '180deg' }],
  },
})
