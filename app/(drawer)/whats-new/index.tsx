import { View, ActivityIndicator } from 'react-native'
import { Text } from '@/components/ui/text'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { NewsStream, type NewsItem } from '@/components/whats-new/NewsStream'
import { useRouter } from 'expo-router'
import { useTheme } from '@/hooks/use-theme'
import { ScreenLayout } from '@/components/ui/screen-layout'

/**
 * What's New Screen - Card-based stream layout
 *
 * Displays recent What's New reports as a fixed-width card stream.
 * Each card shows AI-generated summaries and key findings.
 *
 * Route: /whats-new
 */
export default function WhatsNewScreen() {
  const router = useRouter()
  const { colors: themeColors, spacing: semanticSpacing } = useTheme()

  // Fetch recent reports
  const reportsData = useQuery(api.whatsNew.queries.listReports, { limit: 10 })
  const isLoading = reportsData === undefined

  const handleCardPress = (reportId: string) => {
    router.push(`/whats-new/${reportId}`)
  }

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.navigate('/chat/new')
    }
  }

  // Transform reports to NewsItem format
  const newsItems: NewsItem[] = (reportsData ?? []).map((report: any) => ({
    id: report._id,
    title: `What's New in AI (${report.days} days)`,
    summary: `${report.findingsCount} findings • ${report.discoveryCount || 0} discoveries • ${report.releaseCount || 0} releases`,
    publishedAt: report.createdAt,
  }))

  if (isLoading) {
    return (
      <ScreenLayout
        header={{
          title: "What's New",
          showBack: true,
          onBack: handleBack,
        }}
        edges="bottom"
        testID="whats-new-layout"
      >
        <View
          className="flex-1 items-center justify-center"
          style={{ padding: semanticSpacing.lg }}
          testID="whats-new-loading"
        >
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text className="text-muted-foreground mt-4">Loading What's New...</Text>
        </View>
      </ScreenLayout>
    )
  }

  if (!reportsData || reportsData.length === 0) {
    return (
      <ScreenLayout
        header={{
          title: "What's New",
          showBack: true,
          onBack: handleBack,
        }}
        edges="bottom"
        testID="whats-new-layout"
      >
        <View
          className="flex-1 items-center justify-center"
          style={{ padding: semanticSpacing.lg }}
          testID="whats-new-empty"
        >
          <Text className="text-foreground text-lg mb-4">No reports yet</Text>
          <Text className="text-muted-foreground text-center">
            Check back soon for the latest AI news and updates.
          </Text>
        </View>
      </ScreenLayout>
    )
  }

  return (
    <ScreenLayout
      header={{
        title: "What's New",
        showBack: true,
        onBack: handleBack,
      }}
      edges="bottom"
      testID="whats-new-layout"
    >
      <NewsStream
        items={newsItems}
        onCardPress={handleCardPress}
        testID="whats-new-stream"
      />
    </ScreenLayout>
  )
}
