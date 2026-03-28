import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { PlanConfirmationCard } from './PlanConfirmationCard'
import type { PlanStep, PlanType, PlanStatus } from '@/lib/types/plan-cards'

const meta: Meta<typeof PlanConfirmationCard> = {
  title: 'Agent/PlanConfirmationCard',
  component: PlanConfirmationCard,
  parameters: {
    docs: {
      description: {
        component:
          'Plan confirmation card for user approval before execution. Displays plan title, description, steps with metadata, and approve/reject/modify actions when status is pending_approval. Supports deep-research, shop, assimilation, and agent plan types.',
      },
    },
  },
  argTypes: {
    planId: {
      control: { type: 'text' },
      description: 'Unique identifier for the plan',
    },
    planType: {
      control: { type: 'select' },
      options: ['deep-research', 'shop', 'assimilation', 'agent'],
      description: 'Type of plan to execute',
    },
    title: {
      control: { type: 'text' },
      description: 'Plan title displayed in the header',
    },
    description: {
      control: { type: 'text' },
      description: 'Optional plan description',
    },
    status: {
      control: { type: 'select' },
      options: [
        'created',
        'pending_approval',
        'approved',
        'executing',
        'in_progress',
        'completed',
        'failed',
        'cancelled',
        'rejected',
      ],
      description: 'Current lifecycle state of the plan',
    },
    steps: {
      control: { type: 'object' },
      description: 'Array of plan steps to execute',
    },
    estimatedTimeSeconds: {
      control: { type: 'number' },
      description: 'Estimated execution time in seconds',
    },
    estimatedCostUsd: {
      control: { type: 'number' },
      description: 'Estimated cost in USD',
    },
    onApprove: {
      action: 'approved',
      description: 'Callback fired when the user presses Approve',
    },
    onReject: {
      action: 'rejected',
      description: 'Callback fired when the user presses Reject',
    },
    onModify: {
      action: 'modify',
      description: 'Callback fired when the user presses Modify',
    },
  },
  args: {
    planId: 'plan_001',
    planType: 'deep-research' as PlanType,
    title: 'Research AI Performance Optimization',
    description:
      'Investigate the latest techniques for optimizing AI model performance in production environments.',
    status: 'pending_approval' as PlanStatus,
    steps: [
      {
        stepIndex: 0,
        description: 'Search for recent papers on AI model optimization',
        status: 'pending',
        requiresApproval: false,
      },
      {
        stepIndex: 1,
        description: 'Analyze quantization techniques',
        status: 'pending',
        requiresApproval: true,
        toolDisplayName: 'Analysis Tool',
      },
      {
        stepIndex: 2,
        description: 'Compile findings into comprehensive report',
        status: 'pending',
        requiresApproval: false,
      },
    ],
    estimatedTimeSeconds: 180,
    estimatedCostUsd: 0.15,
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
type Story = StoryObj<typeof PlanConfirmationCard>

// ── Plan type stories ─────────────────────────────────────────────────

export const DeepResearchPlan: Story = {
  args: {
    planType: 'deep-research',
    title: 'Research Quantum Computing Applications',
    description:
      'Explore current applications of quantum computing in cryptography and optimization problems.',
    steps: [
      {
        stepIndex: 0,
        description: 'Search academic databases for quantum cryptography papers',
        status: 'pending',
        requiresApproval: false,
      },
      {
        stepIndex: 1,
        description: 'Analyze quantum optimization algorithms',
        status: 'pending',
        requiresApproval: false,
      },
      {
        stepIndex: 2,
        description: 'Synthesize findings into summary report',
        status: 'pending',
        requiresApproval: false,
      },
    ],
    estimatedTimeSeconds: 300,
    estimatedCostUsd: 0.25,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Deep research plan type with multiple steps, estimated time, and cost.',
      },
    },
  },
}

export const ShopPlan: Story = {
  args: {
    planType: 'shop',
    title: 'Find Mechanical Keyboard',
    description:
      'Search for mechanical keyboards with specific features across multiple retailers.',
    steps: [
      {
        stepIndex: 0,
        description: 'Search Amazon for mechanical keyboards',
        status: 'pending',
        requiresApproval: false,
        toolDisplayName: 'Amazon Search',
      },
      {
        stepIndex: 1,
        description: 'Search eBay for deals',
        status: 'pending',
        requiresApproval: false,
        toolDisplayName: 'eBay Search',
      },
      {
        stepIndex: 2,
        description: 'Compare prices and compile best options',
        status: 'pending',
        requiresApproval: false,
      },
    ],
    estimatedTimeSeconds: 45,
    estimatedCostUsd: 0.05,
    metadata: {
      retailers: ['Amazon', 'eBay', 'Best Buy'],
      max_results: 20,
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shop plan type with retailer metadata and multiple search steps.',
      },
    },
  },
}

export const AssimilationPlan: Story = {
  args: {
    planType: 'assimilation',
    title: 'Analyze Repository: react-native-reusables',
    description:
      'Comprehensive analysis of the React Native Reusables library architecture.',
    steps: [
      {
        stepIndex: 0,
        description: 'Analyze architecture patterns',
        status: 'pending',
        requiresApproval: false,
      },
      {
        stepIndex: 1,
        description: 'Review documentation quality',
        status: 'pending',
        requiresApproval: false,
      },
      {
        stepIndex: 2,
        description: 'Examine dependency structure',
        status: 'pending',
        requiresApproval: false,
      },
      {
        stepIndex: 3,
        description: 'Evaluate test coverage',
        status: 'pending',
        requiresApproval: false,
      },
      {
        stepIndex: 4,
        description: 'Assess design patterns',
        status: 'pending',
        requiresApproval: false,
      },
    ],
    estimatedTimeSeconds: 600,
    estimatedCostUsd: 1.5,
    metadata: {
      profile: 'thorough',
      dimensions: 5,
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Assimilation plan type with dimension analysis and thorough profile.',
      },
    },
  },
}

export const AgentPlan: Story = {
  args: {
    planType: 'agent',
    title: 'Set up Development Environment',
    description:
      'Configure the local development environment for React Native project.',
    steps: [
      {
        stepIndex: 0,
        description: 'Check Node.js version',
        status: 'pending',
        requiresApproval: false,
        toolDisplayName: 'Version Check',
      },
      {
        stepIndex: 1,
        description: 'Install dependencies',
        status: 'pending',
        requiresApproval: false,
        toolDisplayName: 'Package Manager',
      },
      {
        stepIndex: 2,
        description: 'Configure environment variables',
        status: 'pending',
        requiresApproval: true,
        toolDisplayName: 'Config Editor',
      },
    ],
    estimatedTimeSeconds: 60,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Agent plan type with mixed approval requirements and tool display names.',
      },
    },
  },
}

// ── Status stories ─────────────────────────────────────────────────────

export const PendingApproval: Story = {
  args: {
    status: 'pending_approval',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Default state awaiting user approval. Approve, Modify, and Reject buttons are visible. The card border is highlighted to draw attention.',
      },
    },
  },
}

export const Executing: Story = {
  args: {
    status: 'executing',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Plan is currently executing. Shows a loading spinner and "Executing plan..." message. Action buttons are hidden.',
      },
    },
  },
}

export const Completed: Story = {
  args: {
    status: 'completed',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Plan completed successfully. Shows a green checkmark and success message. No action buttons.',
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
          'Plan was rejected by the user. Shows a muted "Plan rejected" message. No action buttons.',
      },
    },
  },
}

// ── Special cases ─────────────────────────────────────────────────────

export const WithApprovalSteps: Story = {
  args: {
    steps: [
      {
        stepIndex: 0,
        description: 'Initial data collection',
        status: 'pending',
        requiresApproval: false,
      },
      {
        stepIndex: 1,
        description: 'Execute privileged operation',
        status: 'pending',
        requiresApproval: true,
        toolDisplayName: 'Privileged Tool',
      },
      {
        stepIndex: 2,
        description: 'Finalize results',
        status: 'pending',
        requiresApproval: false,
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Plan with mixed approval requirements. Steps requiring approval show a warning indicator.',
      },
    },
  },
}

export const WithoutMetadata: Story = {
  args: {
    estimatedTimeSeconds: undefined,
    estimatedCostUsd: undefined,
    metadata: undefined,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Plan without metadata fields. Only the steps section is displayed.',
      },
    },
  },
}

export const LongPlan: Story = {
  args: {
    title: 'Comprehensive System Migration',
    description:
      'Multi-phase migration plan with extensive step list.',
    steps: Array.from({ length: 15 }, (_, i) => ({
      stepIndex: i,
      description: `Migration step ${i + 1}: ${['Backup data', 'Run tests', 'Deploy changes', 'Verify results'][i % 4]}`,
      status: 'pending' as const,
      requiresApproval: i % 5 === 0,
      toolDisplayName: i % 3 === 0 ? `Tool ${i + 1}` : undefined,
    })),
    estimatedTimeSeconds: 3600,
    estimatedCostUsd: 5.0,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Plan with many steps to demonstrate scrollable step list behavior.',
      },
    },
  },
}

// ── All states overview ────────────────────────────────────────────────

export const AllStates: Story = {
  render: () => (
    <View className="gap-4">
      <PlanConfirmationCard
        planId="plan_pending"
        planType="deep-research"
        title="Pending Plan"
        status="pending_approval"
        steps={[
          {
            stepIndex: 0,
            description: 'Step 1',
            status: 'pending',
            requiresApproval: false,
          },
        ]}
        onApprove={() => console.log('approved')}
        onReject={() => console.log('rejected')}
      />

      <PlanConfirmationCard
        planId="plan_executing"
        planType="shop"
        title="Executing Plan"
        status="executing"
        steps={[
          {
            stepIndex: 0,
            description: 'Step 1',
            status: 'running',
            requiresApproval: false,
          },
        ]}
      />

      <PlanConfirmationCard
        planId="plan_completed"
        planType="assimilation"
        title="Completed Plan"
        status="completed"
        steps={[
          {
            stepIndex: 0,
            description: 'Step 1',
            status: 'completed',
            requiresApproval: false,
          },
        ]}
      />

      <PlanConfirmationCard
        planId="plan_rejected"
        planType="agent"
        title="Rejected Plan"
        status="rejected"
        steps={[
          {
            stepIndex: 0,
            description: 'Step 1',
            status: 'pending',
            requiresApproval: false,
          },
        ]}
      />
    </View>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Vertical stack showing all major states — pending approval, executing, completed, and rejected — for quick visual comparison.',
      },
    },
  },
}

// ── Interactive test with play function ────────────────────────────────

export const InteractiveApproval: Story = {
  args: {
    status: 'pending_approval',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Interactive story that demonstrates the approve/reject/modify button behavior. Use the Interaction panel to trigger actions.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    // This is a placeholder for interactive testing
    // In a real setup, you would use @storybook/test to interact with the component
    console.log('PlanConfirmationCard interactive test loaded')
  },
}
