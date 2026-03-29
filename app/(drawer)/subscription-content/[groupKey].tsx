import { useLocalSearchParams } from 'expo-router'
import { SubscriptionDetailScreen } from '@/screens/subscription-detail-screen'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { View, ActivityIndicator } from 'react-native'
import { Text } from '@/components/ui/text'

/**
 * Subscription content route.
 *
 * Displays all researched documents for a group of subscriptions.
 * The groupKey parameter contains comma-separated subscription IDs.
 */
export default function SubscriptionContentRoute() {
  const { groupKey } = useLocalSearchParams<{ groupKey: string }>()

  // Parse subscription IDs from the groupKey (comma-separated, URL-encoded)
  const subscriptionIds = groupKey ? decodeURIComponent(groupKey).split(',') : []

  if (subscriptionIds.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-destructive">Invalid subscription group</Text>
      </View>
    )
  }

  // Fetch subscriptions to get the group name
  const subscriptions = useQuery(api.subscriptions.queries.list, {})

  // Get the group's display name (use first subscription's name or identifier)
  const groupName =
    subscriptions?.find((s) => s._id.toString() === subscriptionIds[0])?.name ||
    subscriptions?.find((s) => s._id.toString() === subscriptionIds[0])?.identifier ||
    'Subscriptions'

  // Show loading while fetching group name
  if (subscriptions === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
        <Text className="text-muted-foreground mt-4">Loading...</Text>
      </View>
    )
  }

  return (
    <SubscriptionDetailScreen
      subscriptionIds={subscriptionIds}
      groupName={groupName}
    />
  )
}
