import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { IterationSummaryCard } from './IterationSummaryCard'
import type { DeepResearchIteration } from '@/lib/types/deep-research'

const meta = {
  title: 'Deep Research/IterationSummaryCard',
  component: IterationSummaryCard,
  parameters: {
    docs: {
      description: {
        component:
          'Displays a comprehensive summary of a deep research iteration with GPT-5-mini parallel worker indicators, research findings preview, coverage score visualization, and agent coordination status.',
      },
    },
  },
  argTypes: {
    iteration: {
      description: 'Deep research iteration data',
    },
    workers: {
      description: 'Array of worker statuses for parallel processing (max 5 for GPT-5-mini)',
    },
    coordinationPhase: {
      control: { type: 'select' },
      options: ['idle', 'distributing', 'working', 'aggregating', 'complete'],
      description: 'Agent coordination phase',
    },
    isActive: {
      control: { type: 'boolean' },
      description: 'Whether this iteration is currently active',
    },
    defaultExpanded: {
      control: { type: 'boolean' },
      description: 'Whether the card is initially expanded',
    },
  },
  decorators: [
    (Story) => (
      <View className="bg-background p-4">
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof IterationSummaryCard>

export default meta
type Story = StoryObj<typeof meta>

// Sample iteration data
const sampleIteration: DeepResearchIteration = {
  id: 'iter-1',
  sessionId: 'session-1',
  iterationNumber: 1,
  coverageScore: 75,
  feedback: 'Good coverage of basic concepts, but missing recent developments in the field.',
  refinedQueries: [
    'What are the latest transformer architecture improvements in 2024?',
    'How do modern RAG systems handle context window limitations?',
    'What are the performance benchmarks for GPT-5 vs GPT-4?',
  ],
  findings:
    'The research uncovered significant advances in transformer architectures, with attention mechanisms becoming more efficient through sparse attention patterns. Modern implementations show 40% improvement in inference speed while maintaining accuracy. Key developments include: Flash Attention 2.0, grouped query attention, and multi-query attention patterns that reduce memory bandwidth requirements.',
  status: 'completed',
  createdAt: new Date('2026-03-05T10:00:00Z').getTime(),
  updatedAt: new Date('2026-03-05T10:15:00Z').getTime(),
}

const longFindings = `The research uncovered significant advances in transformer architectures, with attention mechanisms becoming more efficient through sparse attention patterns. Modern implementations show 40% improvement in inference speed while maintaining accuracy.

Key developments include:
1. Flash Attention 2.0 - Reduces memory usage by 50% through kernel fusion
2. Grouped Query Attention - Achieves 30% faster inference with minimal accuracy loss
3. Multi-Query Attention - Dramatically reduces memory bandwidth requirements

These improvements enable larger context windows (up to 128K tokens) and more efficient deployment on consumer hardware. The trade-offs between speed and accuracy are now well-understood, with production systems adopting hybrid approaches that use different attention mechanisms based on the task requirements.

Recent benchmarks show that combining these techniques can achieve near-linear scaling up to 100K tokens, compared to the quadratic scaling of traditional attention mechanisms.`

export const Default: Story = {
  args: {
    iteration: sampleIteration,
    workers: [
      { workerId: 1, status: 'complete' },
      { workerId: 2, status: 'complete' },
      { workerId: 3, status: 'complete' },
    ],
    coordinationPhase: 'complete',
    isActive: false,
  },
}

export const ActiveIteration: Story = {
  args: {
    iteration: {
      ...sampleIteration,
      status: 'running',
      findings: null,
      feedback: null,
      refinedQueries: null,
    },
    workers: [
      { workerId: 1, status: 'complete' },
      { workerId: 2, status: 'active' },
      { workerId: 3, status: 'active' },
      { workerId: 4, status: 'idle' },
      { workerId: 5, status: 'idle' },
    ],
    coordinationPhase: 'working',
    isActive: true,
  },
}

export const DistributingQueries: Story = {
  args: {
    iteration: {
      ...sampleIteration,
      status: 'running',
      findings: null,
    },
    workers: [
      { workerId: 1, status: 'idle' },
      { workerId: 2, status: 'idle' },
      { workerId: 3, status: 'idle' },
      { workerId: 4, status: 'idle' },
      { workerId: 5, status: 'idle' },
    ],
    coordinationPhase: 'distributing',
    isActive: true,
  },
}

export const AggregatingResults: Story = {
  args: {
    iteration: {
      ...sampleIteration,
      status: 'running',
    },
    workers: [
      { workerId: 1, status: 'complete' },
      { workerId: 2, status: 'complete' },
      { workerId: 3, status: 'complete' },
      { workerId: 4, status: 'complete' },
      { workerId: 5, status: 'complete' },
    ],
    coordinationPhase: 'aggregating',
    isActive: true,
  },
}

export const WithError: Story = {
  args: {
    iteration: {
      ...sampleIteration,
      coverageScore: 45,
      feedback: 'Worker 3 encountered rate limiting. Partial results available.',
    },
    workers: [
      { workerId: 1, status: 'complete' },
      { workerId: 2, status: 'complete' },
      { workerId: 3, status: 'error' },
      { workerId: 4, status: 'complete' },
      { workerId: 5, status: 'complete' },
    ],
    coordinationPhase: 'complete',
    isActive: false,
  },
}

export const LowCoverage: Story = {
  args: {
    iteration: {
      ...sampleIteration,
      coverageScore: 35,
      feedback: 'Significant gaps identified in coverage. Additional iterations recommended.',
      findings: 'Limited information found. Most sources were outdated or not relevant.',
    },
    workers: [
      { workerId: 1, status: 'complete' },
      { workerId: 2, status: 'complete' },
    ],
    coordinationPhase: 'complete',
    isActive: false,
  },
}

export const HighCoverage: Story = {
  args: {
    iteration: {
      ...sampleIteration,
      coverageScore: 95,
      feedback: 'Excellent coverage. All major aspects addressed comprehensively.',
      findings: longFindings,
    },
    workers: [
      { workerId: 1, status: 'complete' },
      { workerId: 2, status: 'complete' },
      { workerId: 3, status: 'complete' },
      { workerId: 4, status: 'complete' },
      { workerId: 5, status: 'complete' },
    ],
    coordinationPhase: 'complete',
    isActive: false,
  },
}

export const Expanded: Story = {
  args: {
    iteration: {
      ...sampleIteration,
      findings: longFindings,
    },
    workers: [
      { workerId: 1, status: 'complete' },
      { workerId: 2, status: 'complete' },
      { workerId: 3, status: 'complete' },
    ],
    coordinationPhase: 'complete',
    defaultExpanded: true,
  },
}

export const MinimalWorkers: Story = {
  args: {
    iteration: sampleIteration,
    workers: [
      { workerId: 1, status: 'complete' },
      { workerId: 2, status: 'complete' },
    ],
    coordinationPhase: 'complete',
  },
}

export const MaxWorkers: Story = {
  args: {
    iteration: sampleIteration,
    workers: [
      { workerId: 1, status: 'complete' },
      { workerId: 2, status: 'complete' },
      { workerId: 3, status: 'complete' },
      { workerId: 4, status: 'complete' },
      { workerId: 5, status: 'complete' },
    ],
    coordinationPhase: 'complete',
  },
}

export const NoWorkers: Story = {
  args: {
    iteration: sampleIteration,
    workers: [],
    coordinationPhase: 'idle',
  },
}

export const PendingIteration: Story = {
  args: {
    iteration: {
      ...sampleIteration,
      status: 'pending',
      findings: null,
      feedback: null,
      refinedQueries: null,
      coverageScore: null,
    },
    workers: [],
    coordinationPhase: 'idle',
    isActive: false,
  },
}

export const IterationProgressFlow = {
  render: () => {
    const iterations: Array<{
      iteration: DeepResearchIteration
      workers: Array<{ workerId: number; status: 'idle' | 'active' | 'complete' | 'error' }>
      coordinationPhase: 'idle' | 'distributing' | 'working' | 'aggregating' | 'complete'
      isActive: boolean
    }> = [
      {
        iteration: { ...sampleIteration, iterationNumber: 1, coverageScore: 60 },
        workers: [
          { workerId: 1, status: 'complete' },
          { workerId: 2, status: 'complete' },
          { workerId: 3, status: 'complete' },
        ],
        coordinationPhase: 'complete',
        isActive: false,
      },
      {
        iteration: {
          ...sampleIteration,
          iterationNumber: 2,
          coverageScore: 78,
          status: 'completed',
        },
        workers: [
          { workerId: 1, status: 'complete' },
          { workerId: 2, status: 'complete' },
          { workerId: 3, status: 'complete' },
          { workerId: 4, status: 'complete' },
        ],
        coordinationPhase: 'complete',
        isActive: false,
      },
      {
        iteration: {
          ...sampleIteration,
          iterationNumber: 3,
          coverageScore: null,
          status: 'running',
          findings: null,
        },
        workers: [
          { workerId: 1, status: 'complete' },
          { workerId: 2, status: 'active' },
          { workerId: 3, status: 'active' },
          { workerId: 4, status: 'idle' },
          { workerId: 5, status: 'idle' },
        ],
        coordinationPhase: 'working',
        isActive: true,
      },
      {
        iteration: {
          ...sampleIteration,
          iterationNumber: 4,
          coverageScore: null,
          status: 'pending',
          findings: null,
          feedback: null,
          refinedQueries: null,
        },
        workers: [],
        coordinationPhase: 'idle',
        isActive: false,
      },
    ]

    return (
      <View className="gap-4">
        {iterations.map((config, index) => (
          <IterationSummaryCard key={index} {...config} />
        ))}
      </View>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows progression of iterations from completed (60% coverage), improved (78% coverage), currently active (in progress), to pending (not started).',
      },
    },
  },
}

export const CoverageScoreRange = {
  render: () => {
    const scores = [25, 45, 65, 85, 95]
    return (
      <View className="gap-4">
        {scores.map((score, index) => (
          <IterationSummaryCard
            key={index}
            iteration={{
              ...sampleIteration,
              iterationNumber: index + 1,
              coverageScore: score,
            }}
            workers={[
              { workerId: 1, status: 'complete' },
              { workerId: 2, status: 'complete' },
              { workerId: 3, status: 'complete' },
            ]}
            coordinationPhase="complete"
          />
        ))}
      </View>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates coverage score visualization across different ranges: low (red), medium (orange/yellow), good (yellow/green), excellent (green).',
      },
    },
  },
}

export const WorkerStatusVariations = {
  render: () => {
    const workerConfigs = [
      {
        label: 'All Complete',
        workers: [
          { workerId: 1, status: 'complete' as const },
          { workerId: 2, status: 'complete' as const },
          { workerId: 3, status: 'complete' as const },
        ],
      },
      {
        label: 'Mixed Progress',
        workers: [
          { workerId: 1, status: 'complete' as const },
          { workerId: 2, status: 'active' as const },
          { workerId: 3, status: 'idle' as const },
        ],
      },
      {
        label: 'With Error',
        workers: [
          { workerId: 1, status: 'complete' as const },
          { workerId: 2, status: 'error' as const },
          { workerId: 3, status: 'complete' as const },
        ],
      },
      {
        label: 'All Active',
        workers: [
          { workerId: 1, status: 'active' as const },
          { workerId: 2, status: 'active' as const },
          { workerId: 3, status: 'active' as const },
        ],
      },
    ]

    return (
      <View className="gap-4">
        {workerConfigs.map((config, index) => (
          <View key={index} className="gap-2">
            <View className="bg-muted rounded px-3 py-1">
              <View className="text-foreground text-sm font-medium">{config.label}</View>
            </View>
            <IterationSummaryCard
              iteration={{
                ...sampleIteration,
                iterationNumber: index + 1,
              }}
              workers={config.workers}
              coordinationPhase="working"
              isActive={config.label !== 'All Complete'}
            />
          </View>
        ))}
      </View>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          'Showcases different worker status combinations: all complete, mixed progress, with error, and all active.',
      },
    },
  },
}
