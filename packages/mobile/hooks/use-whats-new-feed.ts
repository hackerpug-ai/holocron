import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useMemo, useState } from 'react';
import { postMission } from '@/app/zero/platform';
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
  focus?: string | null;
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
  if (
    typeof raw === 'object' &&
    raw !== null &&
    Array.isArray((raw as { findings?: unknown }).findings)
  ) {
    return (raw as { findings: Finding[] }).findings;
  }
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
 * What's New feed data via Zero (S-REWRITE-03/04).
 *
 * Primary: latestWhatsNewReports findings_json (api.whatsNew.queries.getLatestFindings).
 * Seed alignment: when reports lack findings, fall back to feedItemsByOwner so the
 * items from `holo seed:e2e --reset` are observable as finding/card rows.
 * Refresh: Hono postMission (whats-new-generate).
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

    // Align with seed semantics: feed_items surface when report findings empty.
    if (findingsList.length === 0 && feedRows.length > 0) {
      findingsList = feedItemsToFindings(feedRows);
    }

    // The filter pills must describe the same source list that can be rendered.
    // Seeded reports may intentionally omit findings_json and use feed-item
    // fallback, where persisted report counters do not describe the fallback.
    const allFindings = findingsList;

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
            focus: latest.focus,
            findingsCount: allFindings.length,
            discoveryCount: allFindings.filter((f) => f.category === 'discovery').length,
            releaseCount: allFindings.filter((f) => f.category === 'release').length,
            trendCount: allFindings.filter((f) => f.category === 'trend').length,
            summaryJson: latest.summary_json as { sources?: unknown[] } | undefined,
            documentId: latest.document_id,
            createdAt: latest.created_at,
          }
        : {
            _id: 'seed-feed-items',
            id: 'seed-feed-items',
            periodStart: 0,
            periodEnd: 0,
            days: 0,
            focus: null as string | null,
            findingsCount: findingsList.length,
            discoveryCount: findingsList.filter((f) => f.category === 'discovery').length,
            releaseCount: findingsList.filter((f) => f.category === 'release').length,
            trendCount: findingsList.filter((f) => f.category === 'trend').length,
            summaryJson: { sources: [] },
            documentId: null as string | null,
            createdAt: Date.now(),
          },
    };
  }, [reportRows, feedRows, args.category]);

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      await postMission({
        templateKey: 'whatsnew',
        goal: 'Generate whats-new report',
        idempotencyKey: `whatsnew-force-${Date.now()}`,
        args: { goal: 'Generate whats-new report' },
      });
    } catch {
      // Soft-fail refresh when platform is not configured.
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
