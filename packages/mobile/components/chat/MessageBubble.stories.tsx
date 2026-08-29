import type { Meta, StoryObj } from '@storybook/react'
import { expect } from '@storybook/jest'
import { within } from '@storybook/testing-library'
import { View } from 'react-native'
import { MessageBubble } from './MessageBubble'

const meta = {
  title: 'Chat/MessageBubble',
  component: MessageBubble,
  decorators: [
    (Story) => (
      <View className="w-full bg-background p-4">
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof MessageBubble>

export default meta
type Story = StoryObj<typeof meta>

// AC-1: User message with right alignment and primary background
export const UserMessage: Story = {
  args: {
    role: 'user',
    content: 'Hello! Can you help me with something?',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByTestId('message-bubble')).toBeTruthy()
    await expect(canvas.getByText('Hello! Can you help me with something?')).toBeTruthy()
  },
}

// AC-2: Agent message with left alignment and muted background
export const AgentMessage: Story = {
  args: {
    role: 'agent',
    content: 'Of course! I\'d be happy to help you. What do you need assistance with?',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByTestId('message-bubble')).toBeTruthy()
    await expect(canvas.getByText('Of course! I\'d be happy to help you. What do you need assistance with?')).toBeTruthy()
  },
}

// AC-3: System message with centered alignment and subtle styling
export const SystemMessage: Story = {
  args: {
    role: 'system',
    content: 'Conversation started',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByTestId('message-bubble')).toBeTruthy()
    await expect(canvas.getByText('Conversation started')).toBeTruthy()
  },
}

// AC-4: Long content that wraps properly
export const LongContent: Story = {
  args: {
    role: 'agent',
    content: `This is a much longer message that should demonstrate how the message bubble handles content that spans multiple lines. The bubble should expand vertically to accommodate all the content while maintaining proper width constraints.

Additionally, this message contains multiple paragraphs to show how the component handles more complex text structures. The styling should remain consistent across all the content.

Here's a third paragraph to really test the vertical expansion capabilities of the message bubble component.`,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByTestId('message-bubble')).toBeTruthy()
  },
}

// AC-5: Message with timestamp
export const WithTimestamp: Story = {
  args: {
    role: 'user',
    content: 'This message has a timestamp',
    createdAt: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
    showTimestamp: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByTestId('message-bubble')).toBeTruthy()
    await expect(canvas.getByTestId('message-bubble-timestamp')).toBeTruthy()
  },
}

// Additional story: Timestamp variations
export const RecentMessage: Story = {
  args: {
    role: 'agent',
    content: 'Just sent this message',
    createdAt: new Date(Date.now() - 1000 * 30), // 30 seconds ago
    showTimestamp: true,
  },
}

export const TodayMessage: Story = {
  args: {
    role: 'user',
    content: 'Sent earlier today',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    showTimestamp: true,
  },
}

export const OldMessage: Story = {
  args: {
    role: 'agent',
    content: 'This is from a few days ago',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days ago
    showTimestamp: true,
  },
}

// AC-6: All variants in one view
export const AllVariants: Story = {
  args: {
    role: 'user',
    content: '',
  },
  render: () => (
    <View className="gap-4">
      <MessageBubble
        role="user"
        content="User message with primary background, aligned right"
        testID="user-variant"
      />
      <MessageBubble
        role="agent"
        content="Agent message with muted background, aligned left"
        testID="agent-variant"
      />
      <MessageBubble
        role="system"
        content="System message centered with subtle styling"
        testID="system-variant"
      />
    </View>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByTestId('user-variant')).toBeTruthy()
    await expect(canvas.getByTestId('agent-variant')).toBeTruthy()
    await expect(canvas.getByTestId('system-variant')).toBeTruthy()
  },
}
