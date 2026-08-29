import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { IterationTimeline, type IterationTimelineData } from './IterationTimeline'

const meta: Meta<typeof IterationTimeline> = {
  title: 'Deep Research/IterationTimeline',
  component: IterationTimeline,
  parameters: {
    docs: {
      description: {
        component:
          'Displays the research journey timeline with score progression visualization and cost breakdown by model type (GPT-5 vs GPT-5-mini). Shows iteration quality improvement and compute cost allocation.',
      },
    },
  },
  argTypes: {
    iterations: {
      control: { type: 'object' },
      description: 'Array of iteration data with scores, costs, and model types',
    },
    totalCostCents: {
      control: { type: 'number' },
      description: 'Optional total cost override in cents',
    },
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
type Story = StoryObj<typeof IterationTimeline>

const basicIterations: IterationTimelineData[] = [
  {
    iterationNumber: 1,
    coverageScore: 2,
    status: 'completed',
    costCents: 150,
    modelType: 'gpt-5',
    startedAt: new Date('2024-03-01T10:00:00Z'),
    completedAt: new Date('2024-03-01T10:05:00Z'),
  },
  {
    iterationNumber: 2,
    coverageScore: 3,
    status: 'completed',
    costCents: 75,
    modelType: 'gpt-5-mini',
    startedAt: new Date('2024-03-01T10:05:00Z'),
    completedAt: new Date('2024-03-01T10:08:00Z'),
  },
  {
    iterationNumber: 3,
    coverageScore: 4,
    status: 'completed',
    costCents: 80,
    modelType: 'gpt-5-mini',
    startedAt: new Date('2024-03-01T10:08:00Z'),
    completedAt: new Date('2024-03-01T10:11:00Z'),
  },
]

const completeIterations: IterationTimelineData[] = [
  {
    iterationNumber: 1,
    coverageScore: 1,
    status: 'completed',
    costCents: 200,
    modelType: 'gpt-5',
    startedAt: new Date('2024-03-01T10:00:00Z'),
    completedAt: new Date('2024-03-01T10:06:00Z'),
  },
  {
    iterationNumber: 2,
    coverageScore: 2,
    status: 'completed',
    costCents: 85,
    modelType: 'gpt-5-mini',
    startedAt: new Date('2024-03-01T10:06:00Z'),
    completedAt: new Date('2024-03-01T10:09:00Z'),
  },
  {
    iterationNumber: 3,
    coverageScore: 3,
    status: 'completed',
    costCents: 90,
    modelType: 'gpt-5-mini',
    startedAt: new Date('2024-03-01T10:09:00Z'),
    completedAt: new Date('2024-03-01T10:12:00Z'),
  },
  {
    iterationNumber: 4,
    coverageScore: 4,
    status: 'completed',
    costCents: 95,
    modelType: 'gpt-5-mini',
    startedAt: new Date('2024-03-01T10:12:00Z'),
    completedAt: new Date('2024-03-01T10:15:00Z'),
  },
  {
    iterationNumber: 5,
    coverageScore: 5,
    status: 'completed',
    costCents: 180,
    modelType: 'gpt-5',
    startedAt: new Date('2024-03-01T10:15:00Z'),
    completedAt: new Date('2024-03-01T10:20:00Z'),
  },
]

const activeIterations: IterationTimelineData[] = [
  {
    iterationNumber: 1,
    coverageScore: 2,
    status: 'completed',
    costCents: 150,
    modelType: 'gpt-5',
    startedAt: new Date('2024-03-01T10:00:00Z'),
    completedAt: new Date('2024-03-01T10:05:00Z'),
  },
  {
    iterationNumber: 2,
    coverageScore: 3,
    status: 'completed',
    costCents: 75,
    modelType: 'gpt-5-mini',
    startedAt: new Date('2024-03-01T10:05:00Z'),
    completedAt: new Date('2024-03-01T10:08:00Z'),
  },
  {
    iterationNumber: 3,
    coverageScore: null,
    status: 'running',
    modelType: 'gpt-5-mini',
    startedAt: new Date('2024-03-01T10:08:00Z'),
  },
]

const gpt5HeavyIterations: IterationTimelineData[] = [
  {
    iterationNumber: 1,
    coverageScore: 3,
    status: 'completed',
    costCents: 250,
    modelType: 'gpt-5',
    startedAt: new Date('2024-03-01T10:00:00Z'),
    completedAt: new Date('2024-03-01T10:08:00Z'),
  },
  {
    iterationNumber: 2,
    coverageScore: 4,
    status: 'completed',
    costCents: 280,
    modelType: 'gpt-5',
    startedAt: new Date('2024-03-01T10:08:00Z'),
    completedAt: new Date('2024-03-01T10:16:00Z'),
  },
  {
    iterationNumber: 3,
    coverageScore: 5,
    status: 'completed',
    costCents: 320,
    modelType: 'gpt-5',
    startedAt: new Date('2024-03-01T10:16:00Z'),
    completedAt: new Date('2024-03-01T10:24:00Z'),
  },
]

const miniHeavyIterations: IterationTimelineData[] = [
  {
    iterationNumber: 1,
    coverageScore: 2,
    status: 'completed',
    costCents: 50,
    modelType: 'gpt-5-mini',
    startedAt: new Date('2024-03-01T10:00:00Z'),
    completedAt: new Date('2024-03-01T10:03:00Z'),
  },
  {
    iterationNumber: 2,
    coverageScore: 3,
    status: 'completed',
    costCents: 55,
    modelType: 'gpt-5-mini',
    startedAt: new Date('2024-03-01T10:03:00Z'),
    completedAt: new Date('2024-03-01T10:06:00Z'),
  },
  {
    iterationNumber: 3,
    coverageScore: 4,
    status: 'completed',
    costCents: 60,
    modelType: 'gpt-5-mini',
    startedAt: new Date('2024-03-01T10:06:00Z'),
    completedAt: new Date('2024-03-01T10:09:00Z'),
  },
  {
    iterationNumber: 4,
    coverageScore: 4,
    status: 'completed',
    costCents: 150,
    modelType: 'gpt-5',
    startedAt: new Date('2024-03-01T10:09:00Z'),
    completedAt: new Date('2024-03-01T10:14:00Z'),
  },
]

export const Default: Story = {
  args: {
    iterations: basicIterations,
  },
}

export const CompleteJourney: Story = {
  args: {
    iterations: completeIterations,
  },
  parameters: {
    docs: {
      description: {
        story: 'A complete research journey from poor (1) to excellent (5) coverage across 5 iterations.',
      },
    },
  },
}

export const ActiveResearch: Story = {
  args: {
    iterations: activeIterations,
  },
  parameters: {
    docs: {
      description: {
        story: 'Research in progress with the third iteration currently running (no score yet).',
      },
    },
  },
}

export const GPT5Heavy: Story = {
  args: {
    iterations: gpt5HeavyIterations,
  },
  parameters: {
    docs: {
      description: {
        story: 'Research using primarily GPT-5 for all iterations. Shows higher costs but faster convergence.',
      },
    },
  },
}

export const MiniHeavy: Story = {
  args: {
    iterations: miniHeavyIterations,
  },
  parameters: {
    docs: {
      description: {
        story: 'Cost-optimized research using GPT-5-mini for early iterations, with GPT-5 for final synthesis.',
      },
    },
  },
}

export const SingleIteration: Story = {
  args: {
    iterations: [
      {
        iterationNumber: 1,
        coverageScore: 5,
        status: 'completed',
        costCents: 180,
        modelType: 'gpt-5',
        startedAt: new Date('2024-03-01T10:00:00Z'),
        completedAt: new Date('2024-03-01T10:05:00Z'),
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story: 'Research that achieved excellent coverage in a single iteration (rare but possible).',
      },
    },
  },
}

export const WithoutCostData: Story = {
  args: {
    iterations: [
      {
        iterationNumber: 1,
        coverageScore: 2,
        status: 'completed',
      },
      {
        iterationNumber: 2,
        coverageScore: 4,
        status: 'completed',
      },
      {
        iterationNumber: 3,
        coverageScore: 5,
        status: 'completed',
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story: 'Timeline without cost data - only shows score progression.',
      },
    },
  },
}

export const MixedProgress: Story = {
  args: {
    iterations: [
      {
        iterationNumber: 1,
        coverageScore: 3,
        status: 'completed',
        costCents: 150,
        modelType: 'gpt-5',
      },
      {
        iterationNumber: 2,
        coverageScore: 2,
        status: 'completed',
        costCents: 70,
        modelType: 'gpt-5-mini',
      },
      {
        iterationNumber: 3,
        coverageScore: 4,
        status: 'completed',
        costCents: 85,
        modelType: 'gpt-5-mini',
      },
      {
        iterationNumber: 4,
        coverageScore: 5,
        status: 'completed',
        costCents: 180,
        modelType: 'gpt-5',
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story: 'Non-linear progression where score temporarily decreased before improving.',
      },
    },
  },
}

export const MaxIterations: Story = {
  args: {
    iterations: [
      {
        iterationNumber: 1,
        coverageScore: 1,
        status: 'completed',
        costCents: 180,
        modelType: 'gpt-5',
      },
      {
        iterationNumber: 2,
        coverageScore: 2,
        status: 'completed',
        costCents: 65,
        modelType: 'gpt-5-mini',
      },
      {
        iterationNumber: 3,
        coverageScore: 2,
        status: 'completed',
        costCents: 70,
        modelType: 'gpt-5-mini',
      },
      {
        iterationNumber: 4,
        coverageScore: 3,
        status: 'completed',
        costCents: 75,
        modelType: 'gpt-5-mini',
      },
      {
        iterationNumber: 5,
        coverageScore: 3,
        status: 'completed',
        costCents: 80,
        modelType: 'gpt-5-mini',
      },
      {
        iterationNumber: 6,
        coverageScore: 4,
        status: 'completed',
        costCents: 85,
        modelType: 'gpt-5-mini',
      },
      {
        iterationNumber: 7,
        coverageScore: 4,
        status: 'completed',
        costCents: 190,
        modelType: 'gpt-5',
      },
      {
        iterationNumber: 8,
        coverageScore: 5,
        status: 'completed',
        costCents: 200,
        modelType: 'gpt-5',
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story: 'Maximum iterations scenario showing gradual improvement across 8 iterations.',
      },
    },
  },
}

export const HighCostResearch: Story = {
  args: {
    iterations: completeIterations,
    totalCostCents: 1000,
  },
  parameters: {
    docs: {
      description: {
        story: 'Research with explicit total cost override (useful for including additional fees).',
      },
    },
  },
}

export const AllVariants: Story = {
  render: () => (
    <View style={{ gap: 16 }}>
      <IterationTimeline iterations={basicIterations} />
      <IterationTimeline iterations={activeIterations} />
      <IterationTimeline iterations={miniHeavyIterations} />
    </View>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Display multiple timeline variants showing different research patterns.',
      },
    },
  },
}
