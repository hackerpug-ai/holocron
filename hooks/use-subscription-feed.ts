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
  // When contentType is "mixed" (frontend concept), don't filter
  const queryContentType = contentType;

  const feedItems = useQuery(
    api.feeds.queries.getFeed,
    { limit, contentType: queryContentType, viewed }
  );

  // Client-side search filtering
  const filteredItems = searchQuery && feedItems
    ? feedItems.filter((item: Doc<"feedItems">) =>
        (item.title?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        item.summary?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : feedItems;

  return {
    items: filteredItems ?? [],
    isLoading: feedItems === undefined,
    error: null, // Convex useQuery doesn't expose errors directly; they're handled by error boundaries
    hasMore: (filteredItems?.length ?? 0) >= limit,
  };
}
