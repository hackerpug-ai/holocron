/**
 * VoiceAssistantOverlay
 *
 * Full-screen voice assistant overlay that composes VoiceAgentOrb, VoiceTranscriptFeed, and VoiceControlBar.
 *
 * Layout:
 * - React Native Modal (transparent: true, animationType: none)
 * - Reanimated slide-up entrance + backdrop fade (matches ChatPickerSheet pattern)
 * - SafeAreaView wrapping everything
 * - Semi-transparent background (~0.85 opacity via animated opacity, colors.background)
 * - Header zone: status label (state name) + dismiss X button (top-right)
 * - Center zone (flex:1): VoiceAgentOrb centered
 * - Lower zone: VoiceTranscriptFeed + VoiceControlBar stacked
 *
 * Renders null when state.status is 'idle'. Error state shows retry option.
 *
 * All colors, spacing, and radii use theme tokens via useTheme().
 */

import { useCallback, useEffect } from 'react'
import { Dimensions, Modal, Pressable, SafeAreaView, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { Text } from '@/components/ui/text'
import { X } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import { VoiceAgentOrb } from './VoiceAgentOrb'
import { VoiceCaptions } from './VoiceCaptions'
import { VoiceControlBar } from './VoiceControlBar'
import { VoiceToolActivityPill } from './VoiceToolActivityPill'
import type { VoiceSessionState } from '@/hooks/use-voice-session-state'

// ─── Constants ─────────────────────────────────────────────────────────────────

const SCREEN_HEIGHT = Dimensions.get('window').height

const TIMING_IN = {
  duration: 200,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1.0),
}

const TIMING_OUT = {
  duration: 180,
  easing: Easing.in(Easing.cubic),
}

const DISMISS_THRESHOLD = 120

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface VoiceAssistantOverlayProps {
  /** Current voice session state */
  state: VoiceSessionState
  /** @deprecated No longer used - captions read from state.transcripts directly */
  transcript?: unknown[]
  /** Whether the microphone is muted */
  isMuted: boolean
  /** Called when user toggles mute */
  onToggleMute: () => void
  /** Called when user stops the session */
  onStop: () => void
  /** Called when user dismisses the overlay */
  onDismiss: () => void
  /** Called when user taps retry in error state */
  onRetry?: () => void
  /** Audio level for reactive orb animation (0-1) */
  audioLevel?: number
  /** Optional testID for the root container */
  testID?: string
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

/**
 * Format state name for display.
 */
function formatStateName(
  status: VoiceSessionState['status'],
  connectingPhase?: VoiceSessionState['connectingPhase'],
): string {
  switch (status) {
    case 'connecting':
      switch (connectingPhase) {
        case 'preparing':
          return 'Setting up microphone...'
        case 'connecting_ai':
          return 'Connecting to AI...'
        case 'almost_ready':
          return 'Almost ready...'
        default:
          return 'Getting ready...'
      }
    case 'listening':
      return "I'm listening..."
    case 'speaking':
      return ''
    case 'processing':
      return 'Thinking...'
    case 'muted':
      return 'Muted'
    case 'error':
      return 'Something went wrong'
    case 'idle':
      return ''
  }
}

// ─── Main Component ────────────────────────────────────────────────────────────

/**
 * VoiceAssistantOverlay renders a full-screen voice assistant overlay.
 *
 * Renders `null` when state.status is 'idle'.
 *
 * @example
 * ```tsx
 * <VoiceAssistantOverlay
 *   state={voiceState}
 *   transcript={transcripts}
 *   isMuted={isMuted}
 *   onToggleMute={() => toggleMute()}
 *   onStop={() => stopSession()}
 *   onDismiss={() => dismiss()}
 *   onRetry={() => retry()}
 * />
 * ```
 */
export function VoiceAssistantOverlay({
  state,
  transcript: _transcript = [],
  isMuted,
  onToggleMute,
  onStop,
  onDismiss,
  onRetry,
  audioLevel = 0,
  testID = 'voice-assistant-overlay-root',
}: VoiceAssistantOverlayProps) {
  const { colors, spacing } = useTheme()

  // ─── Animation shared values ──────────────────────────────────────────────
  const translateY = useSharedValue(SCREEN_HEIGHT)
  const backdropOpacity = useSharedValue(0)
  const containerScale = useSharedValue(0.97)

  // Trigger entrance animation when overlay becomes active (status !== 'idle')
  useEffect(() => {
    if (state.status !== 'idle') {
      translateY.value = withTiming(0, TIMING_IN)
      backdropOpacity.value = withTiming(0.65, TIMING_IN)
      containerScale.value = withTiming(1, TIMING_IN)
    }
  }, [state.status, translateY, backdropOpacity, containerScale])

  // Animate out then call the dismiss callback
  const animateOut = useCallback(
    (callback: () => void) => {
      translateY.value = withTiming(SCREEN_HEIGHT, TIMING_OUT)
      backdropOpacity.value = withTiming(0, TIMING_OUT)
      containerScale.value = withTiming(0.97, TIMING_OUT)
      setTimeout(() => callback(), 180)
    },
    [translateY, backdropOpacity, containerScale]
  )

  const handleDismiss = useCallback(() => {
    animateOut(onDismiss)
  }, [animateOut, onDismiss])

  const handleStop = useCallback(() => {
    animateOut(onStop)
  }, [animateOut, onStop])

  // ─── Pan gesture: swipe down to dismiss ──────────────────────────────────
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD) {
        translateY.value = withTiming(SCREEN_HEIGHT, TIMING_OUT)
        backdropOpacity.value = withTiming(0, TIMING_OUT)
        runOnJS(onDismiss)()
      } else {
        translateY.value = withTiming(0, TIMING_IN)
      }
    })

  // ─── Animated styles ──────────────────────────────────────────────────────
  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: Math.max(translateY.value, 0) },
      { scale: containerScale.value },
    ],
  }))

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  // Don't render if idle
  if (state.status === 'idle') {
    return null
  }

  const statusLabel = formatStateName(state.status, state.connectingPhase)
  const isError = state.status === 'error'

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      testID={testID}
    >
      {/* Backdrop — animated opacity over solid background color */}
      <Animated.View
        style={[
          styles.backdrop,
          backdropAnimatedStyle,
          { backgroundColor: colors.background },
        ]}
        pointerEvents="none"
      />

      {/* Slide-up container */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.animatedContainer, containerAnimatedStyle]}>
          <SafeAreaView style={styles.safeArea}>
            <View
              style={[
                styles.container,
                {
                  paddingHorizontal: spacing.lg,
                },
              ]}
            >
              {/* Drag handle */}
              <View
                style={{
                  alignSelf: 'center',
                  width: 36,
                  height: 5,
                  borderRadius: 999,
                  backgroundColor: colors.muted,
                  marginTop: spacing.sm,
                  marginBottom: spacing.xs,
                }}
              />

              {/* Header zone: status label + dismiss button */}
              <View
                style={[
                  styles.header,
                  {
                    paddingTop: spacing.md,
                    paddingBottom: spacing.lg,
                    gap: spacing.md,
                  },
                ]}
              >
                {/* Status label */}
                <View style={styles.statusContainer}>
                  {statusLabel !== '' && (
                    <Text
                      variant="h4"
                      style={{ color: colors.foreground }}
                      testID="voice-assistant-status-label"
                    >
                      {statusLabel}
                    </Text>
                  )}
                  {isError && state.errorMessage && (
                    <Text
                      variant="p"
                      className="text-sm"
                      style={{ color: colors.destructive, marginTop: 4 }}
                      testID="voice-assistant-error-message"
                    >
                      {state.errorMessage}
                    </Text>
                  )}
                </View>

                {/* Dismiss button */}
                <Pressable
                  testID="voice-assistant-header-dismiss"
                  onPress={handleDismiss}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss voice assistant"
                  style={({ pressed }) => [
                    styles.dismissButton,
                    {
                      backgroundColor: pressed ? colors.muted : colors.card,
                      borderRadius: 20,
                      padding: spacing.sm,
                    },
                  ]}
                >
                  <X size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>

              {/* Tool activity pill: shown when a tool is executing */}
              <VoiceToolActivityPill
                toolName={state.activeTool}
                testID="voice-assistant-tool-activity-pill"
              />

              {/* Center zone: VoiceAgentOrb */}
              <View style={styles.centerZone}>
                <VoiceAgentOrb
                  status={state.status}
                  audioLevel={audioLevel}
                  connectingPhase={state.connectingPhase}
                  size={160}
                  testID="voice-assistant-agent-orb"
                />
              </View>

              {/* Lower zone: transcript + controls */}
              <View
                style={[
                  styles.lowerZone,
                  {
                    paddingBottom: spacing.xl,
                    gap: spacing.lg,
                  },
                ]}
              >
                {/* Captions: positioned just above controls */}
                <VoiceCaptions
                  transcripts={state.transcripts}
                />

                {/* Control bar — hidden during connecting (controls are useless) */}
                {state.status !== 'connecting' && (
                  <VoiceControlBar
                    isMuted={isMuted}
                    onToggleMute={onToggleMute}
                    onStop={handleStop}
                    voiceStatus={state.status}
                    testID="voice-assistant-control-bar"
                  />
                )}

                {/* Retry button in error state */}
                {isError && onRetry && (
                  <Pressable
                    testID="voice-assistant-retry-button"
                    onPress={onRetry}
                    accessibilityRole="button"
                    accessibilityLabel="Retry voice connection"
                    style={({ pressed }) => [
                      styles.retryButton,
                      {
                        backgroundColor: pressed ? colors.primary : colors.card,
                        borderColor: colors.primary,
                        borderRadius: 12,
                        paddingVertical: spacing.md,
                        paddingHorizontal: spacing.xl,
                      },
                    ]}
                  >
                    <Text
                      variant="lead"
                      style={{ color: colors.primary }}
                    >
                      Retry
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          </SafeAreaView>
        </Animated.View>
      </GestureDetector>
    </Modal>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  animatedContainer: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  statusContainer: {
    flex: 1,
  },
  dismissButton: {
    // Dynamic styles applied inline
  },
  centerZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120, // Ensure orb has space
  },
  lowerZone: {
    width: '100%',
  },
  retryButton: {
    alignSelf: 'center',
    borderWidth: 1.5,
  },
})
