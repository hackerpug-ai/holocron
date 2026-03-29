import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { VoiceAgentOrb } from './VoiceAgentOrb'
import type { VoiceState } from '@/hooks/use-voice-session-state'

// ─── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof VoiceAgentOrb> = {
  title: 'Voice/VoiceAgentOrb',
  component: VoiceAgentOrb,
  parameters: {
    docs: {
      description: {
        component:
          'Animated AI agent visualization with three concentric circles. State-driven animations include: connecting (opacity breathing), listening (reactive pulse), speaking (active breathing + outward pulse), processing (rotation), error (shake), muted (static).',
      },
    },
  },
  decorators: [
    (Story) => (
      <View style={{ padding: 32, alignItems: 'center', justifyContent: 'center', flex: 1, backgroundColor: '#f5f5f5' }}>
        <Story />
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof VoiceAgentOrb>

// ─── Stories ───────────────────────────────────────────────────────────────────

/**
 * CONNECTING state — opacity breathing loop (0.6→1, 1s cycle).
 * Uses primary color.
 */
export const Connecting: Story = {
  args: {
    status: 'connecting',
    size: 160,
  },
}

/**
 * LISTENING state — slow loop when no audio input.
 * Shows pulsing animation on outer ring.
 */
export const Listening: Story = {
  args: {
    status: 'listening',
    size: 160,
  },
}

/**
 * LISTENING state with audio level — reactive pulse to audio input.
 * Higher audioLevel = more pronounced pulse.
 */
export const ListeningWithAudio: Story = {
  args: {
    status: 'listening',
    audioLevel: 0.7,
    size: 160,
  },
}

/**
 * SPEAKING state — active breathing (scale 0.97→1.03, 600ms) + fast outward pulse ring.
 */
export const Speaking: Story = {
  args: {
    status: 'speaking',
    size: 160,
  },
}

/**
 * PROCESSING state — rotateZ loop via interpolate.
 */
export const Processing: Story = {
  args: {
    status: 'processing',
    size: 160,
  },
}

/**
 * ERROR state — shake animation (translateX -6→+6, 3 cycles) + destructive color.
 */
export const Error: Story = {
  args: {
    status: 'error',
    size: 160,
  },
}

/**
 * MUTED state — desaturated color, static (no animation).
 */
export const Muted: Story = {
  args: {
    status: 'muted',
    size: 160,
  },
}

/**
 * Smaller size variant (80dp).
 */
export const Small: Story = {
  args: {
    status: 'listening',
    size: 80,
  },
}

/**
 * Large size variant (240dp).
 */
export const Large: Story = {
  args: {
    status: 'speaking',
    size: 240,
  },
}

/**
 * All non-idle states displayed side-by-side for visual comparison.
 */
export const AllStates: Story = {
  render: () => (
    <View style={{ gap: 24, alignItems: 'center', flexWrap: 'wrap', flexDirection: 'row', justifyContent: 'center' }}>
      {(
        [
          { label: 'Connecting', status: 'connecting' as VoiceState },
          { label: 'Listening', status: 'listening' as VoiceState },
          { label: 'Speaking', status: 'speaking' as VoiceState },
          { label: 'Processing', status: 'processing' as VoiceState },
          { label: 'Error', status: 'error' as VoiceState },
          { label: 'Muted', status: 'muted' as VoiceState },
        ] as const
      ).map(({ label, status }) => (
        <View key={label} style={{ alignItems: 'center', gap: 8 }}>
          <VoiceAgentOrb status={status} size={100} testID={`voice-orb-${label.toLowerCase()}`} />
          {/* <Text variant="small" style={{ color: '#666' }}>{label}</Text> */}
        </View>
      ))}
    </View>
  ),
}
