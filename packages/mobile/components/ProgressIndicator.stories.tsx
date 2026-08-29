import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { ProgressIndicator } from './ProgressIndicator'

const meta: Meta<typeof ProgressIndicator> = {
  title: 'Components/ProgressIndicator',
  component: ProgressIndicator,
  parameters: {
    docs: {
      description: {
        component:
          'Displays real-time progress of research operations. Shows current phase, progress bar, elapsed time, and sources being consulted.',
      },
    },
  },
  argTypes: {
    phase: {
      control: { type: 'select' },
      options: ['searching', 'analyzing', 'synthesizing', 'complete'],
      description: 'Current research phase',
    },
    progress: {
      control: { type: 'range', min: 0, max: 100, step: 1 },
      description: 'Progress percentage (0-100)',
    },
    elapsedTime: {
      control: { type: 'number' },
      description: 'Elapsed time in seconds',
    },
    sources: {
      control: { type: 'object' },
      description: 'List of sources being consulted',
    },
    isActive: {
      control: { type: 'boolean' },
      description: 'Whether research is active',
    },
    statusMessage: {
      control: { type: 'text' },
      description: 'Optional status message',
    },
  },
  args: {
    phase: 'searching',
    isActive: true,
    elapsedTime: 45,
  },
}

export default meta
type Story = StoryObj<typeof ProgressIndicator>

export const Default: Story = {}

export const Searching: Story = {
  args: {
    phase: 'searching',
    progress: 15,
    elapsedTime: 12,
    sources: ['arxiv.org', 'scholar.google.com', 'semantic-scholar.org'],
    statusMessage: 'Searching academic databases...',
  },
}

export const Analyzing: Story = {
  args: {
    phase: 'analyzing',
    progress: 55,
    elapsedTime: 67,
    sources: [
      'arxiv.org',
      'scholar.google.com',
      'semantic-scholar.org',
      'pubmed.gov',
      'ieee.org',
      'acm.org',
    ],
    statusMessage: 'Analyzing 12 relevant papers...',
  },
}

export const Synthesizing: Story = {
  args: {
    phase: 'synthesizing',
    progress: 85,
    elapsedTime: 120,
    sources: ['arxiv.org', 'scholar.google.com', 'semantic-scholar.org'],
    statusMessage: 'Generating executive summary...',
  },
}

export const Complete: Story = {
  args: {
    phase: 'complete',
    progress: 100,
    elapsedTime: 145,
    isActive: false,
    sources: ['arxiv.org', 'scholar.google.com'],
  },
}

export const NoSources: Story = {
  args: {
    phase: 'searching',
    elapsedTime: 5,
    statusMessage: 'Initializing search...',
  },
}

export const ManySources: Story = {
  args: {
    phase: 'analyzing',
    progress: 60,
    elapsedTime: 90,
    sources: [
      'arxiv.org',
      'scholar.google.com',
      'semantic-scholar.org',
      'pubmed.gov',
      'ieee.org',
      'acm.org',
      'nature.com',
      'science.org',
    ],
  },
}

export const AllPhases: Story = {
  render: () => (
    <View style={{ gap: 16 }}>
      <ProgressIndicator
        phase="searching"
        progress={20}
        elapsedTime={15}
        sources={['google.com', 'arxiv.org']}
      />
      <ProgressIndicator
        phase="analyzing"
        progress={55}
        elapsedTime={60}
        sources={['google.com', 'arxiv.org', 'scholar.google.com']}
      />
      <ProgressIndicator
        phase="synthesizing"
        progress={80}
        elapsedTime={100}
        sources={['google.com', 'arxiv.org']}
      />
      <ProgressIndicator
        phase="complete"
        progress={100}
        elapsedTime={130}
        isActive={false}
        sources={['google.com', 'arxiv.org']}
      />
    </View>
  ),
}
