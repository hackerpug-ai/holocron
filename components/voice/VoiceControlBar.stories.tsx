import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { VoiceControlBar } from './VoiceControlBar'

// ─── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof VoiceControlBar> = {
  title: 'Voice/VoiceControlBar',
  component: VoiceControlBar,
  parameters: {
    docs: {
      description: {
        component:
          'Control buttons for the voice overlay. Two buttons centered in a horizontal row: Mute (left, 52dp), Stop (right, 64dp, primary action). Each button uses 300ms debounce. Mute toggles between Mic/MicOff icons with primary/destructive colors.',
      },
    },
  },
  decorators: [
    (Story) => (
      <View style={{ padding: 32, alignItems: 'center', justifyContent: 'center', flex: 1, backgroundColor: '#f5f5f5' }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24 }}>
          <Story />
        </View>
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof VoiceControlBar>

// ─── Stories ───────────────────────────────────────────────────────────────────

/**
 * Control bar with microphone active (not muted).
 * Mute button shows Mic icon in primary color.
 */
export const Active: Story = {
  args: {
    isMuted: false,
    onToggleMute: () => console.log('Toggle mute'),
    onStop: () => console.log('Stop'),
  },
}

/**
 * Control bar with microphone muted.
 * Mute button shows MicOff icon in destructive color.
 */
export const Muted: Story = {
  args: {
    isMuted: true,
    onToggleMute: () => console.log('Toggle mute'),
    onStop: () => console.log('Stop'),
  },
}

/**
 * Control bar centered in a container (simulating overlay placement).
 */
export const Centered: Story = {
  render: (args) => (
    <View style={{ width: '100%', alignItems: 'center' }}>
      <VoiceControlBar {...args} />
    </View>
  ),
  args: {
    isMuted: false,
    onToggleMute: () => console.log('Toggle mute'),
    onStop: () => console.log('Stop'),
  },
}

/**
 * Both states side-by-side for comparison.
 */
export const BothStates: Story = {
  render: () => (
    <View style={{ gap: 32 }}>
      <View>
        {/* <Text variant="small" style={{ color: '#666', marginBottom: 8 }}>Active (Not Muted)</Text> */}
        <VoiceControlBar
          isMuted={false}
          onToggleMute={() => console.log('Toggle mute')}
          onStop={() => console.log('Stop')}
          testID="control-bar-active"
        />
      </View>
      <View>
        {/* <Text variant="small" style={{ color: '#666', marginBottom: 8 }}>Muted</Text> */}
        <VoiceControlBar
          isMuted={true}
          onToggleMute={() => console.log('Toggle mute')}
          onStop={() => console.log('Stop')}
          testID="control-bar-muted"
        />
      </View>
    </View>
  ),
}
