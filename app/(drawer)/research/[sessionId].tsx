import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  type Citation,
  DeepResearchDetailView,
  type ResearchIteration,
} from '@/components/deep-research/DeepResearchDetailView';
import { Button } from '@/components/ui/button';
import { ScreenLayout } from '@/components/ui/screen-layout';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';
import { useDeepResearchSession } from '@/hooks/useResearchSession';
import type { DeepResearchSessionWithIterations } from '@/lib/types/deep-research';

/**
 * Transform session data to DeepResearchDetailView format
 * Returns null if session is not available
 */
function transformSessionToViewFormat(
  session: DeepResearchSessionWithIterations | null | undefined
) {
  if (!session) return null;

  // Transform iterations to the view format (kept for backward compatibility)
  const iterations: ResearchIteration[] = (session.iterations ?? []).map((iter) => ({
    iterationNumber: iter.iterationNumber,
    coverageScore: iter.coverageScore ?? 0,
    feedback: iter.feedback ?? undefined,
    refinedQueries: iter.refinedQueries ?? undefined,
    findings: iter.findings ? [iter.findings] : undefined,
    isActive: iter.status === 'running',
    isComplete: iter.status === 'completed',
  }));

  // Extract citations from document if available
  const citations: Citation[] = [];

  // Determine confidence level
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
  if (iterations.length > 0) {
    const lastScore = iterations[iterations.length - 1].coverageScore;
    confidence = lastScore >= 4 ? 'HIGH' : lastScore >= 3 ? 'MEDIUM' : 'LOW';
  }

  return {
    id: session.id,
    query: session.topic,
    report: session.report ?? 'Research in progress...',
    iterations,
    citations: session.citations ?? citations,
    status: session.status,
    currentIteration: session.currentIteration,
    maxIterations: session.maxIterations,
    coverageScore: session.coverageScore ?? null,
    completedAt: session.status === 'completed' ? new Date(session.updatedAt) : undefined,
    savedToHolocron: !!session.documentId,
    confidence,
    sourcesCount: undefined, // Could be derived from iterations if needed
  };
}

/**
 * Deep Research Detail Screen
 *
 * Displays the full details of a deep research session including:
 * - Confidence badge
 * - Synthesized report
 * - Collapsible sources section
 *
 * Route: /research/[sessionId]
 */
export default function ResearchDetailScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const typedSessionId = sessionId ?? null;
  const { session, isLoading, error } = useDeepResearchSession(typedSessionId);

  // Derive view data directly from session query (no useState + useEffect sync).
  // Keep this hook above redirect branches so its order never changes.
  const viewData = useMemo(() => transformSessionToViewFormat(session), [session]);

  // If the research session has a saved document, redirect to the canonical document view
  // which has sharing, better rendering, and consistent UX
  if (session?.documentId) {
    return <Redirect href={`/document/${session.documentId}`} />;
  }

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate('/chat/new');
    }
  };

  const handleCitationPress = (url: string) => {
    router.push({ pathname: '/webview/[url]', params: { url } });
  };

  if (isLoading) {
    return (
      <ScreenLayout
        header={{
          title: 'Loading...',
          showBack: true,
          onBack: handleBack,
          testID: 'research-detail',
        }}
        edges="bottom"
        testID="research-detail-loading"
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text className="text-muted-foreground mt-4">Loading research session...</Text>
        </View>
      </ScreenLayout>
    );
  }

  if (error || !viewData) {
    return (
      <ScreenLayout
        header={{
          title: 'Error',
          showBack: true,
          onBack: handleBack,
          testID: 'research-detail',
        }}
        edges="bottom"
        testID="research-detail-error"
      >
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
          }}
        >
          <Text className="text-destructive text-center text-lg mb-4">
            Research session not found
          </Text>
          <Button
            onPress={handleBack}
            testID="research-detail-go-back"
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
    <ScreenLayout edges="none" testID="research-detail-layout">
      <DeepResearchDetailView
        session={viewData}
        onBack={handleBack}
        onCitationPress={handleCitationPress}
        testID="research-detail-view"
      />
    </ScreenLayout>
  );
}
