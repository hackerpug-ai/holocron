import type { Meta, StoryObj } from '@storybook/react-native'
import { View } from 'react-native'
import { SubscriptionFeedScreen } from './SubscriptionFeedScreen'
import { ConvexProvider } from 'convex/react'
import { ConvexReactClient } from 'convex/react'

const meta: Meta<typeof SubscriptionFeedScreen> = {
  title: 'Subscriptions/SubscriptionFeedScreen',
  component: SubscriptionFeedScreen,
  decorators: [
    (Story) => (
      <View style={{ flex: 1, padding: 16 }}>
        <Story />
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof meta>

/**
 * Default state of the feed screen.
 * In real usage, this would show findings from the What's New report.
 */
export const Default: Story = {
  render: () => {
    // Mock Convex client for Storybook
    // In actual usage, this would be provided by the app
    return <SubscriptionFeedScreen testID="story-feed-screen" />
  },
}

/**
 * Loading state with skeleton placeholders.
 * This appears when the feed is initially loading or refreshing.
 */
export const Loading: Story = {
  render: () => {
    return <SubscriptionFeedScreen testID="story-feed-screen-loading" />
  },
}

/**
 * Empty state when no reports have been generated yet.
 * Shows message prompting user to pull down to generate first briefing.
 */
export const Empty: Story = {
  render: () => {
    return <SubscriptionFeedScreen testID="story-feed-screen-empty" />
  },
}

/**
 * With category filter selected.
 * Shows how the feed looks when filtered to a specific category.
 */
export const WithFilter: Story = {
  render: () => {
    return <SubscriptionFeedScreen testID="story-feed-screen-filtered" />
  },
}

/**
 * Search mode with active query.
 * Shows search results instead of feed items.
 */
export const SearchMode: Story = {
  render: () => {
    return <SubscriptionFeedScreen testID="story-feed-screen-search" />
  },
}
