import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useTheme } from '@/hooks/use-theme'
import {
  DeepResearchDetailView,
  type DeepResearchSession,
} from '@/components/deep-research/DeepResearchDetailView'
import { useMemo } from 'react'
import type { Id } from '@/convex/_generated/dataModel'

/**
 * Format date period for title
 */
function formatPeriod(periodStart: number, periodEnd: number): string {
  const start = new Date(periodStart).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  const end = new Date(periodEnd).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${start} - ${end}`
}

/**
 * Transform What's New report to DeepResearchSession format
 */
function transformReportToSession(
  reportData: {
    report: {
      _id: Id<'whatsNewReports'>
      periodStart: number
      periodEnd: number
      days: number
      findingsCount: number
      documentId?: Id<'documents'>
      createdAt: number
    }
    content: string | null
    generatedAt: number
  } | null | undefined
): DeepResearchSession | null {
  if (!reportData) return null

  const { report, content } = reportData

  return {
    id: report._id,
    query: `What's New in AI (${formatPeriod(report.periodStart, report.periodEnd)})`,
    report: content ?? 'Report content not available.',
    iterations: [], // Not applicable for What's New
    citations: [], // Could be extracted from content in the future
    completedAt: new Date(report.createdAt),
    savedToHolocron: !!report.documentId,
    confidence: 'HIGH', // Curated content
    sourcesCount: report.findingsCount,
  }
}

/**
 * What's New Report Detail Screen
 *
 * Displays the full What's New report using the same view as deep research.
 *
 * Route: /whats-new/[reportId]
 */
export default function WhatsNewDetailScreen() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>()
  const router = useRouter()
  const theme = useTheme()

  const reportData = useQuery(
    api.whatsNew.queries.getReportById,
    reportId ? { reportId: reportId as Id<'whatsNewReports'> } : 'skip'
  )

  const isLoading = reportData === undefined
  const session = useMemo(() => transformReportToSession(reportData), [reportData])

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

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text className="text-muted-foreground mt-4">Loading report...</Text>
        </View>
      </SafeAreaView>
    )
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
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: theme.colors.foreground }}>
            Error
          </Text>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl }}>
          <Text className="text-destructive text-center text-lg mb-4">
            Report not found
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
      session={session}
      onBack={handleBack}
      onCitationPress={handleCitationPress}
      testID="whats-new-detail-view"
    />
  )
}
