import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { useDeepResearchSession } from '@/hooks/useResearchSession'
import { useTheme } from '@/hooks/use-theme'
import {
  DeepResearchDetailView,
  type Citation,
  type ResearchIteration,
} from '@/components/deep-research/DeepResearchDetailView'
import type { DeepResearchSessionWithIterations } from '@/lib/types/deep-research'
import { useMemo } from 'react'

/**
 * Transform session data to DeepResearchDetailView format
 * Returns null if session is not available
 */
function transformSessionToViewFormat(
  session: DeepResearchSessionWithIterations | null | undefined
) {
  if (!session) return null

  // Transform iterations to the view format (kept for backward compatibility)
  const iterations: ResearchIteration[] = (session.iterations ?? []).map((iter) => ({
    iterationNumber: iter.iterationNumber,
    coverageScore: iter.coverageScore ?? 0,
    feedback: iter.feedback ?? undefined,
    refinedQueries: iter.refinedQueries ?? undefined,
    findings: iter.findings ? [iter.findings] : undefined,
    isActive: iter.status === 'running',
    isComplete: iter.status === 'completed',
  }))

  // Extract citations from document if available
  const citations: Citation[] = []

  // Determine confidence level
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM'
  if (iterations.length > 0) {
    const lastScore = iterations[iterations.length - 1].coverageScore
    confidence = lastScore >= 4 ? 'HIGH' : lastScore >= 3 ? 'MEDIUM' : 'LOW'
  }

  return {
    id: session.id,
    query: session.topic,
    report: session.report ?? 'Research in progress...',
    iterations,
    citations,
    completedAt: session.status === 'completed' ? new Date(session.updatedAt) : undefined,
    savedToHolocron: !!session.documentId,
    confidence,
    sourcesCount: undefined, // Could be derived from iterations if needed
  }
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
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()
  const router = useRouter()
  const theme = useTheme()
  const { session, isLoading, error } = useDeepResearchSession(sessionId ?? null)

  // Derive view data directly from session query (no useState + useEffect sync)
  const viewData = useMemo(() => transformSessionToViewFormat(session), [session])

  const handleBack = () => {
    router.back()
  }

  const handleCitationPress = (url: string) => {
    const encodedUrl = encodeURIComponent(url)
    router.push(`/webview/${encodedUrl}`)
  }

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
        {/* Header */}
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
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: theme.colors.foreground }}>
            Loading...
          </Text>
        </View>

        {/* Loading state */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text className="text-muted-foreground mt-4">Loading research session...</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (error || !viewData) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
        {/* Header */}
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
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: theme.colors.foreground }}>
            Error
          </Text>
        </View>

        {/* Error state */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl }}>
          <Text className="text-destructive text-center text-lg mb-4">
            Research session not found
          </Text>
          <Button onPress={handleBack}>
            <Text>Go Back</Text>
          </Button>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <DeepResearchDetailView
      session={viewData}
      onBack={handleBack}
      onCitationPress={handleCitationPress}
      testID="research-detail-view"
    />
  )
}
