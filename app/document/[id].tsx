import { useQuery, useMutation, useAction } from 'convex/react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { ScreenLayout } from '@/components/ui/screen-layout'
import {
  ActionSheetIOS,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  type ScrollView as ScrollViewType,
  Share,
  View,
} from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { CategoryBadge } from '@/components/CategoryBadge'
import { MarkdownView } from '@/components/markdown/MarkdownView'
import { useWebView } from '@/hooks/useWebView'
import { sanitizeMarkdown, isValidUrl } from '@/lib/sanitizeMarkdown'
import { extractParagraphCount } from '@/lib/extractParagraphCount'
import { mapDocumentCategoryToCategoryType } from '@/lib/category-mapping'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@/hooks/use-theme'
import { Calendar, Clock, EllipsisVertical, Globe } from '@/components/ui/icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNarrationState } from '@/components/narration/hooks/useNarrationState'
import { useAudioPlayback } from '@/components/narration/hooks/useAudioPlayback'
import { NarrationControlBar, NARRATION_BAR_HEIGHT } from '@/components/narration/NarrationControlBar'
import { DocumentActionsSheet } from '@/components/documents/DocumentActionsSheet'
import Animated from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import type { CustomRenderers } from '@/components/markdown/renderers/NodeRenderer'

const CONVEX_SITE_URL =
  process.env.EXPO_PUBLIC_CONVEX_SITE_URL ??
  (process.env.EXPO_PUBLIC_CONVEX_URL ?? '').replace('.convex.cloud', '.convex.site')

/**
 * Canonical document viewer route.
 * Displays a full document with markdown rendering, metadata, and sharing.
 *
 * Route: /document/[id]
 */
export default function DocumentRoute() {
  const router = useRouter()
  const params = useLocalSearchParams<{ id: string }>()
  const { openUrl } = useWebView()
  const publish = useMutation(api.documents.mutations.publishDocument)
  const unpublish = useMutation(api.documents.mutations.unpublishDocument)
  const [isSharing, setIsSharing] = useState(false)
  const [actionsSheetVisible, setActionsSheetVisible] = useState(false)

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.navigate('/chat/new')
    }
  }

  const id = params.id
  const isValidId = id && id !== 'undefined' && id.length > 0

  const document = useQuery(
    api.documents.queries.get,
    isValidId ? { id: id as Id<'documents'> } : 'skip'
  )

  const sanitizedContent = useMemo(
    () => sanitizeMarkdown(document?.content || ''),
    [document?.content]
  )

  const insets = useSafeAreaInsets()
  const { colors: themeColors } = useTheme()
  const scrollViewRef = useRef<ScrollViewType>(null)
  const paragraphOffsets = useRef<Map<number, number>>(new Map())
  const paragraphCounter = useRef(0)
  const generatingRef = useRef(false)

  // Count paragraphs for narration
  const paragraphCount = useMemo(
    () => extractParagraphCount(sanitizedContent),
    [sanitizedContent]
  )

  const narration = useNarrationState(paragraphCount)
  const { isNarrationMode } = narration

  // Subscribe to audio segments only when in narration mode
  const documentId = isValidId ? (id as Id<'documents'>) : undefined
  const segments = useQuery(
    api.audio.queries.getSegments,
    isNarrationMode && documentId ? { documentId } : 'skip'
  ) ?? []

  const audioJob = useQuery(
    api.audio.queries.getJob,
    isNarrationMode && documentId ? { documentId } : 'skip'
  )

  const { isLoading: isSegmentLoading } = useAudioPlayback(segments, narration)

  useEffect(() => {
    if (!isNarrationMode || segments.length === 0) return
    const completedCount = segments.filter((s: { status: string }) => s.status === 'completed').length
    const totalDuration = segments.reduce((sum: number, s: { durationMs?: number | null }) => sum + (s.durationMs ?? 0), 0)
    narration.onParagraphReady(completedCount, totalDuration / 1000)
    if (audioJob && completedCount === audioJob.totalSegments && audioJob.totalSegments > 0) {
      narration.onAllReady()
    }
  }, [segments, isNarrationMode, audioJob])

  useEffect(() => { paragraphOffsets.current.clear() }, [sanitizedContent])

  const generateAction = useAction(api.audio.actions.generateForDocument)
  const regenerateAction = useAction(api.audio.actions.regenerateForDocument)
  const retryFailedAction = useAction(api.audio.actions.retryFailedSegments)

  const handleRetryFailed = async () => {
    if (!documentId) return
    await retryFailedAction({ documentId })
  }

  const handleLinkPress = (url: string): boolean => {
    if (!isValidUrl(url)) {
      console.warn('[DocumentRoute] Blocked unsafe URL:', url)
      return false
    }
    openUrl(url)
    return true
  }

  const getShareUrl = async (): Promise<string | null> => {
    if (!document) return null
    if (document.isPublic && document.shareToken) {
      return `${CONVEX_SITE_URL}/article/${document.shareToken}`
    }
    const result = await publish({ id: id as Id<'documents'> })
    return `${CONVEX_SITE_URL}/article/${result.shareToken}`
  }

  const handleShare = async () => {
    if (!document || isSharing) return
    setIsSharing(true)
    try {
      const shareUrl = await getShareUrl()
      if (!shareUrl) return

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Cancel', 'Share Link', 'Open in Browser'],
            cancelButtonIndex: 0,
          },
          async (buttonIndex) => {
            if (buttonIndex === 1) {
              await Share.share({ url: shareUrl, title: document.title })
            } else if (buttonIndex === 2) {
              await Linking.openURL(shareUrl)
            }
            setIsSharing(false)
          }
        )
        return // setIsSharing handled in callback
      }

      // Android fallback — go straight to share sheet
      await Share.share({ url: shareUrl, title: document.title })
    } catch (err) {
      console.warn('[DocumentRoute] Share error:', err)
    } finally {
      setIsSharing(false)
    }
  }

  const handleUnpublish = async () => {
    if (!document || isSharing) return
    setIsSharing(true)
    try {
      await unpublish({ id: id as Id<'documents'> })
    } catch (err) {
      console.warn('[DocumentRoute] Unpublish error:', err)
    } finally {
      setIsSharing(false)
    }
  }

  const handleToggleNarration = async () => {
    if (isNarrationMode) {
      paragraphOffsets.current.clear()
      narration.exitNarrationMode()
      return
    }
    if (generatingRef.current) return
    generatingRef.current = true
    narration.enterNarrationMode()
    if (documentId) {
      try {
        await generateAction({ documentId })
      } catch (err) {
        console.error('[Narration] Generation failed:', err)
        Alert.alert('Narration Error', 'Failed to generate audio. Please try again.')
        narration.exitNarrationMode()
      } finally {
        generatingRef.current = false
      }
    } else {
      generatingRef.current = false
    }
  }

  // Build custom renderers only when narration mode is active
  const narrationRenderers: CustomRenderers | undefined = useMemo(() => {
    if (!isNarrationMode) return undefined

    return {
      paragraph: ({ children, testID }) => {
        const index = paragraphCounter.current
        paragraphCounter.current += 1
        const isActive = narration.state.activeParagraphIndex === index
        const capturedIndex = index

        return (
          <Pressable
            key={`narration-p-${capturedIndex}`}
            testID={`${testID}-narration-p-${capturedIndex}`}
            onPress={() => {
              narration.skipToParagraph(capturedIndex)
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            }}
            onLayout={(e) => {
              paragraphOffsets.current.set(capturedIndex, e.nativeEvent.layout.y)
            }}
          >
            <Animated.View
              style={[
                {
                  backgroundColor: isActive ? `${themeColors.primary}14` : 'transparent',
                  borderLeftWidth: isActive ? 2 : 0,
                  borderLeftColor: isActive ? themeColors.primary : 'transparent',
                  paddingLeft: isActive ? 8 : 0,
                  marginBottom: 12,
                },
              ]}
            >
              <Text className="text-foreground text-base leading-7">
                {children}
              </Text>
            </Animated.View>
          </Pressable>
        )
      },
      heading: ({ children, testID }) => {
        const index = paragraphCounter.current
        paragraphCounter.current += 1
        const isActive = narration.state.activeParagraphIndex === index
        const capturedIndex = index

        return (
          <Pressable
            key={`narration-h-${capturedIndex}`}
            testID={`${testID}-narration-h-${capturedIndex}`}
            onPress={() => {
              narration.skipToParagraph(capturedIndex)
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            }}
            onLayout={(e) => {
              paragraphOffsets.current.set(capturedIndex, e.nativeEvent.layout.y)
            }}
          >
            <Animated.View
              style={[
                {
                  backgroundColor: isActive ? `${themeColors.primary}14` : 'transparent',
                  borderLeftWidth: isActive ? 2 : 0,
                  borderLeftColor: isActive ? themeColors.primary : 'transparent',
                  paddingLeft: isActive ? 8 : 0,
                  marginBottom: 12,
                },
              ]}
            >
              <Text className="text-foreground text-xl font-semibold">
                {children}
              </Text>
            </Animated.View>
          </Pressable>
        )
      },
    }
  }, [isNarrationMode, narration.state.activeParagraphIndex, themeColors.primary])

  // Reset paragraph counter before each render
  paragraphCounter.current = 0

  // Auto-scroll to active paragraph
  useEffect(() => {
    if (!isNarrationMode || narration.state.activeParagraphIndex < 0) return
    const offset = paragraphOffsets.current.get(narration.state.activeParagraphIndex)
    if (offset !== undefined) {
      scrollViewRef.current?.scrollTo({ y: Math.max(0, offset - 120), animated: true })
    }
  }, [isNarrationMode, narration.state.activeParagraphIndex, themeColors.primary])

  // Format date/time
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

  // Loading state
  if (isValidId && document === undefined) {
    return (
      <ScreenLayout
        header={{ title: 'Document', showBack: true, onBack: handleBack }}
        edges="bottom"
        testID="document-loading-layout"
      >
        <View className="flex-1 items-center justify-center" testID="document-loading">
          <ActivityIndicator size="large" testID="document-loading-indicator" />
        </View>
      </ScreenLayout>
    )
  }

  // Error: invalid ID
  if (!isValidId) {
    return (
      <ScreenLayout
        header={{ title: 'Not Found', showBack: true, onBack: handleBack }}
        edges="bottom"
        testID="document-invalid-id-layout"
      >
        <View className="flex-1 items-center justify-center p-6" testID="document-invalid-id">
          <Text className="text-muted-foreground text-center text-lg">
            Invalid document ID. Please select a document from the list.
          </Text>
        </View>
      </ScreenLayout>
    )
  }

  // Error: not found
  if (document === null) {
    return (
      <ScreenLayout
        header={{ title: 'Not Found', showBack: true, onBack: handleBack }}
        edges="bottom"
        testID="document-error-layout"
      >
        <View className="flex-1 items-center justify-center p-6" testID="document-error">
          <Text className="text-muted-foreground text-center text-lg">
            This document could not be found.
          </Text>
          <Button onPress={handleBack} className="mt-4">
            <Text>Go Back</Text>
          </Button>
        </View>
      </ScreenLayout>
    )
  }

  const category = mapDocumentCategoryToCategoryType(document.category)

  return (
    <ScreenLayout
      header={{
        title: document.title,
        showBack: true,
        onBack: handleBack,
        rightContent: (
          <Pressable
            testID="document-actions-button"
            onPress={() => setActionsSheetVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Document actions"
            className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
          >
            <EllipsisVertical size={20} className="text-muted-foreground" />
          </Pressable>
        ),
      }}
      edges="none"
      testID="document-layout"
    >
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollViewRef}
          className="flex-1"
          contentContainerClassName="p-6"
          contentContainerStyle={{
            paddingBottom: isNarrationMode
              ? NARRATION_BAR_HEIGHT + insets.bottom + 24
              : insets.bottom + 48,
          }}
          testID="document-scroll"
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
            {document.researchType && (
              <View className="bg-muted rounded-md px-2 py-0.5">
                <Text className="text-foreground text-xs">{document.researchType}</Text>
              </View>
            )}
            {document.iterations && document.iterations > 1 && (
              <Text className="text-muted-foreground text-xs">
                {document.iterations} iterations
              </Text>
            )}
            {document.isPublic && (
              <View className="flex-row items-center gap-1">
                <Globe size={12} className="text-primary" />
                <Text className="text-primary text-xs">Shared</Text>
              </View>
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
            testID="document-markdown"
            renderers={narrationRenderers}
          />
        </ScrollView>
        {isNarrationMode && (
          <NarrationControlBar
            narration={narration}
            isVisible={isNarrationMode}
            isSegmentLoading={isSegmentLoading}
            onRegenerate={async () => {
              if (!documentId) return
              try {
                await regenerateAction({ documentId })
              } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to regenerate audio.'
                Alert.alert('Regeneration Error', message)
              }
            }}
            audioJob={audioJob}
            onRetryFailed={handleRetryFailed}
          />
        )}
      </View>

      <DocumentActionsSheet
        visible={actionsSheetVisible}
        onClose={() => setActionsSheetVisible(false)}
        onListenPress={handleToggleNarration}
        onSharePress={handleShare}
        isNarrationActive={isNarrationMode}
        isPublic={document.isPublic}
      />
    </ScreenLayout>
  )
}
