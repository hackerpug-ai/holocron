import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { DrawerContent } from './DrawerContent'
import type { Conversation } from '@/lib/types/conversations'

const meta: Meta<typeof DrawerContent> = {
  title: 'Screens/DrawerContent',
  component: DrawerContent,
  parameters: {
    docs: {
      description: {
        component:
          'The navigation drawer content. Shows Articles link, New Chat button, and a list of conversations. Composes DrawerHeader and ConversationRow atoms.',
      },
    },
    viewport: {
      defaultViewport: 'mobile1',
    },
    layout: 'fullscreen',
  },
  argTypes: {
    conversations: {
      control: { type: 'object' },
      description: 'Array of conversations to display',
    },
    activeConversationId: {
      control: { type: 'text' },
      description: 'ID of the currently active conversation',
    },
    onArticlesPress: {
      action: 'articles-press',
      description: 'Callback when Articles link is pressed',
    },
    onNewChatPress: {
      action: 'new-chat-press',
      description: 'Callback when New Chat is pressed',
    },
    onConversationPress: {
      action: 'conversation-press',
      description: 'Callback when a conversation is selected',
    },
    onConversationLongPress: {
      action: 'conversation-long-press',
      description: 'Callback when a conversation is long-pressed',
    },
  },
  args: {
    conversations: [],
    activeConversationId: undefined,
  },
}

export default meta
type Story = StoryObj<typeof DrawerContent>

export const Empty: Story = {
  args: {
    conversations: [],
  },
}

export const WithConversations: Story = {
  args: {
    conversations: [
      {
        id: '1',
        title: 'Machine Learning Basics',
        lastMessage: 'I found 12 articles matching your query.',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 2),
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
      },
      {
        id: '2',
        title: 'Research on Transformers',
        lastMessage: 'Here are the top 3 articles about transformer architectures...',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 30),
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
        updatedAt: new Date(Date.now() - 1000 * 60 * 30),
      },
      {
        id: '3',
        title: 'API Design Patterns',
        lastMessage: 'Here are the best practices for REST API design...',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72),
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
      },
      {
        id: '4',
        title: 'New Chat',
        lastMessage: undefined,
        lastMessageAt: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as Conversation[],
    activeConversationId: '1',
  },
}

export const ManyConversations: Story = {
  args: {
    conversations: [
      {
        id: '1',
        title: 'Machine Learning Basics',
        lastMessage: 'I found 12 articles matching your query.',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 2),
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
        updatedAt: new Date(Date.now() - 1000 * 60 * 2),
      },
      {
        id: '2',
        title: 'Research on Transformers',
        lastMessage: 'Here are the top 3 articles...',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 30),
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
        updatedAt: new Date(Date.now() - 1000 * 60 * 30),
      },
      {
        id: '3',
        title: 'API Design Patterns',
        lastMessage: 'REST API best practices...',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72),
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
      },
      {
        id: '4',
        title: 'Quantum Computing',
        lastMessage: 'Research complete with 24 sources...',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 96),
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      },
      {
        id: '5',
        title: 'Neural Network Architectures',
        lastMessage: 'CNN vs RNN comparison...',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 120),
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
      },
      {
        id: '6',
        title: 'Database Optimization',
        lastMessage: 'Index strategies for large tables...',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 72),
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 144),
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 72),
      },
      {
        id: '7',
        title: 'React Native Performance',
        lastMessage: 'Optimization techniques for mobile...',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 96),
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 168),
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 96),
      },
    ] as Conversation[],
    activeConversationId: '2',
  },
}

export const FullHeight: Story = {
  render: () => (
    <View style={{ height: 600 }}>
      <DrawerContent
        conversations={[
          {
            id: '1',
            title: 'Machine Learning Basics',
            lastMessage: 'I found 12 articles matching your query.',
            lastMessageAt: new Date(Date.now() - 1000 * 60 * 2),
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
            updatedAt: new Date(Date.now() - 1000 * 60 * 2),
          },
          {
            id: '2',
            title: 'Research on Transformers',
            lastMessage: 'Here are the top 3 articles about transformer architectures...',
            lastMessageAt: new Date(Date.now() - 1000 * 60 * 30),
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
            updatedAt: new Date(Date.now() - 1000 * 60 * 30),
          },
          {
            id: '3',
            title: 'API Design Patterns',
            lastMessage: 'Here are the best practices for REST API design...',
            lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72),
            updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
          },
        ] as Conversation[]}
        activeConversationId="1"
      />
    </View>
  ),
}
