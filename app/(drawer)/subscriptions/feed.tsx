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
import { SubscriptionFeedScreen } from '@/screens/subscriptions-feed-screen'

export default function SubscriptionFeedRoute() {
  return <SubscriptionFeedScreen />
}
