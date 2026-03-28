/**
 * US-016: Voice error handler
 *
 * Detects and handles two categories of voice session failures:
 *   1. Service unavailable — OpenAI API unreachable (token failure or 3 consecutive errors)
 *   2. Permission denied — Microphone access not granted
 *
 * NEVER exposes raw API error details to the user.
 * ALWAYS cleans up resources on service unavailable.
 * Provides platform-specific settings guidance for permission errors.
 */

import { Platform, Linking } from 'react-native'

export type VoiceErrorKind = 'service_unavailable' | 'permission_denied'

export interface VoiceErrorType {
  kind: VoiceErrorKind
  userMessage: string
  canRetry?: boolean
  isMidSession?: boolean
  settingsGuidance?: string
  openSettings?: () => void
}

export interface VoiceErrorHandlerOptions {
  onError: (error: VoiceErrorType) => void
  onCleanup: () => void
}

export interface VoiceErrorHandler {
  /** Called when ephemeral token generation fails (session start failure). */
  handleTokenGenerationFailure: (error: Error) => void
  /** Called when microphone permission is denied. */
  handleMicrophonePermissionDenied: () => void
  /** Called for each consecutive mid-session error. Triggers cleanup after 3. */
  handleConsecutiveError: () => void
  /** Called when an event succeeds — resets the consecutive error counter. */
  handleSuccess: () => void
  /** Resets handler state to allow a fresh retry. */
  reset: () => void
}

const CONSECUTIVE_ERROR_THRESHOLD = 3

function getPlatformSettingsGuidance(): string {
  if (Platform.OS === 'ios') {
    return 'Go to Settings > Holocron > Microphone'
  }
  return 'Go to Settings > Apps > Holocron > Permissions'
}

function openAppSettings(): void {
  if (Platform.OS === 'ios') {
    Linking.openURL('app-settings:').catch(() => {})
  } else {
    Linking.openSettings().catch(() => {})
  }
}

export function createVoiceErrorHandler(
  options: VoiceErrorHandlerOptions
): VoiceErrorHandler {
  const { onError, onCleanup } = options
  let consecutiveErrorCount = 0

  function handleTokenGenerationFailure(_error: Error): void {
    onCleanup()
    onError({
      kind: 'service_unavailable',
      userMessage: 'Voice assistant is currently unavailable',
      canRetry: true,
      isMidSession: false,
    })
  }

  function handleMicrophonePermissionDenied(): void {
    onError({
      kind: 'permission_denied',
      userMessage: 'Microphone access needed',
      settingsGuidance: getPlatformSettingsGuidance(),
      openSettings: openAppSettings,
      canRetry: false,
    })
  }

  function handleConsecutiveError(): void {
    consecutiveErrorCount += 1

    if (consecutiveErrorCount >= CONSECUTIVE_ERROR_THRESHOLD) {
      consecutiveErrorCount = 0
      onCleanup()
      onError({
        kind: 'service_unavailable',
        userMessage: 'Lost connection to voice service. Please try again.',
        canRetry: true,
        isMidSession: true,
      })
    }
  }

  function handleSuccess(): void {
    consecutiveErrorCount = 0
  }

  function reset(): void {
    consecutiveErrorCount = 0
  }

  return {
    handleTokenGenerationFailure,
    handleMicrophonePermissionDenied,
    handleConsecutiveError,
    handleSuccess,
    reset,
  }
}
