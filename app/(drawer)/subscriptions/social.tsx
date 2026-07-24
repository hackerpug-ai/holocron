/**
 * Social posts subview route
 *
 * Dedicated view for all community/social posts from the latest What's New report.
 * Route: /subscriptions/social
 */
import { ScreenLayout } from '@/components/ui/screen-layout';
import { SocialPostsListScreen } from '@/components/whats-new/SocialPostsListScreen';

export default function SocialPostsRoute() {
  return (
    <ScreenLayout edges="bottom" testID="subscriptions-social-layout">
      <SocialPostsListScreen />
    </ScreenLayout>
  );
}
