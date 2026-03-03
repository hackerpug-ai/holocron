import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { DeepResearchConfirmationCard } from './DeepResearchConfirmationCard'

const meta: Meta<typeof DeepResearchConfirmationCard> = {
  title: 'Deep Research/ConfirmationCard',
  component: DeepResearchConfirmationCard,
  parameters: {
    docs: {
      description: {
        component:
          'Confirmation card shown when user initiates /deep-research command. Displays topic, iteration count, estimated duration, session ID, and processing time warning.',
      },
    },
  },
  argTypes: {
    topic: {
      control: { type: 'text' },
      description: 'Research topic or query',
    },
    maxIterations: {
      control: { type: 'number', min: 1, max: 10 },
      description: 'Maximum number of research iterations (default: 5)',
    },
    estimatedMinutes: {
      control: { type: 'number' },
      description: 'Estimated duration in minutes (auto-calculated if not provided)',
    },
    sessionId: {
      control: { type: 'text' },
      description: 'Unique session identifier displayed in monospace font',
    },
    warningMessage: {
      control: { type: 'text' },
      description: 'Custom warning message about processing time',
    },
    className: {
      control: { type: 'text' },
      description: 'Optional class name for custom styling',
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
type Story = StoryObj<typeof DeepResearchConfirmationCard>

// Generate a realistic session ID
const generateSessionId = () => {
  return `dr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`
}

export const Default: Story = {
  args: {
    topic: 'quantum computing',
    maxIterations: 5,
    sessionId: generateSessionId(),
  },
}

export const CustomIterations: Story = {
  args: {
    topic: 'machine learning interpretability techniques',
    maxIterations: 3,
    sessionId: generateSessionId(),
  },
  parameters: {
    docs: {
      description: {
        story: 'User submits `/deep-research --max 3 topic` - Shows max iterations as 3 with corresponding estimated duration.',
      },
    },
  },
}

export const MaxIterations: Story = {
  args: {
    topic: 'comprehensive analysis of climate change solutions',
    maxIterations: 10,
    sessionId: generateSessionId(),
  },
  parameters: {
    docs: {
      description: {
        story: 'Maximum iterations scenario with 20 minute estimated duration.',
      },
    },
  },
}

export const SingleIteration: Story = {
  args: {
    topic: 'quick overview of Rust ownership',
    maxIterations: 1,
    sessionId: generateSessionId(),
  },
}

export const CustomEstimatedTime: Story = {
  args: {
    topic: 'advanced neural network architectures',
    maxIterations: 5,
    estimatedMinutes: 15,
    sessionId: generateSessionId(),
  },
  parameters: {
    docs: {
      description: {
        story: 'Custom estimated duration override instead of auto-calculated time.',
      },
    },
  },
}

export const CustomWarning: Story = {
  args: {
    topic: 'blockchain scalability solutions',
    maxIterations: 7,
    sessionId: generateSessionId(),
    warningMessage:
      'This is a complex research topic that may require additional time for comprehensive analysis.',
  },
}

export const LongTopic: Story = {
  args: {
    topic: 'comprehensive comparative analysis of distributed consensus algorithms in blockchain systems with focus on proof-of-stake vs proof-of-work mechanisms',
    maxIterations: 5,
    sessionId: generateSessionId(),
  },
  parameters: {
    docs: {
      description: {
        story: 'Demonstrates topic text truncation with numberOfLines for long research queries.',
      },
    },
  },
}

export const SessionIdDisplay: Story = {
  args: {
    topic: 'quantum computing applications',
    maxIterations: 5,
    sessionId: 'dr_abc123xyz789_def456',
  },
  parameters: {
    docs: {
      description: {
        story: 'Session ID displayed in monospace font for easy copying/reference.',
      },
    },
  },
}

// All variants grid showing different iteration counts
export const AllVariants: Story = {
  render: () => (
    <View className="gap-4">
      <DeepResearchConfirmationCard
        topic="quantum computing basics"
        maxIterations={1}
        sessionId={generateSessionId()}
      />
      <DeepResearchConfirmationCard
        topic="machine learning fundamentals"
        maxIterations={3}
        sessionId={generateSessionId()}
      />
      <DeepResearchConfirmationCard
        topic="deep learning architectures"
        maxIterations={5}
        sessionId={generateSessionId()}
      />
      <DeepResearchConfirmationCard
        topic="advanced AI research methods"
        maxIterations={7}
        sessionId={generateSessionId()}
      />
      <DeepResearchConfirmationCard
        topic="comprehensive AI analysis"
        maxIterations={10}
        sessionId={generateSessionId()}
      />
    </View>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Grid showing all iteration count variants with auto-calculated durations (2 min per iteration).',
      },
    },
  },
}

// Warning state examples
export const WarningStates: Story = {
  render: () => (
    <View className="gap-4">
      <DeepResearchConfirmationCard
        topic="quick research topic"
        maxIterations={1}
        sessionId={generateSessionId()}
        warningMessage="This is a quick research task that will complete shortly."
      />
      <DeepResearchConfirmationCard
        topic="standard research topic"
        maxIterations={5}
        sessionId={generateSessionId()}
      />
      <DeepResearchConfirmationCard
        topic="extended research topic"
        maxIterations={8}
        sessionId={generateSessionId()}
        warningMessage="This comprehensive research will take significant time. You can safely navigate away and return later."
      />
    </View>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Different warning states based on research complexity.',
      },
    },
  },
}

// Real-world use case examples
export const RealWorldUseCases: Story = {
  render: () => (
    <View className="gap-4">
      <DeepResearchConfirmationCard
        topic="React Server Components best practices 2024"
        maxIterations={5}
        sessionId="dr_rsc_2024_xyz123"
      />
      <DeepResearchConfirmationCard
        topic="TypeScript performance optimization techniques"
        maxIterations={3}
        sessionId="dr_ts_perf_abc456"
      />
      <DeepResearchConfirmationCard
        topic="comprehensive guide to GraphQL federation"
        maxIterations={7}
        sessionId="dr_graphql_def789"
      />
    </View>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Real-world examples showing typical developer use cases for deep research.',
      },
    },
  },
}

// Session ID badge examples
export const SessionIdBadges: Story = {
  render: () => (
    <View className="gap-4">
      <DeepResearchConfirmationCard
        topic="research topic one"
        maxIterations={5}
        sessionId="dr_1740123456_abc123"
      />
      <DeepResearchConfirmationCard
        topic="research topic two"
        maxIterations={5}
        sessionId="dr_1740987654_def456"
      />
      <DeepResearchConfirmationCard
        topic="research topic three"
        maxIterations={5}
        sessionId="dr_short_xyz"
      />
    </View>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Examples of different session ID formats displayed in monospace font within styled badges.',
      },
    },
  },
}
