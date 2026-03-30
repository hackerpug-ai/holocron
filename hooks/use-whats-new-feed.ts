import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

interface UseWhatsNewFeedArgs {
  category?: "discovery" | "release" | "trend" | "discussion";
}

export function useWhatsNewFeed(args: UseWhatsNewFeedArgs = {}) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Query latest findings with optional category filter
  const result = useQuery(api.whatsNew.queries.getLatestFindings, {
    category: args.category,
  });

  // Action to force-generate a new report
  const generateReport = useAction(api.whatsNew.actions.generate);

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      await generateReport({ force: true });
    } finally {
      setIsRefreshing(false);
    }
  };

  return {
    findings: result?.findings ?? [],
    report: result?.report ?? null,
    isLoading: result === undefined,
    isRefreshing,
    refresh,
  };
}
