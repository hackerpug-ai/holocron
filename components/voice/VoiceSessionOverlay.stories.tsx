import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { VoiceSessionOverlay } from './VoiceSessionOverlay'
import type { VoiceSessionState } from '@/hooks/use-voice-session-state'

// ─── Mock Factory ──────────────────────────────────────────────────────────────

function makeState(
  status: VoiceSessionState['status'],
  overrides: Partial<VoiceSessionState> = {}
): VoiceSessionState {
  return {
    status,
    sessionId: null,
    conversationId: null,
    errorMessage: null,
    transcript: '',
    isInterrupted: false,
    ...overrides,
  }
}

// ─── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof VoiceSessionOverlay> = {
  title: 'Voice/VoiceSessionOverlay',
  component: VoiceSessionOverlay,
  parameters: {
    docs: {
      description: {
        component:
          'State-driven visual indicator overlay for voice sessions. Shows spinner (connecting), pulsing dot (listening), waveform (speaking), or error with retry button.',
      },
    },
  },
  decorators: [
    (Story) => (
      <View style={{ padding: 32, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        <Story />
      </View>
    ),
  ],
  args: {
    onRetry: () => {},
  },
}

export default meta
type Story = StoryObj<typeof VoiceSessionOverlay>

// ─── Stories ───────────────────────────────────────────────────────────────────

/**
 * CONNECTING state — shows loading spinner with 'Connecting...' label.
 * Uses primary color for both spinner and text.
 */
export const Connecting: Story = {
  args: {
    state: makeState('connecting'),
  },
}

/**
 * LISTENING state — shows pulsing dot animation with 'Listening...' label.
 */
export const Listening: Story = {
  args: {
    state: makeState('listening'),
  },
}

/**
 * SPEAKING state — shows animated waveform bars with 'Speaking...' label.
 * Transitions smoothly from LISTENING state.
 */
export const Speaking: Story = {
  args: {
    state: makeState('speaking'),
  },
}

/**
 * PROCESSING state — shows spinner with 'Processing...' label.
 */
export const Processing: Story = {
  args: {
    state: makeState('processing'),
  },
}

/**
 * ERROR state with message — shows error icon, message text, and Retry button.
 */
export const Error: Story = {
  args: {
    state: makeState('error', { errorMessage: 'No internet connection' }),
    onRetry: () => {},
  },
}

/**
 * ERROR state without error message — uses fallback message.
 */
export const ErrorNoMessage: Story = {
  args: {
    state: makeState('error', { errorMessage: null }),
    onRetry: () => {},
  },
}

/**
 * ERROR state without onRetry — hides the Retry button.
 */
export const ErrorNoRetry: Story = {
  args: {
    state: makeState('error', { errorMessage: 'Connection failed' }),
    onRetry: undefined,
  },
}

/**
 * IDLE state — renders nothing (null).
 */
export const Idle: Story = {
  args: {
    state: makeState('idle'),
  },
}

/**
 * All non-idle states displayed side-by-side for visual comparison.
 */
export const AllStates: Story = {
  render: () => (
    <View style={{ gap: 32, alignItems: 'center' }}>
      {(
        [
          { label: 'Connecting', state: makeState('connecting') },
          { label: 'Listening', state: makeState('listening') },
          { label: 'Speaking', state: makeState('speaking') },
          { label: 'Processing', state: makeState('processing') },
          {
            label: 'Error',
            state: makeState('error', { errorMessage: 'No internet connection' }),
          },
        ] as const
      ).map(({ label, state }) => (
        <VoiceSessionOverlay
          key={label}
          state={state as VoiceSessionState}
          onRetry={() => {}}
          testID={`voice-overlay-${label.toLowerCase()}`}
        />
      ))}
    </View>
  ),
}
