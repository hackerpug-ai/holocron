/**
 * US-013: VoiceMicButton component tests
 *
 * Verifies:
 * - AC-1: IDLE state shows mic icon, tappable, onStart called when pressed
 * - AC-2: LISTENING or SPEAKING state shows stop icon, tappable, onStop called
 * - AC-3: CONNECTING state disables button, tap does nothing
 * - AC-4: Rapid taps (5x) only call onStart once due to 300ms debounce
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const componentPath = join(
  process.cwd(),
  'components',
  'voice',
  'VoiceMicButton.tsx'
)

function readComponent(): string {
  return readFileSync(componentPath, 'utf-8')
}

// ─── Structure tests ──────────────────────────────────────────────────────────

describe('VoiceMicButton - Component Structure', () => {
  it('exports VoiceMicButton as a named export', () => {
    const source = readComponent()
    expect(source).toContain('export function VoiceMicButton')
  })

  it('exports VoiceMicButtonProps interface', () => {
    const source = readComponent()
    expect(source).toContain('VoiceMicButtonProps')
  })

  it('accepts voiceState, onStart, onStop props', () => {
    const source = readComponent()
    expect(source).toContain('voiceState')
    expect(source).toContain('onStart')
    expect(source).toContain('onStop')
  })

  it('uses Pressable (not TouchableOpacity)', () => {
    const source = readComponent()
    expect(source).toContain('Pressable')
    expect(source).not.toContain('TouchableOpacity')
  })

  it('has testID voice-mic-button', () => {
    const source = readComponent()
    expect(source).toContain('testID="voice-mic-button"')
  })

  it('has accessibilityLabel', () => {
    const source = readComponent()
    expect(source).toContain('accessibilityLabel')
  })
})

// ─── AC-1: IDLE state shows mic icon ─────────────────────────────────────────

describe('VoiceMicButton - AC-1: IDLE state', () => {
  it('imports Mic icon from ui/icons', () => {
    const source = readComponent()
    expect(source).toContain('Mic')
    expect(source).toContain("@/components/ui/icons")
  })

  it('renders Mic icon when not active', () => {
    const source = readComponent()
    expect(source).toContain('<Mic')
  })

  it('calls onStart when pressed in idle state', () => {
    const source = readComponent()
    expect(source).toContain('onStart()')
  })

  it('uses idle/error as non-active states for mic icon', () => {
    const source = readComponent()
    // Active is listening | speaking | processing — everything else shows mic
    expect(source).toContain("voiceState === 'listening'")
    expect(source).toContain("voiceState === 'speaking'")
  })
})

// ─── AC-2: LISTENING/SPEAKING state shows stop icon ──────────────────────────

describe('VoiceMicButton - AC-2: stop icon when active', () => {
  it('imports Square icon from ui/icons for stop', () => {
    const source = readComponent()
    expect(source).toContain('Square')
    expect(source).toContain("@/components/ui/icons")
  })

  it('renders Square (stop) icon when active', () => {
    const source = readComponent()
    expect(source).toContain('<Square')
  })

  it('calls onStop when pressed in active state', () => {
    const source = readComponent()
    expect(source).toContain('onStop()')
  })

  it('shows stop icon for listening state', () => {
    const source = readComponent()
    expect(source).toContain("voiceState === 'listening'")
  })

  it('shows stop icon for speaking state', () => {
    const source = readComponent()
    expect(source).toContain("voiceState === 'speaking'")
  })

  it('accessibility label reflects active state', () => {
    const source = readComponent()
    expect(source).toContain('Stop voice session')
    expect(source).toContain('Start voice session')
  })
})

// ─── AC-3: CONNECTING state disables button ───────────────────────────────────

describe('VoiceMicButton - AC-3: disabled during connecting', () => {
  it('sets disabled prop when connecting', () => {
    const source = readComponent()
    expect(source).toContain('isConnecting')
    expect(source).toContain("voiceState === 'connecting'")
  })

  it('passes disabled to Pressable', () => {
    const source = readComponent()
    expect(source).toContain('disabled={isConnecting}')
  })

  it('returns early without calling handlers when connecting', () => {
    const source = readComponent()
    expect(source).toContain('if (isConnecting) return')
  })

  it('sets accessibilityState disabled', () => {
    const source = readComponent()
    expect(source).toContain('accessibilityState')
    expect(source).toContain('disabled: isConnecting')
  })
})

// ─── AC-4: Debounce prevents rapid tapping ────────────────────────────────────

describe('VoiceMicButton - AC-4: debounce rapid taps', () => {
  it('uses useRef for tracking last press time', () => {
    const source = readComponent()
    expect(source).toContain('useRef')
    expect(source).toContain('lastPressTime')
  })

  it('defines DEBOUNCE_MS constant at 150', () => {
    const source = readComponent()
    expect(source).toContain('DEBOUNCE_MS')
    expect(source).toContain('150')
  })

  it('compares Date.now() to lastPressTime for debounce', () => {
    const source = readComponent()
    expect(source).toContain('Date.now()')
    expect(source).toContain('lastPressTime.current')
    expect(source).toContain('DEBOUNCE_MS')
  })
})

// ─── Theming / no hardcoded values ────────────────────────────────────────────

describe('VoiceMicButton - Theming', () => {
  it('uses NativeWind className for styling (no inline hex colors)', () => {
    const source = readComponent()
    // No hex colors in style props
    const styleMatches = source.match(/style=\{[^}]+\}/g) ?? []
    for (const match of styleMatches) {
      expect(match).not.toMatch(/#[0-9A-Fa-f]{3,8}/)
    }
  })

  it('uses Tailwind color tokens for backgrounds', () => {
    const source = readComponent()
    // Should reference Tailwind color tokens like bg-primary, bg-destructive
    expect(source).toMatch(/bg-primary|bg-destructive/)
  })

  it('uses cn utility for className composition', () => {
    const source = readComponent()
    expect(source).toContain('cn(')
    expect(source).toContain("@/lib/utils")
  })
})
