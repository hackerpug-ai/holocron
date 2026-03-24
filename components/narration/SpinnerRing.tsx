import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface SpinnerRingProps {
  /** Outer diameter of the ring (matches button size) */
  size: number
  /** Ring stroke width */
  strokeWidth?: number
  /** Whether the spinner is visible and animating */
  active: boolean
  /** Ring color — defaults to primary via className on parent */
  color?: string
  testID?: string
}

// ─── Component ─────────────────────────────────────────────────────────────────

/**
 * SpinnerRing renders an animated arc that rotates around a circular path.
 * Designed to overlay the play button border as a loading indicator.
 *
 * Uses react-native-reanimated for the rotation and react-native-svg for the
 * dashed-circle arc. The arc covers ~30% of the circumference and spins
 * smoothly at a constant rate.
 */
export function SpinnerRing({
  size,
  strokeWidth = 2.5,
  active,
  color = 'hsl(142, 71%, 45%)',
  testID = 'spinner-ring',
}: SpinnerRingProps) {
  const rotation = useSharedValue(0)

  useEffect(() => {
    if (active) {
      rotation.value = 0
      rotation.value = withRepeat(
        withTiming(360, { duration: 1100, easing: Easing.linear }),
        -1,
        false
      )
    } else {
      cancelAnimation(rotation)
      rotation.value = 0
    }
  }, [active])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }))

  if (!active) return null

  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  // Arc length: ~30% of the circle
  const arcLength = circumference * 0.3
  const gapLength = circumference - arcLength

  return (
    <Animated.View
      testID={testID}
      style={[
        animatedStyle,
        {
          position: 'absolute',
          width: size,
          height: size,
        },
      ]}
      pointerEvents="none"
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${arcLength} ${gapLength}`}
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  )
}
