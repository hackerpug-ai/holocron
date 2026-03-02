import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { ChatBubble, type ChatRole } from './ChatBubble'

const meta: Meta<typeof ChatBubble> = {
  title: 'Components/ChatBubble',
  component: ChatBubble,
  parameters: {
    docs: {
      description: {
        component:
          'An elegant message bubble with avatar indicators and smooth slide-in animations. User messages appear on the right with primary styling, agent messages on the left with card styling.',
      },
    },
  },
  argTypes: {
    content: {
      control: { type: 'text' },
      description: 'The message content to display',
    },
    sender: {
      control: { type: 'select' },
      options: ['user', 'agent'],
      description: 'Who sent the message (user or agent)',
    },
    timestamp: {
      control: { type: 'date' },
      description: 'When the message was sent',
    },
    isPending: {
      control: { type: 'boolean' },
      description: 'Whether the message is still being sent',
    },
  },
  args: {
    content: 'Hello, how can I help you today?',
    sender: 'agent',
    timestamp: new Date(),
    isPending: false,
  },
  decorators: [
    (Story) => (
      <View className="bg-background min-h-[120px] p-4">
        <Story />
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ChatBubble>

export const Default: Story = {}

export const UserMessage: Story = {
  args: {
    content: 'Can you search for articles about machine learning?',
    sender: 'user',
    timestamp: new Date(),
  },
}

export const AgentMessage: Story = {
  args: {
    content:
      "I found 12 articles about machine learning in your knowledge base. Here are the most relevant ones:",
    sender: 'agent',
    timestamp: new Date(),
  },
}

export const LongMessage: Story = {
  args: {
    content:
      'This is a much longer message that demonstrates how the chat bubble handles text wrapping. The bubble should expand vertically while maintaining a maximum width of 75% of the container. This ensures readability and a clean chat interface with the avatar remaining aligned to the top.',
    sender: 'agent',
  },
}

export const PendingMessage: Story = {
  args: {
    content: 'Sending this message...',
    sender: 'user',
    isPending: true,
  },
}

export const NoTimestamp: Story = {
  args: {
    content: 'A message without a timestamp displayed.',
    sender: 'agent',
    timestamp: undefined,
  },
}

export const Conversation: Story = {
  render: () => {
    const messages: Array<{
      content: string
      sender: ChatRole
      timestamp?: Date
    }> = [
      {
        content: 'Hey, can you help me find research on transformers?',
        sender: 'user',
        timestamp: new Date(2026, 2, 1, 10, 30),
      },
      {
        content:
          "Of course! I found several articles about transformer architectures in your holocron. Would you like me to show you the most recent ones?",
        sender: 'agent',
        timestamp: new Date(2026, 2, 1, 10, 31),
      },
      {
        content: 'Yes please, show me the top 3.',
        sender: 'user',
        // No timestamp - consecutive message from same sender
      },
      {
        content:
          "Here are the top 3 articles:\n\n1. Understanding Attention Mechanisms\n2. BERT and Beyond: Modern NLP\n3. Vision Transformers Explained",
        sender: 'agent',
        timestamp: new Date(2026, 2, 1, 10, 32),
      },
    ]

    return (
      <View className="bg-background gap-4 p-4">
        {messages.map((msg, index) => (
          <ChatBubble key={index} {...msg} />
        ))}
      </View>
    )
  },
}
