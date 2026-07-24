import { useRouter } from 'expo-router';
import { SocialPostsListScreen } from '@/components/whats-new/SocialPostsListScreen';

/**
 * Community Pulse - Social Posts Subview
 *
 * Route: /whats-new/social
 */
export default function SocialPostsRoute() {
  // Default testID `social-posts-list` matches Maestro AC-5
  return <SocialPostsListScreen testID="social-posts-list" />;
}
