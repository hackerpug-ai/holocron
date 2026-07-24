import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { subscriptionSourcesList } from '@/app/zero/queries';
import { Text } from '@/components/ui/text';
import { SubscriptionDetailScreen } from '@/screens/subscription-detail-screen';

type SourceRow = {
  id: string;
  name?: string | null;
  identifier?: string | null;
};

/**
 * Subscription content route.
 *
 * Displays all researched documents for a group of subscriptions.
 * The groupKey parameter contains comma-separated subscription IDs.
 * Group metadata is resolved via Zero `subscription_sources`.
 */
export default function SubscriptionContentRoute() {
  const { groupKey } = useLocalSearchParams<{ groupKey: string }>();

  const subscriptionIds = groupKey ? decodeURIComponent(groupKey).split(',') : [];

  if (subscriptionIds.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-destructive">Invalid subscription group</Text>
      </View>
    );
  }

  const [rawRows, details] = useZeroQuery(subscriptionSourcesList(100));
  const subscriptions = (rawRows ?? []) as unknown as SourceRow[];
  const isLoading = details.type !== 'complete' && subscriptions.length === 0;

  const match = subscriptions.find((s) => s.id === subscriptionIds[0]);
  const groupName = match?.name || match?.identifier || 'Subscriptions';

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
        <Text className="text-muted-foreground mt-4">Loading...</Text>
      </View>
    );
  }

  return <SubscriptionDetailScreen subscriptionIds={subscriptionIds} groupName={groupName} />;
}
