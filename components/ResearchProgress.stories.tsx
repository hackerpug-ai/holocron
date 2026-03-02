import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { ResearchProgress, type ResearchStatus } from './ResearchProgress'

const meta: Meta<typeof ResearchProgress> = {
  title: 'Components/ResearchProgress',
  component: ResearchProgress,
  parameters: {
    docs: {
      description: {
        component:
          'Displays an in-progress research workflow card in the chat stream. Shows current status, animated spinner, progress bar, and iteration info for deep research.',
      },
    },
  },
  argTypes: {
    query: {
      control: { type: 'text' },
      description: 'Research query or topic',
    },
    status: {
      control: { type: 'select' },
      options: ['initializing', 'searching', 'analyzing', 'synthesizing', 'complete', 'error'],
      description: 'Current status of the research',
    },
    progress: {
      control: { type: 'range', min: 0, max: 100, step: 5 },
      description: 'Progress percentage (0-100)',
    },
    currentIteration: {
      control: { type: 'number' },
      description: 'Current iteration for deep research',
    },
    totalIterations: {
      control: { type: 'number' },
      description: 'Total iterations for deep research',
    },
    statusMessage: {
      control: { type: 'text' },
      description: 'Custom status message to display',
    },
  },
  args: {
    query: 'What are the best practices for RAG systems?',
    status: 'searching',
    progress: 35,
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
type Story = StoryObj<typeof ResearchProgress>

export const Default: Story = {}

export const Initializing: Story = {
  args: {
    status: 'initializing',
    progress: 5,
  },
}

export const Searching: Story = {
  args: {
    status: 'searching',
    progress: 30,
  },
}

export const Analyzing: Story = {
  args: {
    status: 'analyzing',
    progress: 55,
  },
}

export const Synthesizing: Story = {
  args: {
    status: 'synthesizing',
    progress: 80,
  },
}

export const Complete: Story = {
  args: {
    status: 'complete',
    progress: 100,
  },
}

export const Error: Story = {
  args: {
    status: 'error',
    progress: 45,
    statusMessage: 'Failed to connect to research service',
  },
}

export const DeepResearch: Story = {
  args: {
    query: 'Comprehensive analysis of climate change policies',
    status: 'analyzing',
    progress: 65,
    currentIteration: 3,
    totalIterations: 5,
  },
}

export const CustomMessage: Story = {
  args: {
    status: 'searching',
    progress: 40,
    statusMessage: 'Querying academic databases...',
  },
}

export const ResearchFlow: Story = {
  render: () => {
    const stages: Array<{
      status: ResearchStatus
      progress: number
      currentIteration?: number
      totalIterations?: number
    }> = [
      { status: 'initializing', progress: 10 },
      { status: 'searching', progress: 35 },
      { status: 'analyzing', progress: 55, currentIteration: 2, totalIterations: 3 },
      { status: 'synthesizing', progress: 85, currentIteration: 3, totalIterations: 3 },
      { status: 'complete', progress: 100 },
    ]

    return (
      <View className="gap-3">
        {stages.map((stage, index) => (
          <ResearchProgress
            key={index}
            query="Transformer architecture evolution"
            {...stage}
          />
        ))}
      </View>
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows all research stages from initialization to completion.',
      },
    },
  },
}
