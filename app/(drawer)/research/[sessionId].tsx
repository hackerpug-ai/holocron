import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
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

/**
 * Transform session data to DeepResearchDetailView format
 */
function transformSessionToViewFormat(
  session: DeepResearchSessionWithIterations
): DeepResearchDetailViewProps {
  // Transform iterations to the view format
  // Defensive: handle case where iterations might be undefined at runtime
  const iterations: ResearchIteration[] = (session.iterations ?? []).map((iter) => ({
    iterationNumber: iter.iterationNumber,
    coverageScore: iter.coverageScore ?? 0,
    feedback: iter.feedback ?? undefined,
    refinedQueries: iter.refinedQueries ?? undefined,
    findings: iter.findings ? [iter.findings] : undefined,
    isActive: iter.status === 'running',
    isComplete: iter.status === 'completed',
  }))

  // TODO: Extract citations from the findings/report when available
  // For now, return empty array - this can be enhanced later
  const citations: Citation[] = []

  return {
    session: {
      id: session.id,
      query: session.topic,
      report: (session.iterations ?? [])
        .filter((i) => i.findings)
        .map((i) => `## Iteration ${i.iterationNumber}\n\n${i.findings}`)
        .join('\n\n---\n\n') || 'Research in progress...',
      iterations,
      citations,
      completedAt: session.status === 'completed' ? new Date(session.updatedAt) : undefined,
      savedToHolocron: false, // TODO: Determine from document storage
    },
  }
}

/**
 * Deep Research Detail Screen
 *
 * Displays the full details of a deep research session including:
 * - Synthesized report
 * - Iteration timeline with score progression
 * - Expandable iteration cards
 * - Citations list
 *
 * Route: /research/[sessionId]
 */
export default function ResearchDetailScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()
  const router = useRouter()
  const theme = useTheme()
  const { session, isLoading, error } = useDeepResearchSession(sessionId ?? null)

  const [viewData, setViewData] = useState<DeepResearchDetailViewProps | null>(null)

  // Transform session data when it changes
  useEffect(() => {
    if (session) {
      setViewData(transformSessionToViewFormat(session))
    } else {
      setViewData(null)
    }
  }, [session])

  const handleBack = () => {
    router.back()
  }

  const handleCitationPress = (url: string) => {
    // Open citation URL in WebView
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
      session={viewData.session}
      onBack={handleBack}
      onCitationPress={handleCitationPress}
      testID="research-detail-view"
    />
  )
}

/**
 * Local interface for DeepResearchDetailView props to match the component's expected format
 */
interface DeepResearchDetailViewProps {
  session: {
    id: string
    query: string
    report: string
    iterations: ResearchIteration[]
    citations: Citation[]
    completedAt?: Date
    savedToHolocron?: boolean
  }
}
