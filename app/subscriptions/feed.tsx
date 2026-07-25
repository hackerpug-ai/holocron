import { ScreenLayout } from '@/components/ui/screen-layout';
import { SubscriptionFeedScreen } from '@/components/subscriptions/SubscriptionFeedScreen';

/**
 * Subscription feed route.
 *
 * Deep link: holocron://subscriptions/feed
 * Keeps the personalized subscription feed separate from /whats-new.
 */
export default function SubscriptionFeedRoute() {
  return (
    <ScreenLayout edges="bottom" testID="subscription-feed-layout">
      <SubscriptionFeedScreen />
    </ScreenLayout>
  );
}
