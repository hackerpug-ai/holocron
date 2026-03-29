/**
 * VoiceAssistantOverlay
 *
 * Full-screen voice assistant overlay that composes VoiceAgentOrb, VoiceTranscriptFeed, and VoiceControlBar.
 *
 * Layout:
 * - React Native Modal (transparent: true)
 * - SafeAreaView wrapping everything
 * - Semi-transparent background (~0.85 opacity, colors.background)
 * - Header zone: status label (state name) + dismiss X button (top-right)
 * - Center zone (flex:1): VoiceAgentOrb centered
 * - Lower zone: VoiceTranscriptFeed + VoiceControlBar stacked
 *
 * Renders null when state.status is 'idle'. Error state shows retry option.
 *
 * All colors, spacing, and radii use theme tokens via useTheme().
 */

import { useMemo } from 'react'
import { Modal, Pressable, SafeAreaView, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/text'
import { X } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import { VoiceAgentOrb } from './VoiceAgentOrb'
import { VoiceTranscriptFeed, type TranscriptEntry } from './VoiceTranscriptFeed'
import { VoiceControlBar } from './VoiceControlBar'
import type { VoiceSessionState } from '@/hooks/use-voice-session-state'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface VoiceAssistantOverlayProps {
  /** Current voice session state */
  state: VoiceSessionState
  /** Transcript entries to display */
  transcript: TranscriptEntry[]
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
  /** Optional testID for the root container */
  testID?: string
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

/**
 * Format state name for display.
 */
function formatStateName(status: VoiceSessionState['status']): string {
  switch (status) {
    case 'connecting':
      return 'Connecting...'
    case 'listening':
      return 'Listening'
    case 'speaking':
      return 'Speaking'
    case 'processing':
      return 'Processing'
    case 'muted':
      return 'Muted'
    case 'error':
      return 'Error'
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
  transcript: _transcript,
  isMuted,
  onToggleMute,
  onStop,
  onDismiss,
  onRetry,
  testID = 'voice-assistant-overlay-root',
}: VoiceAssistantOverlayProps) {
  const { colors, spacing } = useTheme()

  // Transform VoiceSessionState.transcripts to TranscriptEntry format
  const transcriptEntries: TranscriptEntry[] = useMemo(
    () =>
      state.transcripts.map((t) => ({
        id: `${t.timestamp}-${t.role}`,
        speaker: t.role,
        text: t.content,
        timestamp: new Date(t.timestamp).toISOString(),
        isPartial: false, // Completed entries are never partial
      })),
    [state.transcripts]
  )

  // Don't render if idle
  if (state.status === 'idle') {
    return null
  }

  const statusLabel = formatStateName(state.status)
  const isError = state.status === 'error'

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      testID={testID}
    >
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor: `${colors.background}dd`, // ~0.85 opacity
          },
        ]}
      >
        <View
          style={[
            styles.container,
            {
              paddingHorizontal: spacing.lg,
            },
          ]}
        >
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
              <Text
                variant="h4"
                style={{ color: colors.foreground }}
                testID="voice-assistant-status-label"
              >
                {statusLabel}
              </Text>
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
              onPress={onDismiss}
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

          {/* Center zone: VoiceAgentOrb */}
          <View style={styles.centerZone}>
            <VoiceAgentOrb
              status={state.status}
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
            {/* Transcript feed */}
            <VoiceTranscriptFeed
              transcript={transcriptEntries}
              testID="voice-assistant-transcript-feed"
            />

            {/* Control bar */}
            <VoiceControlBar
              isMuted={isMuted}
              onToggleMute={onToggleMute}
              onStop={onStop}
              onDismiss={onDismiss}
              testID="voice-assistant-control-bar"
            />

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
    </Modal>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
