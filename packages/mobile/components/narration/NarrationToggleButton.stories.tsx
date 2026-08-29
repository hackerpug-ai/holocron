import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { NarrationToggleButton } from './NarrationToggleButton'

const meta: Meta<typeof NarrationToggleButton> = {
  title: 'Narration/NarrationToggleButton',
  component: NarrationToggleButton,
  parameters: {
    docs: {
      description: {
        component:
          'A 40x40 circular toggle button that switches between microphone and muted-microphone states. Plays a spring scale animation and medium haptic feedback on press.',
      },
    },
  },
  argTypes: {
    isActive: {
      control: { type: 'boolean' },
      description: 'Whether narration mode is currently active',
    },
    testID: {
      control: { type: 'text' },
      description: 'Test ID for the pressable element',
    },
  },
  args: {
    isActive: false,
    onPress: () => {},
  },
}

export default meta
type Story = StoryObj<typeof NarrationToggleButton>

export const Default: Story = {
  args: {
    isActive: false,
  },
}

export const Active: Story = {
  args: {
    isActive: true,
  },
}

export const BothStates: Story = {
  render: () => (
    <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', padding: 16 }}>
      <NarrationToggleButton isActive={false} onPress={() => {}} testID="narration-inactive" />
      <NarrationToggleButton isActive={true} onPress={() => {}} testID="narration-active" />
    </View>
  ),
}
