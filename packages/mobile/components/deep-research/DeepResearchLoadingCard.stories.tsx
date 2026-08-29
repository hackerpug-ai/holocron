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
 * Completed state with HIGH confidence
 */
export const CompletedHighConfidence: Story = {
  args: {
    query: 'best practices for React Native performance',
    isComplete: true,
    confidence: 'HIGH',
    onPress: () => console.log('Navigate to results'),
  },
}

/**
 * Completed state with MEDIUM confidence
 */
export const CompletedMediumConfidence: Story = {
  args: {
    query: 'market analysis for sustainable energy solutions',
    isComplete: true,
    confidence: 'MEDIUM',
    onPress: () => console.log('Navigate to results'),
  },
}

/**
 * Completed state with LOW confidence
 */
export const CompletedLowConfidence: Story = {
  args: {
    query: 'obscure historical event analysis',
    isComplete: true,
    confidence: 'LOW',
    onPress: () => console.log('Navigate to results'),
  },
}

/**
 * Quick research loading state (violet theme)
 */
export const QuickResearchLoading: Story = {
  args: {
    query: 'what tools exist to migrate dropbox to google drive',
    researchType: 'quick',
  },
}

/**
 * Quick research completed state
 */
export const QuickResearchComplete: Story = {
  args: {
    query: 'React Native performance optimization',
    researchType: 'quick',
    isComplete: true,
    confidence: 'HIGH',
    onPress: () => console.log('Navigate to results'),
  },
}

/**
 * All states - showcase loading and completed states
 */
export const AllStates: Story = {
  args: {
    query: 'Example query',
  },
  render: () => (
    <View className="gap-4">
      <DeepResearchLoadingCard
        query="migrate dropbox to google drive"
        message="Researching..."
      />
      <DeepResearchLoadingCard
        query="React Native performance"
        message="Searching sources..."
      />
      <DeepResearchLoadingCard
        query="sustainable energy markets"
        isComplete={true}
        confidence="HIGH"
        onPress={() => console.log('Navigate')}
      />
      <DeepResearchLoadingCard
        query="oauth 2.0 pkce flow"
        isComplete={true}
        confidence="MEDIUM"
        onPress={() => console.log('Navigate')}
      />
      <DeepResearchLoadingCard
        query="quantum cryptography"
        isComplete={true}
        confidence="LOW"
        onPress={() => console.log('Navigate')}
      />
    </View>
  ),
}

/**
 * All types - side-by-side comparison of quick vs deep research
 */
export const AllTypes: Story = {
  args: {
    query: 'Example query',
  },
  render: () => (
    <View className="gap-4">
      {/* Quick research states */}
      <DeepResearchLoadingCard
        query="quick query - loading"
        researchType="quick"
      />
      <DeepResearchLoadingCard
        query="quick query - complete"
        researchType="quick"
        isComplete={true}
        confidence="HIGH"
        onPress={() => console.log('Navigate')}
      />

      {/* Deep research states */}
      <DeepResearchLoadingCard
        query="deep query - loading"
        researchType="deep"
      />
      <DeepResearchLoadingCard
        query="deep query - complete"
        researchType="deep"
        isComplete={true}
        confidence="MEDIUM"
        onPress={() => console.log('Navigate')}
      />
    </View>
  ),
}
