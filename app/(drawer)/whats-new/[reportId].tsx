import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { whatsNewReportById } from '@/app/zero/queries';
import {
  DeepResearchDetailView,
  type DeepResearchSession,
} from '@/components/deep-research/DeepResearchDetailView';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from '@/components/ui/icons';
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

function findingsToBody(findingsJson: unknown): string {
  if (findingsJson == null) return '';
  if (typeof findingsJson === 'string') {
    try {
      const parsed = JSON.parse(findingsJson) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((f: { title?: string; summary?: string }) =>
            [f.title, f.summary].filter(Boolean).join('\n')
          )
          .join('\n\n');
      }
      return findingsJson;
    } catch {
      return findingsJson;
    }
  }
  if (Array.isArray(findingsJson)) {
    return findingsJson
      .map((f: { title?: string; summary?: string }) =>
        [f.title, f.summary].filter(Boolean).join('\n')
      )
      .join('\n\n');
  }
  try {
    return JSON.stringify(findingsJson, null, 2);
  } catch {
    return String(findingsJson);
  }
}

/**
 * Transform What's New report (Zero row) to DeepResearchSession format
 */
function transformReportToSession(row: ReportRow | null | undefined): DeepResearchSession | null {
  if (!row) return null;

  const body = findingsToBody(row.findings_json);
  const periodStart = row.period_start ?? row.created_at;
  const periodEnd = row.period_end ?? row.created_at;

  return {
    id: row.id,
    query: `What's New in AI (${formatPeriod(periodStart, periodEnd)})`,
    report: body.length > 0 ? body : 'Report content not available.',
    iterations: [],
    citations: [],
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
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            gap: theme.spacing.md,
          }}
        >
          <Pressable onPress={handleBack} style={{ padding: theme.spacing.sm }}>
            <ArrowLeft size={24} color={theme.colors.foreground} />
          </Pressable>
          <Text
            style={{
              flex: 1,
              fontSize: theme.typography.h4.fontSize,
              fontWeight: theme.typography.h4.fontWeight,
              color: theme.colors.foreground,
            }}
          >
            Loading...
          </Text>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text className="text-muted-foreground mt-4">Loading report...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            gap: theme.spacing.md,
          }}
        >
          <Pressable onPress={handleBack} style={{ padding: theme.spacing.sm }}>
            <ArrowLeft size={24} color={theme.colors.foreground} />
          </Pressable>
          <Text
            style={{
              flex: 1,
              fontSize: theme.typography.h4.fontSize,
              fontWeight: theme.typography.h4.fontWeight,
              color: theme.colors.foreground,
            }}
          >
            Error
          </Text>
        </View>

        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
          }}
        >
          <Text className="text-destructive text-center text-lg mb-4">Report not found</Text>
          <Button onPress={handleBack}>
            <Text>Go Back</Text>
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
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
    </>
  );
}
