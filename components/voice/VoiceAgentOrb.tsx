/**
 * VoiceAgentOrb
 *
 * Animated AI agent visualization with three concentric circles:
 *   - Core: solid center circle
 *   - Glow ring: medium circle with opacity
 *   - Pulse ring: outer circle that expands outward
 *
 * State-driven animations (Reanimated — GPU-accelerated):
 *   - connecting: opacity breathing loop (0.6→1, 1s cycle)
 *   - listening: spring to audioLevel prop for reactive pulse; fallback slow loop when no input
 *   - speaking: audio-responsive breathing (amplitude scales with audioLevel) + outward pulse ring
 *   - processing: rotateZ loop
 *   - error: shake animation (translateX -6→+6, 3 cycles) + destructive color
 *   - muted: desaturated color, static
 *
 * All colors use theme tokens via useTheme().
 */

import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useTheme } from '@/hooks/use-theme'
import type { VoiceState } from '@/hooks/use-voice-session-state'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface VoiceAgentOrbProps {
  /** Current voice state */
  status: VoiceState
  /** Audio level for reactive listening animation (0-1) */
  audioLevel?: number
  /** Sub-phase during connecting state for staged animations */
  connectingPhase?: 'preparing' | 'connecting_ai' | 'almost_ready' | null
  /** Size of the orb in dp (default: 160) */
  size?: number
  /** Optional testID for the root container */
  testID?: string
}

// ─── Main Component ────────────────────────────────────────────────────────────

/**
 * VoiceAgentOrb renders an animated AI agent visualization.
 *
 * @example
 * ```tsx
 * <VoiceAgentOrb
 *   status="listening"
 *   audioLevel={0.7}
 *   size={160}
 * />
 * ```
 */
export function VoiceAgentOrb({
  status,
  audioLevel = 0,
  connectingPhase,
  size = 160,
  testID = 'voice-agent-orb',
}: VoiceAgentOrbProps) {
  const { colors } = useTheme()

  // Determine color based on state
  const getColor = () => {
    switch (status) {
      case 'error':
        return colors.destructive
      case 'muted':
        return colors.mutedForeground
      default:
        return colors.primary
    }
  }

  const color = getColor()

  // ─── Shared animation values ─────────────────────────────────────────────────

  const coreScale = useSharedValue(1)
  const glowOpacity = useSharedValue(0.6)
  const pulseScale = useSharedValue(1)
  const pulseOpacity = useSharedValue(0.3)
  const rotation = useSharedValue(0)
  const shake = useSharedValue(0)

  // ─── Animated styles ─────────────────────────────────────────────────────────

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: coreScale.value }],
  }))

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }))

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }))

  const rotationStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${rotation.value}deg` }],
  }))

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }))

  // ─── State-driven animations ──────────────────────────────────────────────────

  useEffect(() => {
    // Cancel all running animations and reset to default values
    cancelAnimation(coreScale)
    cancelAnimation(glowOpacity)
    cancelAnimation(pulseScale)
    cancelAnimation(pulseOpacity)
    cancelAnimation(rotation)
    cancelAnimation(shake)

    coreScale.value = 1
    glowOpacity.value = 0.6
    pulseScale.value = 1
    pulseOpacity.value = 0.3
    rotation.value = 0
    shake.value = 0

    switch (status) {
      case 'connecting': {
        switch (connectingPhase) {
          case 'preparing':
            // Core materializes — scale up from small
            coreScale.value = 0.5
            coreScale.value = withSpring(1, { damping: 12, stiffness: 100 })
            glowOpacity.value = 0.3
            break
          case 'connecting_ai':
            // Glow ring fades in and begins slow pulse
            glowOpacity.value = withTiming(0.8, { duration: 400 })
            pulseScale.value = withRepeat(
              withSequence(
                withTiming(1.1, { duration: 1200 }),
                withTiming(1, { duration: 1200 }),
              ),
              -1,
            )
            break
          case 'almost_ready':
            // All rings active with faster rhythm
            glowOpacity.value = 1
            pulseScale.value = withRepeat(
              withSequence(
                withTiming(1.2, { duration: 800 }),
                withTiming(1, { duration: 800 }),
              ),
              -1,
            )
            pulseOpacity.value = withRepeat(
              withSequence(
                withTiming(0.5, { duration: 800 }),
                withTiming(0.3, { duration: 800 }),
              ),
              -1,
            )
            break
          default:
            // Fallback: original breathing opacity
            glowOpacity.value = withRepeat(
              withSequence(
                withTiming(1, { duration: 500 }),
                withTiming(0.6, { duration: 500 }),
              ),
              -1,
            )
        }
        break
      }

      case 'listening': {
        if (audioLevel > 0) {
          // Reactive spring pulse to audio level
          const targetScale = 1 + audioLevel * 0.3
          const targetOpacity = 0.3 + audioLevel * 0.5
          pulseScale.value = withSpring(targetScale, { damping: 15, stiffness: 150 })
          pulseOpacity.value = withSpring(targetOpacity, { damping: 15, stiffness: 150 })
        } else {
          // Fallback slow loop when no input
          pulseScale.value = withRepeat(
            withSequence(
              withTiming(1.15, { duration: 1500 }),
              withTiming(1, { duration: 1500 }),
            ),
            -1,
          )
        }
        break
      }

      case 'speaking': {
        // Audio-responsive breathing: amplitude scales with audioLevel (0.03→0.08)
        const breathingAmplitude = 0.03 + audioLevel * 0.05
        coreScale.value = withRepeat(
          withSequence(
            withTiming(1 + breathingAmplitude, { duration: 300 }),
            withTiming(1 - breathingAmplitude, { duration: 300 }),
          ),
          -1,
        )

        // Smooth outward pulse ring expansion
        pulseScale.value = withRepeat(
          withSequence(
            withTiming(1.4, { duration: 600, easing: Easing.out(Easing.cubic) }),
            withTiming(1, { duration: 200, easing: Easing.in(Easing.cubic) }),
          ),
          -1,
        )
        pulseOpacity.value = withRepeat(
          withSequence(
            withTiming(0, { duration: 600 }),
            withTiming(0.3, { duration: 0 }),
          ),
          -1,
        )
        break
      }

      case 'processing': {
        // Full rotation loop
        rotation.value = withRepeat(
          withTiming(360, { duration: 2000, easing: Easing.linear }),
          -1,
        )
        break
      }

      case 'error': {
        // Shake animation: translateX -6→+6, 3 cycles
        shake.value = withSequence(
          withTiming(-6, { duration: 50 }),
          withTiming(6, { duration: 50 }),
          withTiming(-6, { duration: 50 }),
          withTiming(6, { duration: 50 }),
          withTiming(-6, { duration: 50 }),
          withTiming(6, { duration: 50 }),
          withTiming(0, { duration: 50 }),
        )
        break
      }

      case 'muted': {
        // Static — no animation
        break
      }

      default:
        break
    }
  }, [status, audioLevel, connectingPhase])

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        {
          width: size,
          height: size,
        },
      ]}
    >
      {/* Pulse ring (outermost) */}
      <Animated.View
        testID={`${testID}-pulse-ring`}
        style={[
          styles.pulseRing,
          {
            width: size * 0.9,
            height: size * 0.9,
            backgroundColor: color,
            borderRadius: (size * 0.9) / 2,
          },
          pulseStyle,
        ]}
      />

      {/* Glow ring (middle) */}
      <Animated.View
        testID={`${testID}-glow-ring`}
        style={[
          styles.glowRing,
          {
            width: size * 0.65,
            height: size * 0.65,
            backgroundColor: color,
            borderRadius: (size * 0.65) / 2,
          },
          glowStyle,
        ]}
      />

      {/* Core circle (innermost) — also carries rotation for processing state */}
      <Animated.View
        testID={`${testID}-core`}
        style={[
          styles.coreCircle,
          {
            width: size * 0.4,
            height: size * 0.4,
            backgroundColor: color,
            borderRadius: (size * 0.4) / 2,
          },
          coreStyle,
          status === 'processing' ? rotationStyle : undefined,
        ]}
      />

      {/* Shake wrapper — visible for error state, applies translateX to all rings */}
      {status === 'error' && (
        <Animated.View
          style={[
            styles.shakeOverlay,
            shakeStyle,
          ]}
          pointerEvents="none"
        />
      )}
    </View>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  coreCircle: {
    position: 'absolute',
    zIndex: 3,
  },
  glowRing: {
    position: 'absolute',
    zIndex: 2,
  },
  pulseRing: {
    position: 'absolute',
    zIndex: 1,
  },
  shakeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
})
