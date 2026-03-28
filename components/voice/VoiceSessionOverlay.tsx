/**
 * VoiceSessionOverlay
 *
 * State-driven visual indicator overlay for voice sessions.
 * Renders a different visual indicator per voice state:
 *   - CONNECTING: spinner + 'Connecting...' label
 *   - LISTENING:  pulsing dot + 'Listening...' label
 *   - SPEAKING:   waveform bars + 'Speaking...' label
 *   - PROCESSING: spinner + 'Processing...' label
 *   - ERROR:      error icon + message + Retry button
 *   - IDLE:       renders nothing
 *
 * All colors, spacing, and radii use theme tokens via useTheme().
 */

import { useEffect, useRef } from 'react'
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/text'
import { AlertCircle } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import type { VoiceSessionState } from '@/hooks/use-voice-session-state'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface VoiceSessionOverlayProps {
  /** Current voice session state */
  state: VoiceSessionState
  /** Called when user presses Retry in ERROR state */
  onRetry?: () => void
  /** Optional testID for the root container */
  testID?: string
}

// ─── Sub-components ────────────────────────────────────────────────────────────

/**
 * Spinner indicator for CONNECTING and PROCESSING states.
 */
function ConnectingIndicator({ color }: { color: string }) {
  return (
    <View style={styles.indicatorContainer} testID="voice-overlay-connecting-indicator">
      <ActivityIndicator size="large" color={color} />
      <Text className="text-base mt-3 font-medium" style={{ color }}>
        Connecting...
      </Text>
    </View>
  )
}

/**
 * Pulsing dot animation for LISTENING state.
 * Uses Animated API — no heavy computation on the main thread.
 */
function ListeningIndicator({ color, radiusFull }: { color: string; radiusFull: number }) {
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.4,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    )
    pulse.start()
    return () => pulse.stop()
  }, [pulseAnim])

  return (
    <View style={styles.indicatorContainer} testID="voice-overlay-listening-indicator">
      <Animated.View
        style={[
          styles.pulseDot,
          {
            backgroundColor: color,
            borderRadius: radiusFull, // full circle
            transform: [{ scale: pulseAnim }],
          },
        ]}
      />
      <Text className="text-base mt-3 font-medium" style={{ color }}>
        Listening...
      </Text>
    </View>
  )
}

/**
 * Animated waveform bars for SPEAKING state.
 * Three bars animate with staggered timing for a wave effect.
 */
function SpeakingIndicator({ color, radiusSm }: { color: string; radiusSm: number }) {
  const bar1 = useRef(new Animated.Value(0.4)).current
  const bar2 = useRef(new Animated.Value(0.4)).current
  const bar3 = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    const createBarAnimation = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.4,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      )

    const anim1 = createBarAnimation(bar1, 0)
    const anim2 = createBarAnimation(bar2, 150)
    const anim3 = createBarAnimation(bar3, 300)

    anim1.start()
    anim2.start()
    anim3.start()

    return () => {
      anim1.stop()
      anim2.stop()
      anim3.stop()
    }
  }, [bar1, bar2, bar3])

  return (
    <View style={styles.indicatorContainer} testID="voice-overlay-speaking-indicator">
      <View style={styles.waveformContainer}>
        {[bar1, bar2, bar3].map((anim, i) => (
          <Animated.View
            key={i}
            style={[
              styles.waveformBar,
              {
                backgroundColor: color,
                borderRadius: radiusSm,
                transform: [{ scaleY: anim }],
              },
            ]}
          />
        ))}
      </View>
      <Text className="text-base mt-3 font-medium" style={{ color }}>
        Speaking...
      </Text>
    </View>
  )
}

/**
 * Processing indicator — reuses spinner with different label.
 */
function ProcessingIndicator({ color }: { color: string }) {
  return (
    <View style={styles.indicatorContainer} testID="voice-overlay-processing-indicator">
      <ActivityIndicator size="large" color={color} />
      <Text className="text-base mt-3 font-medium" style={{ color }}>
        Processing...
      </Text>
    </View>
  )
}

/**
 * Error indicator with icon, message, and Retry button.
 */
function ErrorIndicator({
  errorMessage,
  onRetry,
  errorColor,
  primaryColor,
  surfaceColor,
  spacingSm,
  spacingLg,
  spacingXl,
  radiusLg,
}: {
  errorMessage: string | null
  onRetry?: () => void
  errorColor: string
  primaryColor: string
  surfaceColor: string
  spacingSm: number
  spacingLg: number
  spacingXl: number
  radiusLg: number
}) {
  return (
    <View style={styles.indicatorContainer} testID="voice-overlay-error-indicator">
      <AlertCircle size={40} color={errorColor} />
      <Text
        className="text-base mt-3 text-center"
        style={[styles.errorMessage, { color: errorColor, marginBottom: spacingLg }]}
      >
        {errorMessage ?? 'An error occurred'}
      </Text>
      {onRetry && (
        <Pressable
          testID="voice-overlay-retry-button"
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry voice connection"
          style={({ pressed }) => [
            styles.retryButton,
            {
              backgroundColor: pressed ? primaryColor : surfaceColor,
              borderColor: primaryColor,
              paddingHorizontal: spacingXl,
              borderRadius: radiusLg,
              paddingVertical: spacingSm,
            },
          ]}
        >
          <Text
            className="text-sm font-semibold"
            style={{ color: primaryColor }}
          >
            Retry
          </Text>
        </Pressable>
      )}
    </View>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

/**
 * VoiceSessionOverlay renders state-driven visual indicators for a voice session.
 *
 * Renders `null` when state.status is 'idle'.
 *
 * @example
 * ```tsx
 * <VoiceSessionOverlay
 *   state={voiceState}
 *   onRetry={() => start()}
 * />
 * ```
 */
export function VoiceSessionOverlay({
  state,
  onRetry,
  testID = 'voice-session-overlay',
}: VoiceSessionOverlayProps) {
  const { colors, spacing, radius } = useTheme()

  if (state.status === 'idle') return null

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          padding: spacing.xl,
          borderRadius: radius.xl,
        },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Voice session: ${state.status}`}
    >
      {state.status === 'connecting' && (
        <ConnectingIndicator color={colors.primary} />
      )}
      {state.status === 'listening' && (
        <ListeningIndicator color={colors.primary} radiusFull={radius.full} />
      )}
      {state.status === 'speaking' && (
        <SpeakingIndicator color={colors.accentForeground} radiusSm={radius.sm} />
      )}
      {state.status === 'processing' && (
        <ProcessingIndicator color={colors.mutedForeground} />
      )}
      {state.status === 'error' && (
        <ErrorIndicator
          errorMessage={state.errorMessage}
          onRetry={onRetry}
          errorColor={colors.destructive}
          primaryColor={colors.primary}
          surfaceColor={colors.card}
          spacingSm={spacing.sm}
          spacingLg={spacing.lg}
          spacingXl={spacing.xl}
          radiusLg={radius.lg}
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
    minWidth: 200, // fixed minimum width for overlay legibility
  },
  indicatorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseDot: {
    width: 24,  // fixed visual dimension (dot size)
    height: 24, // fixed visual dimension (dot size)
    // borderRadius applied inline via radius.full token
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,    // fixed visual gap between bars (no exact token: sm=8, xs=4)
    height: 40, // fixed visual dimension (waveform height)
  },
  waveformBar: {
    width: 6,   // fixed visual dimension (bar width)
    height: 32, // fixed visual dimension (bar height)
    // borderRadius applied inline via radius.sm token
  },
  errorMessage: {
    maxWidth: 240, // fixed max width for readable error text wrapping
    // marginBottom applied inline via spacing.lg token
  },
  retryButton: {
    borderWidth: 1.5, // fine visual detail — not a spacing token
    // paddingHorizontal, paddingVertical, borderRadius applied inline via tokens
    // paddingVertical uses spacing.sm token
  },
})
