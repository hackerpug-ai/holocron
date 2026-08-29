import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { IterationCard } from './IterationCard'

const meta: Meta<typeof IterationCard> = {
  title: 'Components/IterationCard',
  component: IterationCard,
  parameters: {
    docs: {
      description: {
        component:
          'Displays a single deep research iteration with coverage score, reviewer feedback, and refined queries. Supports expandable details and active/complete states.',
      },
    },
  },
  argTypes: {
    iterationNumber: {
      control: { type: 'number' },
      description: 'Iteration number',
    },
    coverageScore: {
      control: { type: 'range', min: 1, max: 5, step: 1 },
      description: 'Coverage score (1-5)',
    },
    feedback: {
      control: { type: 'text' },
      description: 'Reviewer feedback identifying gaps',
    },
    refinedQueries: {
      control: { type: 'object' },
      description: 'Refined queries for next iteration',
    },
    isActive: {
      control: { type: 'boolean' },
      description: 'Whether this iteration is currently active',
    },
    isComplete: {
      control: { type: 'boolean' },
      description: 'Whether the iteration is complete',
    },
    onPress: {
      action: 'pressed',
      description: 'Optional callback when card is pressed',
    },
    defaultExpanded: {
      control: { type: 'boolean' },
      description: 'Whether the card is initially expanded',
    },
  },
  args: {
    iterationNumber: 1,
    coverageScore: 3,
    isActive: false,
    isComplete: true,
    defaultExpanded: false,
  },
}

export default meta
type Story = StoryObj<typeof IterationCard>

export const Default: Story = {}

export const WithFeedback: Story = {
  args: {
    iterationNumber: 2,
    coverageScore: 3,
    feedback:
      'Good coverage of technical aspects but missing information about real-world applications and case studies.',
    isComplete: true,
    defaultExpanded: true,
  },
}

export const WithRefinedQueries: Story = {
  args: {
    iterationNumber: 3,
    coverageScore: 4,
    feedback: 'Near complete. Missing some edge case scenarios.',
    refinedQueries: [
      'edge cases in distributed systems',
      'failure recovery patterns',
      'performance benchmarks under load',
    ],
    isComplete: true,
    defaultExpanded: true,
  },
}

export const Active: Story = {
  args: {
    iterationNumber: 4,
    coverageScore: 3,
    isActive: true,
    isComplete: false,
  },
}

export const LowScore: Story = {
  args: {
    iterationNumber: 1,
    coverageScore: 1,
    feedback: 'Initial research identified key topics but lacks depth.',
    refinedQueries: [
      'detailed analysis of transformer architecture',
      'attention mechanism mathematics',
    ],
    isComplete: true,
    defaultExpanded: true,
  },
}

export const HighScore: Story = {
  args: {
    iterationNumber: 5,
    coverageScore: 5,
    feedback: 'Comprehensive coverage achieved. All research objectives met.',
    isComplete: true,
    defaultExpanded: true,
  },
}

export const IterationTimeline: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <IterationCard
        iterationNumber={1}
        coverageScore={2}
        feedback="Initial exploration. Missing core concepts."
        refinedQueries={['core ML fundamentals', 'supervised learning basics']}
        isComplete
      />
      <IterationCard
        iterationNumber={2}
        coverageScore={3}
        feedback="Better coverage. Need more on neural networks."
        refinedQueries={['neural network architectures', 'backpropagation']}
        isComplete
      />
      <IterationCard
        iterationNumber={3}
        coverageScore={4}
        feedback="Good depth. Missing recent developments."
        refinedQueries={['transformer models 2024', 'LLM training techniques']}
        isComplete
      />
      <IterationCard
        iterationNumber={4}
        coverageScore={4}
        isActive
        isComplete={false}
      />
    </View>
  ),
}

export const AllScores: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <IterationCard iterationNumber={1} coverageScore={1} isComplete />
      <IterationCard iterationNumber={2} coverageScore={2} isComplete />
      <IterationCard iterationNumber={3} coverageScore={3} isComplete />
      <IterationCard iterationNumber={4} coverageScore={4} isComplete />
      <IterationCard iterationNumber={5} coverageScore={5} isComplete />
    </View>
  ),
}
