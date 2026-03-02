import type { Meta, StoryObj } from '@storybook/react'
import { BookOpen, MessageSquare, Settings, Sparkles } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'
import { ConversationRow } from './ConversationRow'
import { DrawerHeader, type NavSection } from './DrawerHeader'
import { Text } from './ui/text'

const meta: Meta<typeof DrawerHeader> = {
  title: 'Components/DrawerHeader',
  component: DrawerHeader,
  parameters: {
    docs: {
      description: {
        component:
          'The header section of the navigation drawer. Contains a search bar, compose icon button, and app section links (like ChatGPT\'s drawer pattern).',
      },
    },
  },
  argTypes: {
    onSearchChange: {
      action: 'search-changed',
      description: 'Callback when the search query changes',
    },
    onNewChatPress: {
      action: 'new-chat-pressed',
      description: 'Callback when the compose icon is tapped',
    },
  },
  args: {},
}

export default meta
type Story = StoryObj<typeof DrawerHeader>

export const Default: Story = {}

export const WithSearchQuery: Story = {
  args: {
    searchQuery: 'machine learning',
  },
}

export const CustomSections: Story = {
  args: {
    sections: [
      { id: 'holocron', label: 'Holocron', icon: <MessageSquare size={20} className="text-foreground" /> },
      { id: 'articles', label: 'Articles', icon: <BookOpen size={20} className="text-foreground" /> },
      { id: 'agents', label: 'AI Agents', icon: <Sparkles size={20} className="text-foreground" /> },
      { id: 'settings', label: 'Settings', icon: <Settings size={20} className="text-foreground" /> },
    ],
  },
}

export const Interactive: Story = {
  render: function InteractiveStory() {
    const [searchQuery, setSearchQuery] = useState('')

    return (
      <View className="bg-background w-72">
        <DrawerHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <View className="px-3 py-2">
          <Text className="text-muted-foreground text-xs">
            Search: "{searchQuery || '(empty)'}"
          </Text>
        </View>
      </View>
    )
  },
}

export const WithConversationList: Story = {
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
    ]

    const sections: NavSection[] = [
      { id: 'holocron', label: 'Holocron', icon: <MessageSquare size={20} className="text-foreground" /> },
      { id: 'articles', label: 'Articles', icon: <BookOpen size={20} className="text-foreground" /> },
      { id: 'settings', label: 'Settings', icon: <Settings size={20} className="text-foreground" /> },
    ]

    return (
      <View className="bg-background w-72">
        <DrawerHeader sections={sections} />
        {/* Divider */}
        <View className="bg-border mx-3 h-px" />
        {/* Conversations label */}
        <View className="px-5 pt-3 pb-2">
          <Text className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Conversations
          </Text>
        </View>
        <View className="gap-1 px-2">
          {conversations.map((conv, index) => (
            <ConversationRow key={index} {...conv} />
          ))}
        </View>
      </View>
    )
  },
}
