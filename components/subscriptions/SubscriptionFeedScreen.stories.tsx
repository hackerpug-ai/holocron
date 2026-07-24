import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';
import { SubscriptionFeedScreen } from './SubscriptionFeedScreen';

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
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default state of the feed screen.
 * In real usage, this would show findings from the What's New report / seeded feed_items via Zero.
 */
export const Default: Story = {
  render: () => {
    return <SubscriptionFeedScreen testID="story-feed-screen" />;
  },
};

/**
 * Loading state with skeleton placeholders.
 * This appears when the feed is initially loading or refreshing.
 */
export const Loading: Story = {
  render: () => {
    return <SubscriptionFeedScreen testID="story-feed-screen-loading" />;
  },
};

export const Empty: Story = {
  render: () => {
    return <SubscriptionFeedScreen testID="story-feed-screen-empty" />;
  },
};

export const Filtered: Story = {
  render: () => {
    return <SubscriptionFeedScreen testID="story-feed-screen-filtered" />;
  },
};

export const Search: Story = {
  render: () => {
    return <SubscriptionFeedScreen testID="story-feed-screen-search" />;
  },
};
