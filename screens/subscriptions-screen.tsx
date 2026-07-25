import { useZero, useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, ScrollView, View, type ViewProps } from 'react-native';
import {
  subscriptionContentByGroup,
  subscriptionContentGroupedByCreator,
} from '@/app/zero/queries';
import { EmptyState } from '@/components/EmptyState';
import { FilterChip } from '@/components/FilterChip';
import { SearchInput } from '@/components/SearchInput';
import { SectionHeader } from '@/components/SectionHeader';
import { CreatorGroupCard } from '@/components/subscriptions/CreatorGroupCard';
import type { CreatorGroup, SubscriptionSource } from '@/components/subscriptions/types';
import { Bell as BellIcon, Loader2 } from '@/components/ui/icons';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type PlatformType =
  | 'youtube'
  | 'newsletter'
  | 'changelog'
  | 'reddit'
  | 'ebay'
  | 'whats-new'
  | 'creator'
  | 'all';

const PLATFORM_LABELS: Record<PlatformType, string> = {
  all: 'All',
  youtube: 'YouTube',
  newsletter: 'Newsletter',
  changelog: 'Changelog',
  reddit: 'Reddit',
  ebay: 'eBay',
  'whats-new': "What's New",
  creator: 'Creator',
};

interface SubscriptionsScreenProps extends Omit<ViewProps, 'children'> {
  /** Callback when unsubscribe is triggered */
  onUnsubscribe?: (ids: string[]) => void;
}

type SourceRow = {
  id: string;
  source_type?: string | null;
  identifier?: string | null;
  name?: string | null;
  url?: string | null;
  auto_research?: boolean | null;
  creator_profile_id?: string | null;
  config_json?: Record<string, unknown> | null;
  created_at: number;
  updated_at?: number | null;
};

type SubscriptionContentRow = {
  source_id?: string | null;
  research_status?: string | null;
  document_id?: string | null;
};

function toSubscriptionSource(row: SourceRow): SubscriptionSource {
  return {
    _id: row.id as SubscriptionSource['_id'],
    sourceType: (row.source_type ?? 'youtube') as SubscriptionSource['sourceType'],
    identifier: row.identifier ?? row.id,
    name: row.name ?? row.identifier ?? 'Subscription',
    url: row.url ?? undefined,
    autoResearch: row.auto_research ?? false,
    creatorProfileId: row.creator_profile_id as SubscriptionSource['creatorProfileId'],
    configJson: row.config_json ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  } as SubscriptionSource;
}

function groupSources(rows: SourceRow[], contentRows: SubscriptionContentRow[]): CreatorGroup[] {
  const groups = new Map<string, CreatorGroup>();
  const documentIdsBySource = new Map<string, Set<string>>();

  for (const content of contentRows) {
    if (content.research_status !== 'researched' || !content.source_id || !content.document_id) {
      continue;
    }
    const documentIds = documentIdsBySource.get(content.source_id) ?? new Set<string>();
    documentIds.add(content.document_id);
    documentIdsBySource.set(content.source_id, documentIds);
  }

  for (const row of rows) {
    const source = toSubscriptionSource(row);
    const creatorProfileId = row.creator_profile_id ?? null;
    const groupKey = creatorProfileId || `standalone-${row.id}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        creatorProfileId,
        name: source.name || source.identifier,
        subscriptions: [],
        platformCount: 0,
        documentCount: 0,
        lastActivityAt: source.createdAt,
        avatarUrl: (row.config_json?.avatarUrl as string | undefined) ?? undefined,
      });
    }

    const group = groups.get(groupKey)!;
    group.subscriptions.push(source);
    group.platformCount += 1;
    group.documentCount += documentIdsBySource.get(row.id)?.size ?? 0;
    const activity = source.updatedAt ?? source.createdAt;
    if (activity > group.lastActivityAt) {
      group.lastActivityAt = activity;
    }
  }

  return Array.from(groups.values());
}

/**
 * SubscriptionsScreen - manage all subscription sources grouped by creator.
 *
 * Reads via Zero (`subscriptionContentGroupedByCreator` → subscription_sources).
 * Toggle uses Zero mutator (`subscription_sources.update` / auto_research).
 */
export function SubscriptionsScreen({
  onUnsubscribe,
  className,
  ...props
}: SubscriptionsScreenProps) {
  const [searchValue, setSearchValue] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('all');
  const router = useRouter();
  const zero = useZero();

  const [rawRows, details] = useZeroQuery(subscriptionContentGroupedByCreator(100));
  const [rawContent] = useZeroQuery(subscriptionContentByGroup(200));
  const rows = (rawRows ?? []) as unknown as SourceRow[];
  const contentRows = (rawContent ?? []) as unknown as SubscriptionContentRow[];
  const isLoading = details.type !== 'complete' && rows.length === 0;

  const groups = useMemo(() => {
    const all = groupSources(rows, contentRows);
    if (selectedPlatform === 'all') return all;
    return all
      .map((group) => ({
        ...group,
        subscriptions: group.subscriptions.filter((s) => s.sourceType === selectedPlatform),
      }))
      .filter((group) => group.subscriptions.length > 0);
  }, [rows, contentRows, selectedPlatform]);

  const filteredGroups = groups?.filter((group: CreatorGroup) => {
    if (!searchValue) return true;
    const query = searchValue.toLowerCase();
    if (group.name.toLowerCase().includes(query)) return true;
    return group.subscriptions.some((sub) => sub.identifier.toLowerCase().includes(query));
  });

  const platformCounts = groups?.reduce(
    (acc: Record<string, number>, group: CreatorGroup) => {
      group.subscriptions.forEach((sub) => {
        acc[sub.sourceType] = (acc[sub.sourceType] || 0) + 1;
      });
      return acc;
    },
    {} as Record<string, number>
  );

  const availablePlatforms: PlatformType[] = [
    'all',
    ...(Object.keys(platformCounts || {}) as PlatformType[]),
  ];

  const handleSearchChange = (query: string) => {
    setSearchValue(query);
  };

  const handleClear = () => {
    setSearchValue('');
  };

  const handlePlatformChange = (platform: string) => {
    setSelectedPlatform(platform as PlatformType);
  };

  const handleToggleAutoResearch = async (id: string, nextValue: boolean) => {
    // CreatorGroupCard passes the *desired* auto_research value after local toggle.
    // Zero mutator: subscription_sources.update (enabled / auto_research flag).
    await zero.mutate.subscription_sources.update({
      id,
      auto_research: nextValue,
      updated_at: Date.now(),
    });
  };

  const handleUnsubscribe = async (subscriptionIds: string[]) => {
    for (const id of subscriptionIds) {
      await zero.mutate.subscription_sources.delete({ id });
    }
    onUnsubscribe?.(subscriptionIds);
  };

  const handleGroupPress = (group: CreatorGroup) => {
    const subscriptionIds = group.subscriptions.map((s) => s._id.toString()).join(',');
    router.push(`/subscription-content/${encodeURIComponent(subscriptionIds)}`);
  };

  const renderEmptyState = () => {
    if (isLoading || groups === undefined) {
      return (
        <View className="flex-1 items-center justify-center p-8">
          <Loader2 size={32} className="text-muted-foreground animate-spin" />
          <Text className="mt-4 text-center text-muted-foreground">Loading subscriptions...</Text>
        </View>
      );
    }

    if (selectedPlatform !== 'all') {
      return (
        <EmptyState
          icon={BellIcon}
          title={`No ${PLATFORM_LABELS[selectedPlatform]} subscriptions`}
          description={`You don't have any ${PLATFORM_LABELS[selectedPlatform].toLowerCase()} subscriptions yet.`}
        />
      );
    }

    return (
      <EmptyState
        icon={BellIcon}
        title="No subscriptions"
        description="Subscribe to creators, newsletters, or other content sources to see them here."
      />
    );
  };

  return (
    <View
      className={cn('flex-1 bg-background', className)}
      {...props}
      testID="subscriptions-screen"
    >
      <SectionHeader title="Subscriptions" className="border-b border-border px-4 pb-4" />

      <View className="px-4 pt-4">
        <SearchInput
          value={searchValue}
          onChangeText={handleSearchChange}
          onClear={handleClear}
          placeholder="Search subscriptions..."
          testID="subscriptions-search"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-4 py-4 gap-2"
      >
        {availablePlatforms.map((platform) => {
          const count = platform === 'all' ? groups?.length || 0 : platformCounts?.[platform] || 0;

          return (
            <FilterChip
              key={platform}
              label={`${PLATFORM_LABELS[platform]}${count > 0 ? ` (${count})` : ''}`}
              selected={selectedPlatform === platform}
              onPress={() => handlePlatformChange(platform)}
              testID={`platform-filter-${platform}`}
            />
          );
        })}
      </ScrollView>

      {filteredGroups && filteredGroups.length > 0 ? (
        <FlatList
          data={filteredGroups}
          keyExtractor={(item) =>
            item.creatorProfileId || `standalone-${item.subscriptions[0]?._id}`
          }
          renderItem={({ item }) => (
            <CreatorGroupCard
              group={item}
              onToggleAutoResearch={handleToggleAutoResearch}
              onUnsubscribe={handleUnsubscribe}
              onPress={() => handleGroupPress(item)}
              className="mx-4 mb-3"
            />
          )}
          contentContainerClassName="pb-4"
          testID="subscriptions-list"
        />
      ) : (
        renderEmptyState()
      )}
    </View>
  );
}
