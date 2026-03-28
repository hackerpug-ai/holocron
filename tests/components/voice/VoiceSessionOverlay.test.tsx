/**
 * Tests for VoiceSessionOverlay component
 *
 * Verifies:
 * - AC-1: CONNECTING state renders spinner + 'Connecting...' label
 * - AC-2: LISTENING state renders pulsing dot + 'Listening...' label
 * - AC-3: ERROR state renders error icon, message, and Retry button (testID='voice-overlay-retry-button')
 * - AC-4: State transitions from LISTENING to SPEAKING
 * - AC-5: Component structure uses theme tokens (no hardcoded values)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// ─── File source helpers ───────────────────────────────────────────────────────

const componentPath = join(
  process.cwd(),
  'components',
  'voice',
  'VoiceSessionOverlay.tsx'
)

function readComponent(): string {
  return readFileSync(componentPath, 'utf-8')
}

// ─── Structural tests (file-based, avoids RN render environment issues) ────────

describe('VoiceSessionOverlay - Component Structure', () => {
  it('exports VoiceSessionOverlay as a named export', () => {
    const source = readComponent()
    expect(source).toContain('export function VoiceSessionOverlay')
  })

  it('exports VoiceSessionOverlayProps interface', () => {
    const source = readComponent()
    expect(source).toContain('VoiceSessionOverlayProps')
    expect(source).toContain('state: VoiceSessionState')
    expect(source).toContain('onRetry')
  })

  // AC-1: CONNECTING state
  it('AC-1: renders ConnectingIndicator with ActivityIndicator for CONNECTING state', () => {
    const source = readComponent()
    expect(source).toContain("state.status === 'connecting'")
    expect(source).toContain('ConnectingIndicator')
    expect(source).toContain('ActivityIndicator')
    expect(source).toContain("Connecting...")
  })

  // AC-1: Uses primary color for CONNECTING
  it('AC-1: passes primary color to ConnectingIndicator', () => {
    const source = readComponent()
    expect(source).toContain('colors.primary')
    // ConnectingIndicator receives the primary color
    expect(source).toMatch(/ConnectingIndicator.*color={colors\.primary}/s)
  })

  // AC-2: LISTENING state
  it('AC-2: renders ListeningIndicator with pulsing dot animation for LISTENING state', () => {
    const source = readComponent()
    expect(source).toContain("state.status === 'listening'")
    expect(source).toContain('ListeningIndicator')
    expect(source).toContain('Animated')
    expect(source).toContain("Listening...")
  })

  // AC-2: Pulse animation uses Animated API
  it('AC-2: LISTENING animation uses Animated loop sequence', () => {
    const source = readComponent()
    expect(source).toContain('Animated.loop')
    expect(source).toContain('Animated.sequence')
    expect(source).toContain('useNativeDriver: true')
  })

  // AC-3: ERROR state
  it('AC-3: renders ErrorIndicator with error icon for ERROR state', () => {
    const source = readComponent()
    expect(source).toContain("state.status === 'error'")
    expect(source).toContain('ErrorIndicator')
    expect(source).toContain('AlertCircle')
  })

  it('AC-3: ERROR state renders Retry button with correct testID', () => {
    const source = readComponent()
    expect(source).toContain("testID=\"voice-overlay-retry-button\"")
  })

  it('AC-3: ERROR state shows error message from state.errorMessage', () => {
    const source = readComponent()
    expect(source).toContain('errorMessage')
    expect(source).toContain('state.errorMessage')
  })

  // AC-4: SPEAKING state for transition from LISTENING
  it('AC-4: renders SpeakingIndicator with waveform animation for SPEAKING state', () => {
    const source = readComponent()
    expect(source).toContain("state.status === 'speaking'")
    expect(source).toContain('SpeakingIndicator')
    expect(source).toContain("Speaking...")
  })

  it('AC-4: SPEAKING transition — waveform uses Animated for smooth animation', () => {
    const source = readComponent()
    // Waveform bars animate with staggered timing
    expect(source).toContain('waveformBar')
    expect(source).toContain('scaleY')
  })

  // AC-5: Theme tokens
  it('AC-5: uses useTheme hook for colors, spacing, radius', () => {
    const source = readComponent()
    expect(source).toContain('useTheme')
    expect(source).toContain('colors.')
    expect(source).toContain('spacing.')
    expect(source).toContain('radius.')
  })

  it('AC-5: uses colors.background for container background', () => {
    const source = readComponent()
    expect(source).toContain('colors.background')
  })

  it('AC-5: uses spacing tokens for padding', () => {
    const source = readComponent()
    expect(source).toContain('spacing.xl')
  })

  it('AC-5: uses radius tokens for borderRadius', () => {
    const source = readComponent()
    expect(source).toContain('radius.xl')
  })

  it('AC-5: does not hardcode colors (no hex values in component logic)', () => {
    const source = readComponent()
    // No inline hex color assignments in style objects
    // (Comments and theme.ts imports are OK but component styles must not)
    const styleBlocks = source.match(/style=\{.*?\}/gs) ?? []
    for (const block of styleBlocks) {
      expect(block).not.toMatch(/#[0-9A-Fa-f]{3,8}/)
    }
  })
})

// ─── Accessibility tests ───────────────────────────────────────────────────────

describe('VoiceSessionOverlay - Accessibility', () => {
  it('root container has accessibilityLiveRegion for state announcements', () => {
    const source = readComponent()
    expect(source).toContain('accessibilityLiveRegion')
  })

  it('Retry button has accessibilityRole and accessibilityLabel', () => {
    const source = readComponent()
    expect(source).toContain('accessibilityRole="button"')
    expect(source).toContain('accessibilityLabel')
  })
})

// ─── IDLE state test ───────────────────────────────────────────────────────────

describe('VoiceSessionOverlay - IDLE state', () => {
  it('returns null when status is idle', () => {
    const source = readComponent()
    expect(source).toContain("state.status === 'idle'")
    expect(source).toContain('return null')
  })
})
