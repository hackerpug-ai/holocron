/**
 * Subscription feed screen route
 *
 * Displays aggregated feed of subscription content with filters and settings.
 * Route: /subscriptions/feed
 *
 * NOTE: This is a NEW route separate from /subscriptions (management view)
 * - /subscriptions/feed: Feed view with filters and settings (this route)
 * - /subscriptions: Management view for adding/removing subscriptions (existing, unchanged)
 */
import { ScreenLayout } from '@/components/ui/screen-layout';
import { SubscriptionFeedScreen } from '@/components/subscriptions/SubscriptionFeedScreen';

export default function SubscriptionFeedRoute() {
  return (
    <ScreenLayout edges="bottom" testID="subscription-feed-layout">
      <SubscriptionFeedScreen />
    </ScreenLayout>
  );
}
