import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useMemo, useState } from 'react';
import { latestWhatsNewReports } from '@/app/zero/queries';

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

/**
 * What's New feed data via Zero (api.whatsNew.queries.getLatestFindings → latestWhatsNewReports).
 * Refresh triggers a Hono mission (POST /api/missions) per client-data-contract.
 */
export function useWhatsNewFeed(args: UseWhatsNewFeedArgs = {}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rawRows, details] = useZeroQuery(latestWhatsNewReports(10));
  const rows = (rawRows ?? []) as unknown as WhatsNewReportRow[];
  const isLoading = details.type !== 'complete' && rows.length === 0;

  const { findings, report } = useMemo(() => {
    const latest = rows[0];
    if (!latest) {
      return { findings: [] as Finding[], report: null };
    }

    let findingsList = parseFindings(latest.findings_json);
    if (args.category) {
      findingsList = findingsList.filter((f) => f.category === args.category);
    }

    return {
      findings: findingsList,
      report: {
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
      },
    };
  }, [rows, args.category]);

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
