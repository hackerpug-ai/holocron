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
 * All variants - showcase different query lengths and messages
 */
export const AllVariants: Story = {
  render: () => (
    <View className="gap-4">
      <DeepResearchLoadingCard query="short query" />
      <DeepResearchLoadingCard
        query="what tools exist to migrate dropbox to google drive"
        message="Preparing research..."
      />
      <DeepResearchLoadingCard
        query="comprehensive analysis of machine learning frameworks for natural language processing tasks including transformer architectures"
        message="Analyzing complex query..."
      />
    </View>
  ),
}
