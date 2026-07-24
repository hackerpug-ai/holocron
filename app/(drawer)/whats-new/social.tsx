import { ScreenLayout } from '@/components/ui/screen-layout';
import { SocialPostsListScreen } from '@/components/whats-new/SocialPostsListScreen';

/**
 * Community Pulse - Social Posts Subview
 *
 * Route: /whats-new/social
 */
export default function SocialPostsRoute() {
  // Default testID `social-posts-list` matches Maestro AC-5
  return (
    <ScreenLayout edges="bottom" testID="whats-new-social-layout">
      <SocialPostsListScreen testID="social-posts-list" />
    </ScreenLayout>
  );
}
