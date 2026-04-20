import { useRouter } from 'expo-router';
import { SocialPostsListScreen } from '@/components/whats-new/SocialPostsListScreen';

/**
 * Community Pulse - Social Posts Subview
 *
 * Route: /whats-new/social
 */
export default function SocialPostsRoute() {
  return <SocialPostsListScreen testID="whats-new-social" />;
}
