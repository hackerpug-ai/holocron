import type { Meta, StoryObj } from '@storybook/react'
import { expect } from '@storybook/jest'
import { within, userEvent } from '@storybook/testing-library'
import { View } from 'react-native'
import { ConversationRow } from './ConversationRow'

const meta: Meta<typeof ConversationRow> = {
  title: 'Components/ConversationRow',
  component: ConversationRow,
  parameters: {
    docs: {
      description: {
        component:
          'A row item for the conversation list in the drawer. Shows conversation title, last message preview, and timestamp. Active conversations are highlighted.',
      },
    },
  },
  argTypes: {
    title: {
      control: { type: 'text' },
      description: 'The conversation title',
    },
    lastMessage: {
      control: { type: 'text' },
      description: 'Preview of the last message in the conversation',
    },
    lastMessageAt: {
      control: { type: 'date' },
      description: 'Timestamp of the last message',
    },
    isActive: {
      control: { type: 'boolean' },
      description: 'Whether this is the currently active conversation',
    },
    onPress: {
      action: 'pressed',
      description: 'Callback when the row is tapped',
    },
    onLongPress: {
      action: 'long-pressed',
      description: 'Callback when the row is long-pressed (for management)',
    },
  },
  args: {
    title: 'Research on Transformers',
    lastMessage: 'Here are the top 3 articles about transformer architectures...',
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
    isActive: false,
  },
}

export default meta
type Story = StoryObj<typeof ConversationRow>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Verify the conversation row exists and displays correct content
    const row = canvas.getByTestId('conversation-row')
    await expect(row).toBeTruthy()
    await expect(canvas.getByText('Research on Transformers')).toBeTruthy()
    await expect(canvas.getByText(/Here are the top 3 articles/)).toBeTruthy()
  },
}

export const Active: Story = {
  args: {
    title: 'Machine Learning Basics',
    lastMessage: 'I found 12 articles matching your query.',
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 2), // 2 minutes ago
    isActive: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Verify active conversation row has the title
    await expect(canvas.getByText('Machine Learning Basics')).toBeTruthy()
    await expect(canvas.getByText(/I found 12 articles/)).toBeTruthy()
  },
}

export const LongTitle: Story = {
  args: {
    title: 'Deep Research on Neural Network Architectures and Modern Approaches',
    lastMessage: 'The latest research shows significant improvements in...',
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
  },
}

export const NoLastMessage: Story = {
  args: {
    title: 'New Chat',
    lastMessage: undefined,
    lastMessageAt: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Verify conversation row renders without last message
    await expect(canvas.getByText('New Chat')).toBeTruthy()
    await expect(canvas.getByTestId('conversation-row')).toBeTruthy()
  },
}


export const OldConversation: Story = {
  args: {
    title: 'API Design Patterns',
    lastMessage: 'Here are the best practices for REST API design...',
    lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days ago
  },
}

export const ConversationList: Story = {
  render: () => {
    const conversations = [
      {
        title: 'Machine Learning Basics',
        lastMessage: 'I found 12 articles matching your query.',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 2),
        isActive: true,
      },
      {
        title: 'Research on Transformers',
        lastMessage: 'Here are the top 3 articles about transformer architectures...',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 30),
        isActive: false,
      },
      {
        title: 'API Design Patterns',
        lastMessage: 'Here are the best practices for REST API design...',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
        isActive: false,
      },
      {
        title: 'New Chat',
        lastMessage: undefined,
        lastMessageAt: undefined,
        isActive: false,
      },
    ]

    return (
      <View className="gap-1 p-2">
        {conversations.map((conv, index) => (
          <ConversationRow key={index} {...conv} />
        ))}
      </View>
    )
  },
}
