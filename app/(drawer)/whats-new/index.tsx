import { useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Text } from '@/components/ui/text'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { NewsStream, type NewsItem } from '@/components/whats-new/NewsStream'
import { useRouter } from 'expo-router'
import { useTheme } from '@/hooks/use-theme'
import { ScreenLayout } from '@/components/ui/screen-layout'
import { WebViewSheet } from '@/components/webview/WebViewSheet'

/**
 * What's New Screen - Card-based stream layout
 *
 * Displays individual articles from the latest What's New findings.
 * Each card shows a rich preview and opens the article in a webview on tap.
 *
 * Route: /whats-new
 */
export default function WhatsNewScreen() {
  const router = useRouter()
  const { colors: themeColors, spacing: semanticSpacing } = useTheme()

  // Fetch latest findings (individual articles)
  const data = useQuery(api.whatsNew.queries.getLatestFindings, {})
  const isLoading = data === undefined
  const findings = data?.findings ?? []

  const [webViewUrl, setWebViewUrl] = useState<string | null>(null)

  const handleCardPress = (_id: string, url: string | undefined) => {
    if (url) {
      setWebViewUrl(url)
    }
  }

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.navigate('/chat/new')
    }
  }

  // Transform findings to NewsItem format (individual articles with URLs)
  const newsItems: NewsItem[] = (findings ?? []).map((finding: any) => ({
    id: finding.url || finding.title,
    title: finding.title,
    summary: finding.summary,
    source: finding.source,
    publishedAt: finding.publishedAt ? new Date(finding.publishedAt).getTime() : undefined,
    url: finding.url,
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

  if (!findings || findings.length === 0) {
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
          <Text className="text-foreground text-lg mb-4">No articles yet</Text>
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
      <WebViewSheet
        visible={!!webViewUrl}
        url={webViewUrl ?? ''}
        onClose={() => setWebViewUrl(null)}
        testID="whats-new-webview-sheet"
      />
    </ScreenLayout>
  )
}
