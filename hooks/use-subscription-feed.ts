import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useMemo, useState } from 'react';
import { feedItemsByOwner } from '@/app/zero/queries';

interface UseSubscriptionFeedArgs {
  limit?: number;
  contentType?: 'video' | 'blog' | 'social';
  viewed?: boolean;
  searchQuery?: string;
}

type FeedItemRow = {
  id: string;
  group_key?: string | null;
  title?: string | null;
  summary?: string | null;
  content_type?: string | null;
  item_count?: number | null;
  thumbnail_url?: string | null;
  author_handle?: string | null;
  creator_name?: string | null;
  viewed?: boolean | null;
  published_at?: number | null;
  discovered_at?: number | null;
  created_at: number;
};

/**
 * Subscription feed via Zero (api.feeds.queries.getFeed → feedItemsByOwner).
 * Field mapping preserves legacy camelCase names expected by feed cards.
 */
export function useSubscriptionFeed({
  limit = 20,
  contentType,
  viewed,
  searchQuery,
}: UseSubscriptionFeedArgs) {
  const [currentLimit, setCurrentLimit] = useState(limit);
  const [rawRows, details] = useZeroQuery(feedItemsByOwner(currentLimit));
  const rows = (rawRows ?? []) as unknown as FeedItemRow[];
  const isLoading = details.type !== 'complete' && rows.length === 0;

  const filteredItems = useMemo(() => {
    let items = rows.map((item) => ({
      ...item,
      _id: item.id,
      id: item.id,
      groupKey: item.group_key,
      title: item.title,
      summary: item.summary,
      contentType: item.content_type,
      itemCount: item.item_count,
      thumbnailUrl: item.thumbnail_url,
      authorHandle: item.author_handle,
      creatorName: item.creator_name,
      viewed: item.viewed ?? false,
      publishedAt: item.published_at,
      discoveredAt: item.discovered_at,
      createdAt: item.created_at,
    }));

    if (contentType) {
      items = items.filter((item) => item.contentType === contentType);
    }
    if (viewed !== undefined) {
      items = items.filter((item) => item.viewed === viewed);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
          (item.title?.toLowerCase() || '').includes(q) ||
          (item.summary?.toLowerCase() || '').includes(q)
      );
    }

    return items;
  }, [rows, contentType, viewed, searchQuery]);

  const hasMore = filteredItems.length >= currentLimit;

  const loadMore = () => {
    if (hasMore) {
      setCurrentLimit((prev) => prev + limit);
    }
  };

  const reset = () => {
    setCurrentLimit(limit);
  };

  return {
    items: filteredItems,
    isLoading,
    error: null as Error | null,
    hasMore,
    loadMore,
    reset,
  };
}
