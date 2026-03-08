import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { DeepResearchLoadingCard } from './DeepResearchLoadingCard'

const meta = {
  title: 'Deep Research/DeepResearchLoadingCard',
  component: DeepResearchLoadingCard,
  decorators: [
    (Story) => (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <View className="w-full max-w-md">
          <Story />
        </View>
      </View>
    ),
  ],
} satisfies Meta<typeof DeepResearchLoadingCard>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Default loading state with a typical research query
 */
export const Default: Story = {
  args: {
    query: 'what tools exist to migrate dropbox to google drive',
  },
}

/**
 * Short query - demonstrates minimal text rendering
 */
export const ShortQuery: Story = {
  args: {
    query: 'quantum computing basics',
    message: 'Preparing research...',
  },
}

/**
 * Long query - demonstrates text truncation with numberOfLines
 */
export const LongQuery: Story = {
  args: {
    query:
      'comprehensive analysis of machine learning frameworks for natural language processing tasks including transformer architectures, fine-tuning strategies, and deployment considerations for production environments',
    message: 'Analyzing complex query...',
  },
}

/**
 * Custom loading message
 */
export const CustomMessage: Story = {
  args: {
    query: 'best practices for React Native performance',
    message: 'Building research plan...',
  },
}

/**
 * Technical query example
 */
export const TechnicalQuery: Story = {
  args: {
    query: 'how to implement oauth 2.0 with pkce flow in mobile apps',
    message: 'Initializing secure research...',
  },
}

/**
 * Business query example
 */
export const BusinessQuery: Story = {
  args: {
    query: 'market analysis for sustainable energy solutions in emerging markets',
    message: 'Gathering market intelligence...',
  },
}

/**
 * Stage: Initializing - First stage of research setup
 */
export const StageInitializing: Story = {
  args: {
    query: 'what tools exist to migrate dropbox to google drive',
    stage: 'initializing',
  },
}

/**
 * Stage: Planning - Search strategy is being planned
 */
export const StagePlanning: Story = {
  args: {
    query: 'best practices for React Native performance',
    stage: 'planning',
  },
}

/**
 * Stage: Searching - Actively searching knowledge sources
 */
export const StageSearching: Story = {
  args: {
    query: 'market analysis for sustainable energy solutions',
    stage: 'searching',
  },
}

/**
 * Stage: Analyzing - Analyzing search results
 */
export const StageAnalyzing: Story = {
  args: {
    query: 'how to implement oauth 2.0 with pkce flow',
    stage: 'analyzing',
  },
}

/**
 * Stage: Synthesizing - Final stage, creating synthesis
 */
export const StageSynthesizing: Story = {
  args: {
    query: 'quantum computing applications in cryptography',
    stage: 'synthesizing',
  },
}

/**
 * With Steps - Progressive step list with animated appearance
 */
export const WithSteps: Story = {
  args: {
    query: 'best practices for React Native performance optimization',
    stage: 'searching',
    steps: [
      {
        id: '1',
        label: 'Analyzing query and identifying key topics',
        status: 'completed',
      },
      {
        id: '2',
        label: 'Searching academic papers and documentation',
        status: 'in-progress',
        detail: 'Found 127 sources, processing...',
      },
      {
        id: '3',
        label: 'Extracting relevant insights',
        status: 'pending',
      },
      {
        id: '4',
        label: 'Synthesizing findings into report',
        status: 'pending',
      },
    ],
  },
}

/**
 * Steps with Details - Shows optional detail messages
 */
export const StepsWithDetails: Story = {
  args: {
    query: 'machine learning frameworks comparison',
    stage: 'analyzing',
    steps: [
      {
        id: '1',
        label: 'Query breakdown',
        status: 'completed',
        detail: 'Identified 5 key comparison criteria',
      },
      {
        id: '2',
        label: 'Source discovery',
        status: 'completed',
        detail: '89 papers, 156 documentation pages',
      },
      {
        id: '3',
        label: 'Content analysis',
        status: 'in-progress',
        detail: 'Processing TensorFlow, PyTorch, and JAX comparisons',
      },
      {
        id: '4',
        label: 'Report generation',
        status: 'pending',
      },
    ],
  },
}

/**
 * All Steps Completed - Final state before synthesis
 */
export const AllStepsCompleted: Story = {
  args: {
    query: 'sustainable energy solutions for emerging markets',
    stage: 'synthesizing',
    steps: [
      {
        id: '1',
        label: 'Query analysis',
        status: 'completed',
      },
      {
        id: '2',
        label: 'Source gathering',
        status: 'completed',
      },
      {
        id: '3',
        label: 'Content extraction',
        status: 'completed',
      },
      {
        id: '4',
        label: 'Synthesis',
        status: 'in-progress',
        detail: 'Generating final report...',
      },
    ],
  },
}

/**
 * All variants - showcase all different stages
 */
export const AllStages: Story = {
  args: {
    query: 'Example query',
  },
  render: () => (
    <View className="gap-4">
      <DeepResearchLoadingCard
        query="migrate dropbox to google drive"
        stage="initializing"
      />
      <DeepResearchLoadingCard
        query="React Native performance"
        stage="planning"
      />
      <DeepResearchLoadingCard
        query="sustainable energy markets"
        stage="searching"
      />
      <DeepResearchLoadingCard
        query="oauth 2.0 pkce flow"
        stage="analyzing"
      />
      <DeepResearchLoadingCard
        query="quantum cryptography"
        stage="synthesizing"
      />
    </View>
  ),
}
