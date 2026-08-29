import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { VoiceMicButton } from './VoiceMicButton'
import type { VoiceState } from '@/hooks/use-voice-session-state'

const meta: Meta<typeof VoiceMicButton> = {
  title: 'Voice/VoiceMicButton',
  component: VoiceMicButton,
  parameters: {
    docs: {
      description: {
        component:
          'Mic/stop toggle button for starting and stopping voice sessions. Shows mic icon when idle, stop icon when active, and is disabled during connecting.',
      },
    },
  },
  argTypes: {
    voiceState: {
      control: { type: 'select' },
      options: ['idle', 'connecting', 'listening', 'speaking', 'processing', 'error'] satisfies VoiceState[],
      description: 'Current voice session state',
    },
    onStart: { action: 'onStart' },
    onStop: { action: 'onStop' },
  },
  decorators: [
    (Story) => (
      <View className="flex-1 items-center justify-center bg-background p-8">
        <Story />
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof VoiceMicButton>

export const Default: Story = {
  args: {
    voiceState: 'idle',
  },
}

export const Idle: Story = {
  args: {
    voiceState: 'idle',
  },
}

export const Connecting: Story = {
  args: {
    voiceState: 'connecting',
  },
  parameters: {
    docs: {
      description: {
        story: 'Button is disabled and shows reduced opacity during connecting state. Tap does nothing.',
      },
    },
  },
}

export const Listening: Story = {
  args: {
    voiceState: 'listening',
  },
}

export const Speaking: Story = {
  args: {
    voiceState: 'speaking',
  },
}

export const Processing: Story = {
  args: {
    voiceState: 'processing',
  },
}

export const ErrorState: Story = {
  args: {
    voiceState: 'error',
  },
  parameters: {
    docs: {
      description: {
        story: 'Error state shows mic icon and allows retry by pressing.',
      },
    },
  },
}

export const AllVariants: Story = {
  render: () => {
    const states: Array<{ label: string; state: VoiceState }> = [
      { label: 'idle', state: 'idle' },
      { label: 'connecting', state: 'connecting' },
      { label: 'listening', state: 'listening' },
      { label: 'speaking', state: 'speaking' },
      { label: 'processing', state: 'processing' },
      { label: 'error', state: 'error' },
    ]

    return (
      <View className="flex-row flex-wrap items-center justify-center gap-8 bg-background p-8">
        {states.map(({ label, state }) => (
          <View key={state} className="items-center gap-2">
            <VoiceMicButton voiceState={state} onStart={() => {}} onStop={() => {}} />
            <Text className="text-muted-foreground text-xs">{label}</Text>
          </View>
        ))}
      </View>
    )
  },
}
