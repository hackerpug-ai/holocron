import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { PlanExecutionCard } from './PlanExecutionCard'

const meta: Meta<typeof PlanExecutionCard> = {
  title: 'Agent/PlanExecutionCard',
  component: PlanExecutionCard,
  parameters: {
    docs: {
      description: {
        component:
          'Displays live progress of plan execution with progress bar, current step indicator, completed steps with checkmarks, and error states for failed steps. Shows plan title, description, and visual progress tracking.',
      },
    },
  },
  argTypes: {
    title: {
      control: { type: 'text' },
      description: 'Plan title',
    },
    description: {
      control: { type: 'text' },
      description: 'Optional plan description',
    },
    status: {
      control: { type: 'select' },
      options: ['created', 'executing', 'awaiting_approval', 'completed', 'failed', 'cancelled'],
      description: 'Current execution status',
    },
    steps: {
      control: { type: 'object' },
      description: 'Array of execution steps with status',
    },
    currentStepIndex: {
      control: { type: 'number' },
      description: 'Index of currently executing step',
    },
  },
  args: {
    title: 'Research Implementation Plan',
    description: 'Execute deep research on React Native performance optimization',
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
type Story = StoryObj<typeof PlanExecutionCard>

// ── Created state ────────────────────────────────────────────────────────────

export const Created: Story = {
  args: {
    status: 'created',
    steps: [
      { stepIndex: 0, description: 'Search for performance articles', status: 'pending' },
      { stepIndex: 1, description: 'Analyze best practices', status: 'pending' },
      { stepIndex: 2, description: 'Synthesize findings', status: 'pending' },
    ],
    currentStepIndex: undefined,
  },
  parameters: {
    docs: {
      description: {
        story: 'Initial state before execution begins. All steps show as pending with gray circles.',
      },
    },
  },
}

// ── Executing state ──────────────────────────────────────────────────────────

export const Executing: Story = {
  args: {
    status: 'executing',
    steps: [
      { stepIndex: 0, description: 'Search for performance articles', status: 'completed', resultSummary: 'Found 12 relevant articles' },
      { stepIndex: 1, description: 'Analyze best practices', status: 'running' },
      { stepIndex: 2, description: 'Synthesize findings', status: 'pending' },
      { stepIndex: 3, description: 'Generate report', status: 'pending' },
    ],
    currentStepIndex: 1,
  },
  parameters: {
    docs: {
      description: {
        story: 'Active execution state. Shows progress bar, current step with spinner indicator and highlight, completed steps with green checkmarks.',
      },
    },
  },
}

// ── Completed state ──────────────────────────────────────────────────────────

export const Completed: Story = {
  args: {
    status: 'completed',
    steps: [
      { stepIndex: 0, description: 'Search for performance articles', status: 'completed', resultSummary: 'Found 12 relevant articles' },
      { stepIndex: 1, description: 'Analyze best practices', status: 'completed', resultSummary: 'Identified 8 key patterns' },
      { stepIndex: 2, description: 'Synthesize findings', status: 'completed', resultSummary: 'Generated comprehensive analysis' },
      { stepIndex: 3, description: 'Generate report', status: 'completed', resultSummary: 'Report ready for review' },
    ],
    currentStepIndex: undefined,
  },
  parameters: {
    docs: {
      description: {
        story: 'All steps completed successfully. Progress bar shows 100%, green checkmark in header, all steps show as completed with result summaries.',
      },
    },
  },
}

// ── Failed state ─────────────────────────────────────────────────────────────

export const Failed: Story = {
  args: {
    status: 'failed',
    steps: [
      { stepIndex: 0, description: 'Search for performance articles', status: 'completed', resultSummary: 'Found 12 relevant articles' },
      { stepIndex: 1, description: 'Analyze best practices', status: 'failed', errorMessage: 'Rate limit exceeded. Please try again later.' },
      { stepIndex: 2, description: 'Synthesize findings', status: 'pending' },
      { stepIndex: 3, description: 'Generate report', status: 'pending' },
    ],
    currentStepIndex: undefined,
  },
  parameters: {
    docs: {
      description: {
        story: 'Execution failed at step 2. Shows red border, error icon in header, failed step highlighted with error message.',
      },
    },
  },
}

// ── With skipped steps ───────────────────────────────────────────────────────

export const WithSkippedSteps: Story = {
  args: {
    status: 'completed',
    steps: [
      { stepIndex: 0, description: 'Search for performance articles', status: 'completed', resultSummary: 'Found 8 relevant articles' },
      { stepIndex: 1, description: 'Fetch article details', status: 'skipped' },
      { stepIndex: 2, description: 'Analyze best practices', status: 'completed', resultSummary: 'Identified 5 key patterns' },
      { stepIndex: 3, description: 'Generate report', status: 'completed', resultSummary: 'Report ready for review' },
    ],
    currentStepIndex: undefined,
  },
  parameters: {
    docs: {
      description: {
        story: 'Completed execution with some steps skipped. Skipped steps show muted with strikethrough text.',
      },
    },
  },
}

// ── Awaiting approval ─────────────────────────────────────────────────────────

export const AwaitingApproval: Story = {
  args: {
    status: 'awaiting_approval',
    steps: [
      { stepIndex: 0, description: 'Search for performance articles', status: 'completed', resultSummary: 'Found 12 relevant articles' },
      { stepIndex: 1, description: 'Analyze best practices', status: 'awaiting_approval' },
      { stepIndex: 2, description: 'Synthesize findings', status: 'pending' },
      { stepIndex: 3, description: 'Generate report', status: 'pending' },
    ],
    currentStepIndex: 1,
  },
  parameters: {
    docs: {
      description: {
        story: 'Execution paused awaiting user approval for step 2. Shows yellow badge and pending indicator on the awaiting step.',
      },
    },
  },
}

// ── All states overview ───────────────────────────────────────────────────────

export const AllStates: Story = {
  render: () => (
    <View className="gap-4">
      <PlanExecutionCard
        title="Created Plan"
        description="Initial state before execution"
        status="created"
        steps={[
          { stepIndex: 0, description: 'Step 1', status: 'pending' },
          { stepIndex: 1, description: 'Step 2', status: 'pending' },
        ]}
      />

      <PlanExecutionCard
        title="Executing Plan"
        description="Currently running"
        status="executing"
        steps={[
          { stepIndex: 0, description: 'Step 1', status: 'completed', resultSummary: 'Done' },
          { stepIndex: 1, description: 'Step 2', status: 'running' },
          { stepIndex: 2, description: 'Step 3', status: 'pending' },
        ]}
        currentStepIndex={1}
      />

      <PlanExecutionCard
        title="Completed Plan"
        description="All steps finished"
        status="completed"
        steps={[
          { stepIndex: 0, description: 'Step 1', status: 'completed', resultSummary: 'Done' },
          { stepIndex: 1, description: 'Step 2', status: 'completed', resultSummary: 'Done' },
        ]}
      />

      <PlanExecutionCard
        title="Failed Plan"
        description="Execution failed"
        status="failed"
        steps={[
          { stepIndex: 0, description: 'Step 1', status: 'completed', resultSummary: 'Done' },
          { stepIndex: 1, description: 'Step 2', status: 'failed', errorMessage: 'Something went wrong' },
        ]}
      />
    </View>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Vertical stack showing all major states for quick visual comparison.',
      },
    },
  },
}
