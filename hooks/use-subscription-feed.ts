import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

interface UseSubscriptionFeedArgs {
  limit?: number;
  contentType?: "video" | "blog" | "social";
  viewed?: boolean;
  searchQuery?: string;
}

export function useSubscriptionFeed({
  limit = 20,
  contentType,
  viewed,
  searchQuery,
}: UseSubscriptionFeedArgs) {
  // Track current limit for pagination
  const [currentLimit, setCurrentLimit] = useState(limit);

  // When contentType is "mixed" (frontend concept), don't filter
  const queryContentType = contentType;

  const feedItems = useQuery(
    api.feeds.queries.getFeed,
    { limit: currentLimit, contentType: queryContentType, viewed }
  );

  // Client-side search filtering
  const filteredItems = searchQuery && feedItems
    ? feedItems.filter((item: Doc<"feedItems">) =>
        (item.title?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        item.summary?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : feedItems;

  // Determine if there are more items to load
  const hasMore = (filteredItems?.length ?? 0) >= limit;

  // Load more items by increasing the limit
  const loadMore = () => {
    if (hasMore) {
      setCurrentLimit((prev) => prev + limit);
    }
  };

  // Reset limit when filters change
  const reset = () => {
    setCurrentLimit(limit);
  };

  return {
    items: filteredItems ?? [],
    isLoading: feedItems === undefined,
    error: null, // Convex useQuery doesn't expose errors directly; they're handled by error boundaries
    hasMore,
    loadMore,
    reset,
  };
}
