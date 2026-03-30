import type { Meta, StoryObj } from '@storybook/react'
import { View, Pressable, Text as RNText } from 'react-native'
import { VoiceAssistantOverlay } from './VoiceAssistantOverlay'
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
    errorKind: null,
    transcript: '',
    transcripts: [],
    isInterrupted: false,
    activeTool: null,
    ...overrides,
  }
}

// ─── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof VoiceAssistantOverlay> = {
  title: 'Voice/VoiceAssistantOverlay',
  component: VoiceAssistantOverlay,
  parameters: {
    docs: {
      description: {
        component:
          'Full-screen voice assistant overlay that composes VoiceAgentOrb, VoiceTranscriptFeed, and VoiceControlBar. Uses React Native Modal with semi-transparent background. Renders null when state.status is "idle". Header shows status label + dismiss button. Center zone has orb. Lower zone has transcript + controls.',
      },
    },
  },
  decorators: [
    (Story) => (
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={{ padding: 16 }}>
          <RNText style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
            VoiceAssistantOverlay Story
          </RNText>
          <RNText style={{ fontSize: 14, color: '#666' }}>
            The overlay renders as a full-screen modal. Tap the buttons below to trigger different states.
          </RNText>
        </View>
        <Story />
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof VoiceAssistantOverlay>

// ─── Stories ───────────────────────────────────────────────────────────────────

/**
 * LISTENING state — orb shows pulsing animation, status shows "Listening".
 */
export const Listening: Story = {
  args: {
    state: makeState('listening'),

    isMuted: false,
    onToggleMute: () => console.log('Toggle mute'),
    onStop: () => console.log('Stop'),
    onDismiss: () => console.log('Dismiss'),
    onRetry: () => console.log('Retry'),
  },
}

/**
 * LISTENING with transcript — shows conversation history below the orb.
 */
export const ListeningWithTranscript: Story = {
  args: {
    state: makeState('listening', {
      transcripts: [
        { role: 'user', content: 'What can you help me with?', timestamp: Date.now() - 5000 },
        { role: 'agent', content: 'I can help you search your knowledge base.', timestamp: Date.now() - 3000 },
      ],
    }),
    isMuted: false,
    onToggleMute: () => console.log('Toggle mute'),
    onStop: () => console.log('Stop'),
    onDismiss: () => console.log('Dismiss'),
  },
}

/**
 * SPEAKING state — orb shows breathing + outward pulse animation.
 */
export const Speaking: Story = {
  args: {
    state: makeState('speaking', {
      transcripts: [
        { role: 'user', content: 'Tell me a joke', timestamp: Date.now() - 3000 },
        { role: 'agent', content: 'Why did the chicken cross the road?', timestamp: Date.now() - 1000 },
      ],
    }),
    isMuted: false,
    onToggleMute: () => console.log('Toggle mute'),
    onStop: () => console.log('Stop'),
    onDismiss: () => console.log('Dismiss'),
  },
}

/**
 * MUTED state — orb shows desaturated color, static.
 */
export const Muted: Story = {
  args: {
    state: makeState('muted'),

    isMuted: true,
    onToggleMute: () => console.log('Toggle mute'),
    onStop: () => console.log('Stop'),
    onDismiss: () => console.log('Dismiss'),
  },
}

/**
 * ERROR state — shows error message and Retry button.
 */
export const Error: Story = {
  args: {
    state: makeState('error', {
      errorMessage: 'No internet connection',
      errorKind: 'service_unavailable',
    }),

    isMuted: false,
    onToggleMute: () => console.log('Toggle mute'),
    onStop: () => console.log('Stop'),
    onDismiss: () => console.log('Dismiss'),
    onRetry: () => console.log('Retry'),
  },
}

/**
 * CONNECTING state — orb shows breathing animation, status shows "Connecting...".
 */
export const Connecting: Story = {
  args: {
    state: makeState('connecting'),

    isMuted: false,
    onToggleMute: () => console.log('Toggle mute'),
    onStop: () => console.log('Stop'),
    onDismiss: () => console.log('Dismiss'),
    onRetry: () => console.log('Retry'),
  },
}

/**
 * IDLE state — renders nothing (null).
 * Useful for testing that the overlay correctly hides when inactive.
 */
export const Idle: Story = {
  args: {
    state: makeState('idle'),

    isMuted: false,
    onToggleMute: () => console.log('Toggle mute'),
    onStop: () => console.log('Stop'),
    onDismiss: () => console.log('Dismiss'),
  },
}

/**
 * Interactive demo with state switching buttons.
 */
export const InteractiveDemo: Story = {
  render: () => {
    const [status, setStatus] = React.useState<'listening' | 'speaking' | 'error' | 'idle'>('listening')
    const [isMuted, setIsMuted] = React.useState(false)

    const state = makeState(status, {
      transcripts: status === 'idle' ? [] : [
        { role: 'user', content: 'Hello!', timestamp: Date.now() - 5000 },
        { role: 'agent', content: 'Hi there! How can I help?', timestamp: Date.now() - 3000 },
      ],
    })

    return (
      <>
        <View style={{ padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Pressable
            onPress={() => setStatus('listening')}
            style={{ padding: 8, backgroundColor: '#e0e0e0', borderRadius: 4 }}
          >
            <RNText>Listening</RNText>
          </Pressable>
          <Pressable
            onPress={() => setStatus('speaking')}
            style={{ padding: 8, backgroundColor: '#e0e0e0', borderRadius: 4 }}
          >
            <RNText>Speaking</RNText>
          </Pressable>
          <Pressable
            onPress={() => setStatus('error')}
            style={{ padding: 8, backgroundColor: '#e0e0e0', borderRadius: 4 }}
          >
            <RNText>Error</RNText>
          </Pressable>
          <Pressable
            onPress={() => setStatus('idle')}
            style={{ padding: 8, backgroundColor: '#e0e0e0', borderRadius: 4 }}
          >
            <RNText>Idle</RNText>
          </Pressable>
          <Pressable
            onPress={() => setIsMuted(!isMuted)}
            style={{ padding: 8, backgroundColor: isMuted ? '#ffcccc' : '#ccffcc', borderRadius: 4 }}
          >
            <RNText>Toggle Mute ({isMuted ? 'On' : 'Off'})</RNText>
          </Pressable>
        </View>
        <VoiceAssistantOverlay
          state={state}
          isMuted={isMuted}
          onToggleMute={() => setIsMuted(!isMuted)}
          onStop={() => console.log('Stop')}
          onDismiss={() => setStatus('idle')}
          onRetry={() => setStatus('listening')}
        />
      </>
    )
  },
}

import React from 'react'
