import { useQuery } from 'convex/react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { ScreenLayout } from '@/components/ui/screen-layout'
import { ActivityIndicator, ScrollView, View } from 'react-native'
import { Text } from '@/components/ui/text'
import { CategoryBadge, type CategoryType } from '@/components/CategoryBadge'
import { MarkdownView } from '@/components/markdown/MarkdownView'
import { useWebView } from '@/hooks/useWebView'
import { sanitizeMarkdown, isValidUrl } from '@/lib/sanitizeMarkdown'
import { useMemo } from 'react'
import { Calendar, Clock } from 'lucide-react-native'

/**
 * Article detail route - displays full article content with markdown rendering
 * Dynamic route accessed via /articles/[id]
 */
export default function ArticleDetailRoute() {
  const router = useRouter()
  const params = useLocalSearchParams<{ id: string }>()
  const { openUrl } = useWebView()

  // Extract and validate ID - must be a valid Convex ID format
  const id = params.id
  const isValidId = id && id !== 'undefined' && id.length > 0

  // Fetch the document by ID - skip if no valid ID
  const document = useQuery(
    api.documents.queries.get,
    isValidId ? { id: id as Id<'documents'> } : 'skip'
  )

  // Validate category is a known CategoryType
  const isValidCategory = (cat: string): cat is CategoryType => {
    return [
      'research',
      'general',
      'patterns',
      'business',
      'technical-analysis',
      'platforms',
      'libraries',
      'claude-code-configuration',
    ].includes(cat)
  }

  // Sanitize markdown content
  const sanitizedContent = useMemo(
    () => sanitizeMarkdown(document?.content || ''),
    [document?.content]
  )

  // Handle link press with URL validation
  const handleLinkPress = (url: string): boolean => {
    if (!isValidUrl(url)) {
      console.warn('[ArticleDetailRoute] Blocked unsafe URL:', url)
      return false
    }
    openUrl(url)
    return true
  }

  // Format date
  const dateObj = document?.createdAt
    ? new Date(document.createdAt)
    : document?.date
    ? new Date(document.date)
    : new Date()

  const formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const formattedTime = dateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  // Loading state (only when we have a valid ID and are fetching)
  if (isValidId && document === undefined) {
    return (
      <ScreenLayout
        header={{
          title: 'Article',
          showBack: true,
          onBack: () => router.back(),
        }}
        edges="bottom"
        testID="article-detail-loading-layout"
      >
        <View className="flex-1 items-center justify-center" testID="article-detail-loading">
          <ActivityIndicator size="large" testID="article-detail-loading-indicator" />
        </View>
      </ScreenLayout>
    )
  }

  // Error state - invalid ID
  if (!isValidId) {
    return (
      <ScreenLayout
        header={{
          title: 'Article Not Found',
          showBack: true,
          onBack: () => router.back(),
        }}
        edges="bottom"
        testID="article-detail-invalid-id-layout"
      >
        <View className="flex-1 items-center justify-center p-6" testID="article-detail-invalid-id">
          <Text className="text-muted-foreground text-center text-lg">
            Invalid article ID. Please select an article from the list.
          </Text>
        </View>
      </ScreenLayout>
    )
  }

  // Error state - document not found
  if (document === null) {
    return (
      <ScreenLayout
        header={{
          title: 'Article Not Found',
          showBack: true,
          onBack: () => router.back(),
        }}
        edges="bottom"
        testID="article-detail-error-layout"
      >
        <View className="flex-1 items-center justify-center p-6" testID="article-detail-error">
          <Text className="text-muted-foreground text-center text-lg">
            This article could not be found.
          </Text>
        </View>
      </ScreenLayout>
    )
  }

  const category: CategoryType = isValidCategory(document.category)
    ? document.category
    : 'general'

  return (
    <ScreenLayout
      header={{
        title: document.title,
        showBack: true,
        onBack: () => router.back(),
      }}
      edges="bottom"
      testID="article-detail-layout"
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-6 pb-12"
        testID="article-detail-scroll"
        showsVerticalScrollIndicator={true}
      >
        {/* Metadata Row */}
        <View className="mb-6 flex-row flex-wrap items-center gap-3">
          <CategoryBadge category={category} />
          <View className="flex-row items-center gap-1">
            <Calendar size={12} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-xs">{formattedDate}</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Clock size={12} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-xs">{formattedTime}</Text>
          </View>
          {document.iterations && document.iterations > 1 && (
            <Text className="text-muted-foreground text-xs">
              {document.iterations} iterations
            </Text>
          )}
        </View>

        {/* Title */}
        <Text className="text-foreground mb-6 text-2xl font-bold leading-tight">
          {document.title}
        </Text>

        {/* Content - Markdown */}
        <MarkdownView
          content={sanitizedContent}
          onLinkPress={handleLinkPress}
          contentOnly={true}
          testID="article-detail-markdown"
        />
      </ScrollView>
    </ScreenLayout>
  )
}
