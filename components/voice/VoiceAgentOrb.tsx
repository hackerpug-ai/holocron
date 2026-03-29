/**
 * VoiceAgentOrb
 *
 * Animated AI agent visualization with three concentric circles:
 *   - Core: solid center circle
 *   - Glow ring: medium circle with opacity
 *   - Pulse ring: outer circle that expands outward
 *
 * State-driven animations (all useNativeDriver: true):
 *   - connecting: opacity breathing loop (0.6→1, 1s cycle)
 *   - listening: spring to audioLevel prop for reactive pulse; fallback slow loop when no input
 *   - speaking: active breathing (scale 0.97→1.03, 600ms) + fast outward pulse ring
 *   - processing: rotateZ loop via interpolate
 *   - error: shake animation (translateX -6→+6, 3 cycles) + destructive color
 *   - muted: desaturated color, static
 *
 * All colors use theme tokens via useTheme().
 */

import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { useTheme } from '@/hooks/use-theme'
import type { VoiceState } from '@/hooks/use-voice-session-state'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface VoiceAgentOrbProps {
  /** Current voice state */
  status: VoiceState
  /** Audio level for reactive listening animation (0-1) */
  audioLevel?: number
  /** Size of the orb in dp (default: 160) */
  size?: number
  /** Optional testID for the root container */
  testID?: string
}

// ─── Helper Components ───────────────────────────────────────────────────────────

/**
 * Core circle — solid center of the orb.
 */
function CoreCircle({
  size,
  color,
  scale,
  testID,
}: {
  size: number
  color: string
  scale: Animated.Value
  testID?: string
}) {
  return (
    <Animated.View
      testID={testID}
      style={[
        styles.coreCircle,
        {
          width: size * 0.4,
          height: size * 0.4,
          backgroundColor: color,
          borderRadius: (size * 0.4) / 2,
          transform: [{ scale }],
        },
      ]}
    />
  )
}

/**
 * Glow ring — medium circle with opacity.
 */
function GlowRing({
  size,
  color,
  opacity,
  testID,
}: {
  size: number
  color: string
  opacity: Animated.Value
  testID?: string
}) {
  return (
    <Animated.View
      testID={testID}
      style={[
        styles.glowRing,
        {
          width: size * 0.65,
          height: size * 0.65,
          backgroundColor: color,
          borderRadius: (size * 0.65) / 2,
          opacity,
        },
      ]}
    />
  )
}

/**
 * Pulse ring — outer circle that expands outward.
 */
function PulseRing({
  size,
  color,
  scale,
  opacity,
  testID,
}: {
  size: number
  color: string
  scale: Animated.Value
  opacity: Animated.Value
  testID?: string
}) {
  return (
    <Animated.View
      testID={testID}
      style={[
        styles.pulseRing,
        {
          width: size * 0.9,
          height: size * 0.9,
          backgroundColor: color,
          borderRadius: (size * 0.9) / 2,
          transform: [{ scale }],
          opacity,
        },
      ]}
    />
  )
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

  // Animation values
  const coreScale = useRef(new Animated.Value(1)).current
  const glowOpacity = useRef(new Animated.Value(0.6)).current
  const pulseScale = useRef(new Animated.Value(1)).current
  const pulseOpacity = useRef(new Animated.Value(0.3)).current
  const rotation = useRef(new Animated.Value(0)).current
  const shake = useRef(new Animated.Value(0)).current

  // ─── State-driven animations ─────────────────────────────────────────────────────

  useEffect(() => {
    // Clear all running animations - reset to default values
    coreScale.setValue(1)
    glowOpacity.setValue(0.6)
    pulseScale.setValue(1)
    pulseOpacity.setValue(0.3)
    rotation.setValue(0)
    shake.setValue(0)

    switch (status) {
      case 'connecting': {
        // Breathing opacity: 0.6→1, 1s cycle
        Animated.loop(
          Animated.sequence([
            Animated.timing(glowOpacity, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(glowOpacity, {
              toValue: 0.6,
              duration: 500,
              useNativeDriver: true,
            }),
          ])
        ).start()
        break
      }

      case 'listening': {
        if (audioLevel > 0) {
          // Reactive pulse to audio level
          const targetScale = 1 + audioLevel * 0.3
          const targetOpacity = 0.3 + audioLevel * 0.5
          Animated.spring(pulseScale, {
            toValue: targetScale,
            useNativeDriver: true,
            bounciness: 0,
            speed: 30,
          }).start()
          Animated.spring(pulseOpacity, {
            toValue: targetOpacity,
            useNativeDriver: true,
            bounciness: 0,
            speed: 30,
          }).start()
        } else {
          // Fallback slow loop when no input
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulseScale, {
                toValue: 1.15,
                duration: 1500,
                useNativeDriver: true,
              }),
              Animated.timing(pulseScale, {
                toValue: 1,
                duration: 1500,
                useNativeDriver: true,
              }),
            ])
          ).start()
        }
        break
      }

      case 'speaking': {
        // Active breathing: scale 0.97→1.03, 600ms
        const breathing = Animated.loop(
          Animated.sequence([
            Animated.timing(coreScale, {
              toValue: 1.03,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(coreScale, {
              toValue: 0.97,
              duration: 300,
              useNativeDriver: true,
            }),
          ])
        )
        breathing.start()

        // Fast outward pulse ring
        const pulse = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseScale, {
              toValue: 1.4,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(pulseOpacity, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.parallel([
              Animated.timing(pulseScale, {
                toValue: 1,
                duration: 0,
                useNativeDriver: true,
              }),
              Animated.timing(pulseOpacity, {
                toValue: 0.3,
                duration: 0,
                useNativeDriver: true,
              }),
            ]),
          ])
        )
        pulse.start()

        return () => {
          breathing.stop()
          pulse.stop()
        }
      }

      case 'processing': {
        // Rotate via interpolate
        const rotateAnim = Animated.loop(
          Animated.timing(rotation, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          })
        )
        rotateAnim.start()
        return () => rotateAnim.stop()
      }

      case 'error': {
        // Shake animation: translateX -6→+6, 3 cycles
        const shakeAnim = Animated.sequence([
          Animated.timing(shake, {
            toValue: -6,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(shake, {
            toValue: 6,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(shake, {
            toValue: -6,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(shake, {
            toValue: 6,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(shake, {
            toValue: -6,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(shake, {
            toValue: 6,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(shake, {
            toValue: 0,
            duration: 50,
            useNativeDriver: true,
          }),
        ])
        shakeAnim.start()
        break
      }

      case 'muted': {
        // Static — no animation
        break
      }

      default:
        break
    }
  }, [status, audioLevel, coreScale, glowOpacity, pulseScale, pulseOpacity, rotation, shake])

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
      <PulseRing size={size} color={color} scale={pulseScale} opacity={pulseOpacity} testID={`${testID}-pulse-ring`} />

      {/* Glow ring (middle) */}
      <GlowRing size={size} color={color} opacity={glowOpacity} testID={`${testID}-glow-ring`} />

      {/* Core circle (innermost) */}
      <CoreCircle
        size={size}
        color={color}
        scale={coreScale}
        testID={`${testID}-core`}
      />

      {/* Shake wrapper for error state */}
      {status === 'error' && (
        <Animated.View
          style={{
            position: 'absolute',
            transform: [{ translateX: shake }],
          }}
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
})
