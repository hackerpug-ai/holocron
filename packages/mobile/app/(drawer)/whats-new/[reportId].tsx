import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { whatsNewReportById } from '@/app/zero/queries';
import {
  DeepResearchDetailView,
  type DeepResearchSession,
} from '@/components/deep-research/DeepResearchDetailView';
import { Button } from '@/components/ui/button';
import { ScreenLayout } from '@/components/ui/screen-layout';
import { Text } from '@/components/ui/text';
import { WebViewSheet } from '@/components/webview/WebViewSheet';
import { NavigationTooltip } from '@/components/whats-new/NavigationTooltip';
import { useTheme } from '@/hooks/use-theme';

/**
 * Format date period for title
 */
function formatPeriod(periodStart: number, periodEnd: number): string {
  const start = new Date(periodStart).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const end = new Date(periodEnd).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${start} - ${end}`;
}

type ReportRow = {
  id: string;
  period_start?: number | null;
  period_end?: number | null;
  days?: number | null;
  findings_count?: number | null;
  findings_json?: unknown;
  document_id?: string | null;
  created_at: number;
};

type ReportFinding = { title?: string; summary?: string; source?: string; url?: string };

function parseFindings(findingsJson: unknown): ReportFinding[] {
  if (findingsJson == null) return [];
  if (typeof findingsJson === 'string') {
    try {
      const parsed = JSON.parse(findingsJson) as unknown;
      return Array.isArray(parsed) ? (parsed as ReportFinding[]) : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(findingsJson) ? (findingsJson as ReportFinding[]) : [];
}

function findingsToBody(findings: ReportFinding[]): string {
  return findings
    .map((finding) => {
      const source = finding.url
        ? `[${finding.source ?? 'Source'}](${finding.url})`
        : finding.source;
      return [`## ${finding.title ?? 'Finding'}`, finding.summary, source]
        .filter(Boolean)
        .join('\n\n');
    })
    .join('\n\n');
}

/**
 * Transform What's New report (Zero row) to DeepResearchSession format
 */
function transformReportToSession(row: ReportRow | null | undefined): DeepResearchSession | null {
  if (!row) return null;

  const findings = parseFindings(row.findings_json);
  const body = findingsToBody(findings);
  const periodStart = row.period_start ?? row.created_at;
  const periodEnd = row.period_end ?? row.created_at;

  return {
    id: row.id,
    query: `What's New in AI (${formatPeriod(periodStart, periodEnd)})`,
    report: body.length > 0 ? body : 'Report content not available.',
    iterations: [],
    citations: findings.flatMap((finding, index) =>
      finding.url
        ? [
            {
              id: index + 1,
              title: finding.title ?? finding.source ?? finding.url,
              url: finding.url,
            },
          ]
        : []
    ),
    completedAt: new Date(row.created_at),
    savedToHolocron: !!row.document_id,
    confidence: 'HIGH',
    sourcesCount: row.findings_count ?? 0,
  };
}

/**
 * What's New Report Detail Screen
 *
 * Displays the full What's New report using the same view as deep research.
 * Data plane: Zero `whatsNewReportById` over whats_new_reports.
 *
 * Route: /whats-new/[reportId]
 */
export default function WhatsNewDetailScreen() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const router = useRouter();
  const theme = useTheme();

  const [reportRow, details] = useZeroQuery(whatsNewReportById(reportId ?? ''), {
    enabled: Boolean(reportId),
  });
  const row = reportRow as unknown as ReportRow | undefined;
  const isLoading = Boolean(reportId) && details.type !== 'complete' && row == null;
  const session = useMemo(() => transformReportToSession(row), [row]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate('/chat/new');
    }
  };

  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);

  const handleCitationPress = (url: string) => {
    setWebViewUrl(url);
  };

  if (isLoading) {
    return (
      <ScreenLayout
        header={{
          title: 'Loading...',
          showBack: true,
          onBack: handleBack,
          testID: 'whats-new-detail',
        }}
        edges="bottom"
        testID="whats-new-detail-loading"
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text className="text-muted-foreground mt-4">Loading report...</Text>
        </View>
      </ScreenLayout>
    );
  }

  if (!session) {
    return (
      <ScreenLayout
        header={{
          title: 'Error',
          showBack: true,
          onBack: handleBack,
          testID: 'whats-new-detail',
        }}
        edges="bottom"
        testID="whats-new-detail-error"
      >
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
          }}
        >
          <Text className="text-destructive text-center text-lg mb-4">Report not found</Text>
          <Button
            onPress={handleBack}
            testID="whats-new-detail-go-back"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text>Go Back</Text>
          </Button>
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout edges="none" testID="whats-new-detail-layout">
      <DeepResearchDetailView
        session={session}
        onBack={handleBack}
        onCitationPress={handleCitationPress}
        testID="whats-new-detail-view"
      />
      <WebViewSheet
        visible={!!webViewUrl}
        url={webViewUrl ?? ''}
        onClose={() => setWebViewUrl(null)}
        testID="whats-new-webview-sheet"
      />
      <NavigationTooltip />
    </ScreenLayout>
  );
}
