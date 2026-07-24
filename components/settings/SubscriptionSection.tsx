import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { subscriptionContentGroupedByCreator } from '@/app/zero/queries';
import { SubscriptionSettingsModal } from '@/components/subscriptions/SubscriptionSettingsModal';
import { Bell, ChevronRight, FileText, Settings } from '@/components/ui/icons';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface SubscriptionSectionProps {
  className?: string;
  testID?: string;
}

type SourceRow = {
  id: string;
  name?: string | null;
  identifier?: string | null;
};

/**
 * SubscriptionSection - Quick subscription management in Settings
 *
 * Provides:
 * - Subscription count summary (via Zero subscription_sources)
 * - Quick link to full subscriptions management
 * - Feed settings modal (notifications, display options)
 */
export function SubscriptionSection({
  className,
  testID = 'subscription-section',
}: SubscriptionSectionProps) {
  const router = useRouter();
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  const [rawRows] = useZeroQuery(subscriptionContentGroupedByCreator(100));
  const rows = (rawRows ?? []) as unknown as SourceRow[];

  const { totalSubscriptions, totalDocuments } = useMemo(() => {
    return {
      totalSubscriptions: rows.length,
      // Document counts require a joined projection; show 0 until content query is composed.
      totalDocuments: 0,
    };
  }, [rows]);

  const handleManageSubscriptions = () => {
    router.push('/subscriptions');
  };

  const handleOpenSettings = () => {
    setSettingsModalVisible(true);
  };

  return (
    <>
      <View className={cn('gap-3', className)} testID={testID}>
        <View className="flex-row items-center gap-2 px-1">
          <View className="rounded-lg bg-primary/10 p-2">
            <Bell size={16} className="text-primary" />
          </View>
          <Text variant="h2" className="text-foreground">
            Subscriptions
          </Text>
        </View>

        <Text variant="default" className="px-1 text-muted-foreground">
          Manage your content sources and feed preferences.
        </Text>

        <View className="gap-2 pt-2">
          <Pressable
            onPress={handleManageSubscriptions}
            className="rounded-2xl border border-border bg-card p-4 active:bg-muted/50 transition-colors"
            testID={`${testID}-manage-card`}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1 gap-2">
                <View className="flex-row items-center gap-2">
                  <Text variant="h3" className="text-foreground">
                    Manage Subscriptions
                  </Text>
                  {totalSubscriptions > 0 && (
                    <View className="rounded-full bg-primary/10 px-2 py-0.5">
                      <Text className="text-xs font-medium text-primary">{totalSubscriptions}</Text>
                    </View>
                  )}
                </View>
                <Text variant="small" className="text-muted-foreground">
                  {totalSubscriptions === 0
                    ? 'Add content sources to track'
                    : `${totalSubscriptions} source${totalSubscriptions !== 1 ? 's' : ''} • ${totalDocuments} document${totalDocuments !== 1 ? 's' : ''}`}
                </Text>
              </View>
              <ChevronRight size={20} className="text-muted-foreground" />
            </View>
          </Pressable>

          <Pressable
            onPress={handleOpenSettings}
            className="rounded-2xl border border-border bg-card p-4 active:bg-muted/50 transition-colors"
            testID={`${testID}-settings-card`}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1 flex-row items-center gap-3">
                <View className="rounded-lg bg-muted p-2">
                  <Settings size={18} className="text-muted-foreground" />
                </View>
                <View className="flex-1">
                  <Text variant="h3" className="text-foreground">
                    Feed Settings
                  </Text>
                  <Text variant="small" className="text-muted-foreground">
                    Notifications, display, and filters
                  </Text>
                </View>
              </View>
              <ChevronRight size={20} className="text-muted-foreground" />
            </View>
          </Pressable>
        </View>

        {totalSubscriptions === 0 && (
          <View className="mt-2 gap-3 rounded-2xl border border-border bg-card p-4">
            <View className="flex-row items-center gap-2">
              <FileText size={16} className="text-primary" />
              <Text variant="h3" className="text-foreground">
                Get Started
              </Text>
            </View>
            <Text variant="small" className="text-muted-foreground leading-relaxed">
              Subscribe to YouTube channels, newsletters, and other content sources to have them
              automatically tracked and researched.
            </Text>
          </View>
        )}
      </View>

      <SubscriptionSettingsModal
        visible={settingsModalVisible}
        onDismiss={() => setSettingsModalVisible(false)}
        onManageSubscriptions={handleManageSubscriptions}
        testID={`${testID}-settings-modal`}
      />
    </>
  );
}
