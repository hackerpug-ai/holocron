import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useMemo, useState } from 'react';
import { feedItemsByOwner, latestWhatsNewReports } from '@/app/zero/queries';

interface UseWhatsNewFeedArgs {
  category?: 'discovery' | 'release' | 'trend' | 'discussion';
}

type Finding = {
  title: string;
  url: string;
  source: string;
  category: 'discovery' | 'release' | 'trend' | 'discussion';
  score?: number;
  summary?: string;
  publishedAt?: string;
  engagementVelocity?: number;
  crossSourceCorroboration?: number;
  author?: string;
  tags?: string[];
};

type WhatsNewReportRow = {
  id: string;
  period_start?: number | null;
  period_end?: number | null;
  days?: number | null;
  findings_count?: number | null;
  discovery_count?: number | null;
  release_count?: number | null;
  trend_count?: number | null;
  summary_json?: unknown;
  findings_json?: unknown;
  document_id?: string | null;
  created_at: number;
};

type FeedItemRow = {
  id: string;
  title?: string | null;
  summary?: string | null;
  content_type?: string | null;
  creator_name?: string | null;
  author_handle?: string | null;
  published_at?: number | null;
  created_at: number;
};

function parseFindings(raw: unknown): Finding[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as Finding[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as Finding[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function contentTypeToCategory(contentType?: string | null): Finding['category'] {
  if (contentType === 'social') return 'discussion';
  if (contentType === 'video') return 'release';
  if (contentType === 'blog') return 'discovery';
  return 'discovery';
}

function feedItemsToFindings(rows: FeedItemRow[]): Finding[] {
  return rows.map((item) => ({
    title: item.title?.trim() || 'Untitled',
    url: `holocron://feed-item/${item.id}`,
    source: item.creator_name || item.author_handle || 'Feed',
    category: contentTypeToCategory(item.content_type),
    summary: item.summary?.trim() || item.title?.trim() || 'Seeded feed item',
    publishedAt: item.published_at
      ? new Date(item.published_at).toISOString()
      : new Date(item.created_at).toISOString(),
    author: item.author_handle ?? item.creator_name ?? undefined,
  }));
}

/**
 * What's New feed data via Zero.
 *
 * Primary: latestWhatsNewReports findings_json (api.whatsNew.queries.getLatestFindings).
 * Seed alignment: when reports lack findings, fall back to feedItemsByOwner so the
 * 5 items from `holo seed:e2e --reset` are observable as finding/card rows.
 */
export function useWhatsNewFeed(args: UseWhatsNewFeedArgs = {}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rawReportRows, reportDetails] = useZeroQuery(latestWhatsNewReports(10));
  const [rawFeedRows, feedDetails] = useZeroQuery(feedItemsByOwner(50));

  const reportRows = (rawReportRows ?? []) as unknown as WhatsNewReportRow[];
  const feedRows = (rawFeedRows ?? []) as unknown as FeedItemRow[];

  const isLoading =
    reportDetails.type !== 'complete' &&
    reportRows.length === 0 &&
    feedDetails.type !== 'complete' &&
    feedRows.length === 0;

  const { findings, report } = useMemo(() => {
    const latest = reportRows[0];
    let findingsList = latest ? parseFindings(latest.findings_json) : [];

    // Align with seed semantics: 5 feed_items must surface when report findings empty.
    if (findingsList.length === 0 && feedRows.length > 0) {
      findingsList = feedItemsToFindings(feedRows);
    }

    if (args.category) {
      findingsList = findingsList.filter((f) => f.category === args.category);
    }

    if (!latest && findingsList.length === 0) {
      return { findings: [] as Finding[], report: null };
    }

    return {
      findings: findingsList,
      report: latest
        ? {
            _id: latest.id,
            id: latest.id,
            periodStart: latest.period_start ?? 0,
            periodEnd: latest.period_end ?? 0,
            days: latest.days ?? 0,
            findingsCount: latest.findings_count ?? findingsList.length,
            discoveryCount: latest.discovery_count ?? 0,
            releaseCount: latest.release_count ?? 0,
            trendCount: latest.trend_count ?? 0,
            summaryJson: latest.summary_json as { sources?: unknown[] } | undefined,
            createdAt: latest.created_at,
          }
        : {
            _id: 'seed-feed-items',
            id: 'seed-feed-items',
            periodStart: 0,
            periodEnd: 0,
            days: 0,
            findingsCount: findingsList.length,
            discoveryCount: findingsList.filter((f) => f.category === 'discovery').length,
            releaseCount: findingsList.filter((f) => f.category === 'release').length,
            trendCount: findingsList.filter((f) => f.category === 'trend').length,
            summaryJson: { sources: [] },
            createdAt: Date.now(),
          },
    };
  }, [reportRows, feedRows, args.category]);

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      const platformUrl = process.env.EXPO_PUBLIC_PLATFORM_URL;
      const rnApiKey = process.env.EXPO_PUBLIC_RN_API_KEY;
      if (!platformUrl || !rnApiKey) {
        return;
      }
      await fetch(`${platformUrl}/api/missions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${rnApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateKey: 'whatsNew',
          force: true,
          requestId: `whats-new-refresh-${Date.now()}`,
        }),
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return {
    findings,
    report,
    isLoading,
    isRefreshing,
    refresh,
  };
}
