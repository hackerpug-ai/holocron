import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { ToolApprovalCard } from './ToolApprovalCard'

const meta: Meta<typeof ToolApprovalCard> = {
  title: 'Agent/ToolApprovalCard',
  component: ToolApprovalCard,
  parameters: {
    docs: {
      description: {
        component:
          'Human-in-the-loop approval card for agent tool calls. Displays the tool name, parameters, optional reasoning, and approve/reject actions when status is pending. Transitions through pending → approved/executing → completed, or pending → rejected.',
      },
    },
  },
  argTypes: {
    approvalId: {
      control: { type: 'text' },
      description: 'Unique identifier for this tool approval request',
    },
    toolName: {
      control: { type: 'text' },
      description: 'Machine-readable tool name',
    },
    toolDisplayName: {
      control: { type: 'text' },
      description: 'Human-readable tool name shown in the header',
    },
    description: {
      control: { type: 'text' },
      description: 'Optional short description of what the tool does',
    },
    reasoning: {
      control: { type: 'text' },
      description: 'Optional agent reasoning shown in a collapsible section',
    },
    status: {
      control: { type: 'select' },
      options: ['pending', 'approved', 'executing', 'completed', 'rejected'],
      description: 'Current lifecycle state of the tool call',
    },
    onApprove: {
      action: 'approved',
      description: 'Callback fired when the user presses Approve',
    },
    onReject: {
      action: 'rejected',
      description: 'Callback fired when the user presses Reject',
    },
  },
  args: {
    approvalId: 'tool_approval_001',
    toolName: 'search_knowledge_base',
    toolDisplayName: 'Search Knowledge Base',
    parameters: { query: 'React Native performance tips', limit: 5 },
    reasoning:
      'The user is asking about performance. Let me search the knowledge base for relevant articles.',
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
type Story = StoryObj<typeof ToolApprovalCard>

// ── Individual status stories ─────────────────────────────────────────────────

export const Pending: Story = {
  args: {
    status: 'pending',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Default state. Approve and Reject buttons are visible. The card border is highlighted to draw the user\'s attention.',
      },
    },
  },
}

export const Approved: Story = {
  args: {
    status: 'approved',
  },
  parameters: {
    docs: {
      description: {
        story:
          'The user approved the tool call. The card shows an executing spinner while the agent runs the tool.',
      },
    },
  },
}

export const Completed: Story = {
  args: {
    status: 'completed',
    resultCardData: {
      results: [
        {
          id: 'doc_001',
          title: 'React Native Performance Optimization',
          snippet:
            'Use FlatList instead of ScrollView for long lists, enable Hermes engine, and leverage the new architecture (Fabric + TurboModules).',
          score: 0.94,
        },
        {
          id: 'doc_002',
          title: 'Memoization in React Native',
          snippet:
            'Avoid overusing useMemo and useCallback — profile first, then optimize only the expensive renders.',
          score: 0.88,
        },
        {
          id: 'doc_003',
          title: 'Image Caching Strategies',
          snippet:
            'Use expo-image for built-in caching and blurhash placeholders to keep the UI fast during image loads.',
          score: 0.81,
        },
      ],
      totalMatches: 3,
      queryTime: 42,
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Tool call finished successfully. A green checkmark and "Completed" label replace the action buttons. Result data is stored on the record.',
      },
    },
  },
}

export const Rejected: Story = {
  args: {
    status: 'rejected',
  },
  parameters: {
    docs: {
      description: {
        story:
          'The user declined the tool call. A muted "Declined" label replaces the action buttons and the agent receives a rejection signal.',
      },
    },
  },
}

export const WithDescription: Story = {
  args: {
    status: 'pending',
    description:
      'Searches the personal knowledge base using semantic similarity to find relevant saved articles.',
  },
  parameters: {
    docs: {
      description: {
        story: 'Pending state with an optional tool description rendered below the tool name.',
      },
    },
  },
}

export const NoParameters: Story = {
  args: {
    status: 'pending',
    toolName: 'list_recent_articles',
    toolDisplayName: 'List Recent Articles',
    parameters: {},
    reasoning: 'The user wants to see recent articles. This tool takes no parameters.',
  },
  parameters: {
    docs: {
      description: {
        story: 'Tool call with no parameters — the parameters section shows a "No parameters" placeholder.',
      },
    },
  },
}

export const NoReasoning: Story = {
  args: {
    status: 'pending',
    reasoning: undefined,
  },
  parameters: {
    docs: {
      description: {
        story: 'Pending state without reasoning — the collapsible reasoning section is hidden entirely.',
      },
    },
  },
}

// ── All states overview ───────────────────────────────────────────────────────

export const AllStates: Story = {
  render: () => (
    <View className="gap-4">
      <ToolApprovalCard
        approvalId="tool_pending"
        toolName="search_knowledge_base"
        toolDisplayName="Search Knowledge Base"
        parameters={{ query: 'React Native performance tips', limit: 5 }}
        reasoning="The user is asking about performance. Let me search the knowledge base for relevant articles."
        status="pending"
        onApprove={() => console.log('approved')}
        onReject={() => console.log('rejected')}
      />

      <ToolApprovalCard
        approvalId="tool_approved"
        toolName="search_knowledge_base"
        toolDisplayName="Search Knowledge Base"
        parameters={{ query: 'React Native performance tips', limit: 5 }}
        reasoning="The user is asking about performance. Let me search the knowledge base for relevant articles."
        status="approved"
      />

      <ToolApprovalCard
        approvalId="tool_completed"
        toolName="search_knowledge_base"
        toolDisplayName="Search Knowledge Base"
        parameters={{ query: 'React Native performance tips', limit: 5 }}
        reasoning="The user is asking about performance. Let me search the knowledge base for relevant articles."
        status="completed"
        resultCardData={{
          results: [
            {
              id: 'doc_001',
              title: 'React Native Performance Optimization',
              snippet: 'Use FlatList instead of ScrollView for long lists.',
              score: 0.94,
            },
          ],
          totalMatches: 1,
          queryTime: 42,
        }}
      />

      <ToolApprovalCard
        approvalId="tool_rejected"
        toolName="search_knowledge_base"
        toolDisplayName="Search Knowledge Base"
        parameters={{ query: 'React Native performance tips', limit: 5 }}
        reasoning="The user is asking about performance. Let me search the knowledge base for relevant articles."
        status="rejected"
      />
    </View>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Vertical stack showing all four terminal states — pending, approved/executing, completed, and rejected — for quick visual comparison.',
      },
    },
  },
}
