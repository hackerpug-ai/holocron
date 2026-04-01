/**
 * ImprovementProcessingIndicator - Minimal loading card for improvement processing.
 *
 * Design:
 * - Position: Fixed bottom-center, 100px from bottom (above navigation)
 * - Width: 280px max
 * - Left accent bar: 4px wide, full height, primary color
 * - Content: Spinner + "Processing..." + "Analyzing your feedback"
 * - Animation: Fade in with scale (0.9 → 1.0)
 * - Shadow for elevation
 */

import { ActivityIndicator, StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useEffect } from 'react'
import { Text } from '@/components/ui/text'
import { useTheme } from '@/hooks/use-theme'

// ── Types ──────────────────────────────────────────────────────────────────
export interface ImprovementProcessingIndicatorProps {
  visible: boolean
  testID?: string
}

// ── Component ──────────────────────────────────────────────────────────────
export function ImprovementProcessingIndicator({
  visible,
  testID = 'improvement-processing-indicator',
}: ImprovementProcessingIndicatorProps) {
  const { colors } = useTheme()

  // ── Animation shared values ──────────────────────────────────────────────
  const opacity = useSharedValue(0)
  const scale = useSharedValue(0.9)

  // ── Animate in/out on visibility change ───────────────────────────────────
  useEffect(() => {
    if (visible) {
      opacity.value = withSpring(1, { damping: 12 })
      scale.value = withSpring(1, { damping: 12 })
    } else {
      opacity.value = withTiming(0, { duration: 200 })
      scale.value = withTiming(0.9, { duration: 200 })
    }
  }, [visible, opacity, scale])

  // ── Animated styles ───────────────────────────────────────────────────────
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }))

  if (!visible) return null

  return (
    <View style={styles.fixedContainer} pointerEvents="none">
      <Animated.View
        style={[animatedStyle, styles.card]}
        className="bg-card rounded-xl border border-border shadow-lg overflow-hidden"
        testID={testID}
      >
        {/* Left accent bar */}
        <View
          style={[styles.accentBar, { backgroundColor: colors.primary }]}
        />

        {/* Content */}
        <View style={styles.content}>
          <ActivityIndicator size="small" color={colors.primary} />
          <View className="ml-3 flex-1">
            <Text className="text-foreground text-sm font-semibold">
              Processing...
            </Text>
            <Text className="text-muted-foreground text-xs mt-0.5">
              Analyzing your feedback
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  fixedContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  card: {
    width: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  accentBar: {
    width: 4,
    height: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
})
