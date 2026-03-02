import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { TypingIndicator } from './TypingIndicator'

const meta: Meta<typeof TypingIndicator> = {
  title: 'Components/TypingIndicator',
  component: TypingIndicator,
  parameters: {
    docs: {
      description: {
        component:
          'Animated typing indicator showing three bouncing dots. Indicates the agent is processing a message.',
      },
    },
  },
  argTypes: {
    visible: {
      control: { type: 'boolean' },
      description: 'Whether the indicator is visible',
    },
  },
  args: {
    visible: true,
  },
  decorators: [
    (Story) => (
      <View className="bg-background p-4">
        <Story />
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof TypingIndicator>

export const Default: Story = {}

export const Hidden: Story = {
  args: {
    visible: false,
  },
}

export const InChatContext: Story = {
  render: () => (
    <View className="gap-3 p-4">
      <View className="bg-primary max-w-[80%] self-end rounded-2xl rounded-br-sm px-4 py-3">
        <View>
          <View className="text-primary-foreground">What is machine learning?</View>
        </View>
      </View>
      <TypingIndicator />
    </View>
  ),
  parameters: {
    docs: {
      description: {
        story: 'The typing indicator as it appears after a user message, while waiting for agent response.',
      },
    },
  },
}
