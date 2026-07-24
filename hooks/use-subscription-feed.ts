import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useState } from 'react';
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
 * Zero query feedItemsByOwner — replaces Convex api.feeds.queries.getFeed.
 */
export function useSubscriptionFeed({
  limit = 20,
  contentType,
  viewed,
  searchQuery,
}: UseSubscriptionFeedArgs) {
  const [currentLimit, setCurrentLimit] = useState(limit);
  const [rows, details] = useZeroQuery(feedItemsByOwner(currentLimit));

  let items = ((rows ?? []) as FeedItemRow[]).map((item) => ({
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

  const hasMore = items.length >= limit;

  const loadMore = () => {
    if (hasMore) {
      setCurrentLimit((prev) => prev + limit);
    }
  };

  const reset = () => {
    setCurrentLimit(limit);
  };

  return {
    items,
    isLoading: details.type === 'unknown' && rows === undefined,
    error: null as Error | null,
    hasMore,
    loadMore,
    reset,
  };
}
