import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { TypingIndicator } from './TypingIndicator'
import { Text } from '@/components/ui/text'

const meta: Meta<typeof TypingIndicator> = {
  title: 'Chat/TypingIndicator',
  component: TypingIndicator,
  parameters: {
    docs: {
      description: {
        component:
          'Animated typing indicator with pulsing dots. Shows when the agent is processing a message.',
      },
    },
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

export const InChatContext: Story = {
  render: () => (
    <View className="gap-3 p-4 bg-background">
      {/* User message */}
      <View className="items-end px-4 my-1">
        <View className="bg-primary max-w-[75%] rounded-lg p-3">
          <Text className="text-primary-foreground">
            What is the capital of France?
          </Text>
        </View>
      </View>
      {/* Typing indicator */}
      <TypingIndicator />
    </View>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Typing indicator as it appears after a user message, showing the agent is thinking.',
      },
    },
  },
}
