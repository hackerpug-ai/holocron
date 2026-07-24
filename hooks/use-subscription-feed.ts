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
  title?: string | null;
  summary?: string | null;
  content_type?: string | null;
  viewed?: boolean | null;
  created_at: number;
  thumbnail_url?: string | null;
  author_handle?: string | null;
  creator_name?: string | null;
  published_at?: number | null;
  group_key?: string | null;
};

/**
 * Subscription feed via Zero (api.feeds.queries.getFeed → feedItemsByOwner).
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
    let items = rows;

    if (contentType) {
      items = items.filter((item) => item.content_type === contentType);
    }
    if (viewed !== undefined) {
      items = items.filter((item) => Boolean(item.viewed) === viewed);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
          (item.title?.toLowerCase() || '').includes(q) ||
          (item.summary?.toLowerCase() || '').includes(q)
      );
    }

    // Preserve legacy field names expected by feed cards.
    return items.map((item) => ({
      ...item,
      _id: item.id,
      contentType: item.content_type,
      thumbnailUrl: item.thumbnail_url,
      authorHandle: item.author_handle,
      creatorName: item.creator_name,
      publishedAt: item.published_at,
      groupKey: item.group_key,
      createdAt: item.created_at,
    }));
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
    error: null,
    hasMore,
    loadMore,
    reset,
  };
}
