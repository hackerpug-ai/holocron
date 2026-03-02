import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { DrawerContent, type Conversation } from './DrawerContent'

const meta: Meta<typeof DrawerContent> = {
  title: 'Components/DrawerContent',
  component: DrawerContent,
  parameters: {
    docs: {
      description: {
        component:
          'The complete navigation drawer panel content. Composes DrawerHeader and ConversationRow into a scrollable list with header, divider, section label, and conversation rows.',
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
    onConversationPress: {
      action: 'conversation-press',
      description: 'Callback when a conversation is selected',
    },
    onConversationLongPress: {
      action: 'conversation-long-press',
      description: 'Callback when a conversation is long-pressed',
    },
    onNewChatPress: {
      action: 'new-chat-press',
      description: 'Callback when New Chat is pressed',
    },
    onSearchChange: {
      action: 'search-changed',
      description: 'Callback when the search query changes',
    },
  },
  args: {
    conversations: [],
    activeConversationId: undefined,
  },
}

export default meta
type Story = StoryObj<typeof DrawerContent>

/**
 * Default story with 3-4 conversations, one active
 */
export const Default: Story = {
  args: {
    conversations: [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        title: 'Machine Learning Basics',
        lastMessage: 'I found 12 articles matching your query.',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 2),
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        title: 'Research on Transformers',
        lastMessage: 'Here are the top 3 articles about transformer architectures...',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 30),
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440003',
        title: 'API Design Patterns',
        lastMessage: 'Here are the best practices for REST API design...',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
      },
    ] as Conversation[],
    activeConversationId: '550e8400-e29b-41d4-a716-446655440001',
  },
}

/**
 * Empty state with no conversations
 */
export const Empty: Story = {
  args: {
    conversations: [],
  },
}

/**
 * 15+ conversations to test scrolling
 */
export const ManyConversations: Story = {
  args: {
    conversations: Array.from({ length: 18 }, (_, i) => ({
      id: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
      title: `Conversation Topic ${i + 1}: ${['Machine Learning', 'Neural Networks', 'API Design', 'Research Methods', 'Data Science'][i % 5]}`,
      lastMessage: `Last message preview ${i + 1}...`,
      lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * i),
    })) as Conversation[],
    activeConversationId: '550e8400-e29b-41d4-a716-446655440005',
  },
}

/**
 * Active conversation highlighted state
 */
export const ActiveHighlighted: Story = {
  args: {
    conversations: [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        title: 'Machine Learning Basics',
        lastMessage: 'I found 12 articles matching your query.',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 2),
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        title: 'Research on Transformers',
        lastMessage: 'Here are the top 3 articles about transformer architectures...',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 30),
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440003',
        title: 'API Design Patterns',
        lastMessage: 'Here are the best practices for REST API design...',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
      },
    ] as Conversation[],
    activeConversationId: '550e8400-e29b-41d4-a716-446655440002',
  },
}

/**
 * Interactive story with stateful search input
 */
export const Interactive: Story = {
  render: function InteractiveStory() {
    // Mock implementation - stateful wrapper would be in actual usage
    const mockConversations: Conversation[] = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        title: 'Machine Learning Basics',
        lastMessage: 'I found 12 articles matching your query.',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 2),
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        title: 'Research on Transformers',
        lastMessage: 'Here are the top 3 articles about transformer architectures...',
        lastMessageAt: new Date(Date.now() - 1000 * 60 * 30),
      },
    ]

    return (
      <View className="w-72">
        <DrawerContent conversations={mockConversations} activeConversationId="550e8400-e29b-41d4-a716-446655440001" />
      </View>
    )
  },
}
