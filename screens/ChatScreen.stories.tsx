import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { ChatScreen, type ChatMessage } from './ChatScreen'

const meta: Meta<typeof ChatScreen> = {
  title: 'Screens/ChatScreen',
  component: ChatScreen,
  parameters: {
    docs: {
      description: {
        component:
          'The main chat interface screen. Composes ChatBubble, ChatInput, TypingIndicator, SlashCommandMenu, CommandBadge, ResultCard, and ResearchProgress atoms into a full chat experience.',
      },
    },
    viewport: {
      defaultViewport: 'mobile1',
    },
    layout: 'fullscreen',
  },
  argTypes: {
    messages: {
      control: { type: 'object' },
      description: 'Array of chat messages to display',
    },
    isTyping: {
      control: { type: 'boolean' },
      description: 'Whether the agent is currently processing',
    },
    inputDisabled: {
      control: { type: 'boolean' },
      description: 'Whether the input should be disabled',
    },
    onSendMessage: {
      action: 'send-message',
      description: 'Callback when user sends a message',
    },
    onSelectCommand: {
      action: 'select-command',
      description: 'Callback when user selects a slash command',
    },
    onResultPress: {
      action: 'result-press',
      description: 'Callback when a result card is pressed',
    },
    onMenuPress: {
      action: 'menu-press',
      description: 'Callback when the menu button is pressed',
    },
  },
  args: {
    messages: [],
    isTyping: false,
    inputDisabled: false,
  },
}

export default meta
type Story = StoryObj<typeof ChatScreen>

export const Empty: Story = {
  args: {
    messages: [],
  },
}

export const WithConversation: Story = {
  args: {
    messages: [
      {
        id: '1',
        content: 'Can you search for articles about machine learning?',
        sender: 'user',
        timestamp: new Date(2026, 2, 1, 10, 30),
      },
      {
        id: '2',
        content:
          'I found 12 articles about machine learning in your knowledge base. Here are the most relevant ones:',
        sender: 'agent',
        timestamp: new Date(2026, 2, 1, 10, 31),
        results: [
          {
            id: 'r1',
            title: 'Understanding Attention Mechanisms',
            type: 'article',
            category: 'Machine Learning',
            snippet: 'A deep dive into how attention mechanisms work in transformer architectures...',
            confidence: 0.95,
          },
          {
            id: 'r2',
            title: 'Introduction to Neural Networks',
            type: 'article',
            category: 'Deep Learning',
            snippet: 'The fundamentals of neural network architecture and training...',
            confidence: 0.88,
          },
        ],
      },
      {
        id: '3',
        content: 'Thanks! Can you do some research on transformer architectures?',
        sender: 'user',
        timestamp: new Date(2026, 2, 1, 10, 32),
      },
    ] as ChatMessage[],
  },
}

export const WithCommand: Story = {
  args: {
    messages: [
      {
        id: '1',
        content: '/research transformer architectures',
        sender: 'user',
        timestamp: new Date(2026, 2, 1, 10, 30),
        command: {
          name: 'research',
          args: 'transformer architectures',
        },
      },
      {
        id: '2',
        content: 'Starting research on transformer architectures...',
        sender: 'agent',
        timestamp: new Date(2026, 2, 1, 10, 30),
        research: {
          query: 'transformer architectures',
          status: 'searching',
          progress: 35,
          currentIteration: 1,
          totalIterations: 3,
          statusMessage: 'Found 8 sources...',
        },
      },
    ] as ChatMessage[],
  },
}

export const WithTypingIndicator: Story = {
  args: {
    messages: [
      {
        id: '1',
        content: 'What is the latest research on GPT models?',
        sender: 'user',
        timestamp: new Date(2026, 2, 1, 10, 30),
      },
    ] as ChatMessage[],
    isTyping: true,
  },
}

export const WithResearchComplete: Story = {
  args: {
    messages: [
      {
        id: '1',
        content: '/deep-research quantum computing applications',
        sender: 'user',
        timestamp: new Date(2026, 2, 1, 10, 30),
        command: {
          name: 'deep-research',
          args: 'quantum computing applications',
        },
      },
      {
        id: '2',
        content: 'Research complete! Here are the findings:',
        sender: 'agent',
        timestamp: new Date(2026, 2, 1, 10, 35),
        research: {
          query: 'quantum computing applications',
          status: 'complete',
          progress: 100,
          currentIteration: 3,
          totalIterations: 3,
          statusMessage: 'Analyzed 24 sources',
        },
        results: [
          {
            id: 'r1',
            title: 'Quantum Computing in Drug Discovery',
            type: 'research',
            category: 'Healthcare',
            snippet:
              'How quantum algorithms are accelerating molecular simulations for pharmaceutical research...',
            confidence: 0.92,
          },
          {
            id: 'r2',
            title: 'Quantum Cryptography Applications',
            type: 'research',
            category: 'Security',
            snippet:
              'The role of quantum key distribution in securing communications...',
            confidence: 0.89,
          },
        ],
      },
    ] as ChatMessage[],
  },
}

export const InputDisabled: Story = {
  args: {
    messages: [
      {
        id: '1',
        content: 'Processing your request...',
        sender: 'agent',
        timestamp: new Date(2026, 2, 1, 10, 30),
      },
    ] as ChatMessage[],
    inputDisabled: true,
    isTyping: true,
  },
}

export const FullScreen: Story = {
  render: () => (
    <View style={{ height: 600 }}>
      <ChatScreen
        messages={[
          {
            id: '1',
            content: 'Hey, can you help me find research on transformers?',
            sender: 'user',
            timestamp: new Date(2026, 2, 1, 10, 30),
          },
          {
            id: '2',
            content:
              "Of course! I found several articles about transformer architectures. Would you like me to show you the most recent ones?",
            sender: 'agent',
            timestamp: new Date(2026, 2, 1, 10, 31),
          },
          {
            id: '3',
            content: 'Yes please, show me the top 3.',
            sender: 'user',
            timestamp: new Date(2026, 2, 1, 10, 31),
          },
          {
            id: '4',
            content: 'Here are the top 3 articles:',
            sender: 'agent',
            timestamp: new Date(2026, 2, 1, 10, 32),
            results: [
              {
                id: 'r1',
                title: 'Understanding Attention Mechanisms',
                type: 'article',
                snippet: 'A comprehensive guide to attention in transformers...',
                confidence: 0.95,
              },
              {
                id: 'r2',
                title: 'BERT and Beyond: Modern NLP',
                type: 'article',
                snippet: 'Evolution of language models from BERT to GPT...',
                confidence: 0.91,
              },
              {
                id: 'r3',
                title: 'Vision Transformers Explained',
                type: 'article',
                snippet: 'How transformers revolutionized computer vision...',
                confidence: 0.88,
              },
            ],
          },
        ]}
      />
    </View>
  ),
}
