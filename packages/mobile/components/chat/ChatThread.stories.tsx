import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { ChatThread, type ChatMessage } from './ChatThread'

const meta = {
  title: 'Chat/ChatThread',
  component: ChatThread,
  decorators: [
    (Story) => (
      <View style={{ flex: 1, height: 600 }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof ChatThread>

export default meta
type Story = StoryObj<typeof meta>

// Mock data generators
const generateMessage = (id: number, role: ChatMessage['role'], content: string): ChatMessage => ({
  id: `msg-${id}`,
  role,
  content,
  createdAt: new Date(Date.now() - id * 60000), // Each message 1 minute apart
})

const mockMessages: ChatMessage[] = [
  generateMessage(1, 'system', 'Research session started'),
  generateMessage(2, 'user', 'Can you help me find research on AI agents?'),
  generateMessage(3, 'agent', "I'd be happy to help! Let me search your knowledge base for relevant articles."),
  generateMessage(4, 'agent', 'I found 3 relevant research papers on AI agents. Would you like me to summarize them?'),
  generateMessage(5, 'user', 'Yes please, that would be great!'),
]

const manyMessages: ChatMessage[] = Array.from({ length: 50 }, (_, i) => {
  const role = i % 3 === 0 ? 'system' : i % 2 === 0 ? 'user' : 'agent'
  return generateMessage(
    i,
    role,
    role === 'system'
      ? 'System notification'
      : role === 'user'
      ? `User message ${i}`
      : `Agent response ${i}`
  )
})

// Stories
export const Default: Story = {
  args: {
    messages: mockMessages,
  },
}

export const EmptyState: Story = {
  args: {
    messages: [],
  },
}

export const LoadingState: Story = {
  args: {
    messages: [],
    isLoading: true,
  },
}

export const WithManyMessages: Story = {
  args: {
    messages: manyMessages,
  },
}

export const WithTypingIndicator: Story = {
  args: {
    messages: mockMessages,
    showTypingIndicator: true,
  },
}

export const SingleMessage: Story = {
  args: {
    messages: [generateMessage(1, 'user', 'Hello!')],
  },
}

export const LongMessageContent: Story = {
  args: {
    messages: [
      generateMessage(
        1,
        'agent',
        'This is a very long message with lots of content. '.repeat(20)
      ),
      generateMessage(2, 'user', 'Short message'),
      generateMessage(
        3,
        'system',
        'System message with moderate length content that should wrap nicely'
      ),
    ],
  },
}
