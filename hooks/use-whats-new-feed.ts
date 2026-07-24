import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useState } from 'react';
import { postMission } from '@/app/zero/platform';
import { latestWhatsNewReports } from '@/app/zero/queries';

interface UseWhatsNewFeedArgs {
  category?: 'discovery' | 'release' | 'trend' | 'discussion';
}

type WhatsNewReportRow = {
  id: string;
  findings_json?: unknown;
  summary_json?: unknown;
  findings_count?: number | null;
  discovery_count?: number | null;
  release_count?: number | null;
  trend_count?: number | null;
  created_at: number;
  document_id?: string | null;
  focus?: string | null;
  period_start?: number | null;
  period_end?: number | null;
  days?: number | null;
};

/**
 * Zero query latestWhatsNewReports + Hono mission for generate (whats-new-generate).
 * Return shape mirrors the previous Convex getLatestFindings consumer contract.
 */
export function useWhatsNewFeed(args: UseWhatsNewFeedArgs = {}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rows, details] = useZeroQuery(latestWhatsNewReports(5));

  const reportRow = (rows?.[0] ?? null) as WhatsNewReportRow | null;

  // Findings payload is free-form JSON from the report row; consumers cast fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let findings: any[] = [];
  if (reportRow?.findings_json) {
    const raw = reportRow.findings_json;
    if (Array.isArray(raw)) {
      findings = raw;
    } else if (
      typeof raw === 'object' &&
      raw !== null &&
      Array.isArray((raw as { findings?: unknown }).findings)
    ) {
      findings = (raw as { findings: any[] }).findings;
    }
  }

  if (args.category && findings.length > 0) {
    findings = findings.filter((f) => {
      if (!f || typeof f !== 'object') return true;
      const cat = (f as { category?: string }).category;
      return !cat || cat === args.category;
    });
  }

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      await postMission({
        templateKey: 'whatsnew',
        goal: 'Generate whats-new report',
        idempotencyKey: `whatsnew-force-${Date.now()}`,
        args: { goal: 'Generate whats-new report' },
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const report = reportRow
    ? {
        _id: reportRow.id,
        periodStart: reportRow.period_start ?? reportRow.created_at,
        periodEnd: reportRow.period_end ?? reportRow.created_at,
        days: reportRow.days ?? 0,
        focus: reportRow.focus,
        findingsCount: reportRow.findings_count ?? 0,
        discoveryCount: reportRow.discovery_count ?? 0,
        releaseCount: reportRow.release_count ?? 0,
        trendCount: reportRow.trend_count ?? 0,
        summaryJson: reportRow.summary_json as
          | { sources?: unknown[] }
          | Record<string, unknown>
          | undefined,
        documentId: reportRow.document_id,
        createdAt: reportRow.created_at,
      }
    : null;

  return {
    findings,
    report,
    isLoading: details.type === 'unknown' && rows === undefined,
    isRefreshing,
    refresh,
  };
}
