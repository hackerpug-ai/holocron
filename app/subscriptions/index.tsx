import { View } from 'react-native'
import { SubscriptionFeedScreen } from '@/components/subscriptions/SubscriptionFeedScreen'

/**
 * Subscriptions feed screen route.
 * Displays personalized content from user's subscriptions.
 */
export default function SubscriptionsRoute() {
  return (
    <View className="flex-1 bg-background" testID="subscriptions-route">
      <SubscriptionFeedScreen testID="subscriptions-feed" />
    </View>
  )
}
