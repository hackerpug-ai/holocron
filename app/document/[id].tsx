import { useQuery, useMutation, useAction } from 'convex/react'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
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
import { WebViewSheet } from '@/components/webview/WebViewSheet'
import { sanitizeMarkdown, isValidUrl } from '@/lib/sanitizeMarkdown'
import { slugify, extractTextFromMdast } from '@/lib/slugify'
import { mapDocumentCategoryToCategoryType } from '@/lib/category-mapping'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@/hooks/use-theme'
import { Calendar, Clock, EllipsisVertical, Globe } from '@/components/ui/icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNarrationState } from '@/components/narration/hooks/useNarrationState'
import { useAudioPlayback } from '@/components/narration/hooks/useAudioPlayback'
import { NarrationControlBar, NARRATION_BAR_HEIGHT } from '@/components/narration/NarrationControlBar'
import { DocumentActionsSheet } from '@/components/documents/DocumentActionsSheet'
import { TextSelectionSheet } from '@/components/documents/TextSelectionSheet'
import { ChatPickerSheet } from '@/components/chat/ChatPickerSheet'
import Animated, {
  type SharedValue,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing as REasing,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import * as Clipboard from 'expo-clipboard'
import { parseMarkdown } from '@/components/markdown/parsers'
import { computeNarrationMap, extractTextFromNode, findNearestOffset } from '@/lib/mdast-utils'
import { extractParagraphs } from '@/lib/extractParagraphs'
import {
  saveNarrationProgress,
  loadNarrationProgress,
  clearNarrationProgress,
} from '@/components/narration/hooks/useNarrationProgress'
import type { Root } from 'mdast'

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
  const params = useLocalSearchParams<{ id: string; highlightBlock?: string }>()
  const publish = useMutation(api.documents.mutations.publishDocument)
  const unpublish = useMutation(api.documents.mutations.unpublishDocument)
  const createConversation = useMutation(api.conversations.mutations.create)
  const createMessage = useMutation(api.chatMessages.mutations.create)
  const [isSharing, setIsSharing] = useState(false)
  const [actionsSheetVisible, setActionsSheetVisible] = useState(false)
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null)
  const [chatPickerVisible, setChatPickerVisible] = useState(false)
  const [textSelectionVisible, setTextSelectionVisible] = useState(false)
  /** Stores the text and root index for the currently selected block */
  const selectedBlockRef = useRef<{ text: string; rootIndex: number } | null>(null)
  /** Whether the chat picker was opened for a full doc or an excerpt */
  const chatContextRef = useRef<{ scope: 'full' | 'excerpt'; excerpt?: string; blockIndex?: number }>({ scope: 'full' })

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
  const { colors: themeColors, typography, spacing } = useTheme()
  const scrollViewRef = useRef<ScrollViewType>(null)
  const paragraphOffsets = useRef<Map<number, number>>(new Map())
  const headingOffsets = useRef<Map<string, number>>(new Map())
  const generatingRef = useRef(false)
  const skipDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [copiedToast, setCopiedToast] = useState(false)

  // Highlight-on-navigate: block index from query params
  const highlightBlockIndex = params.highlightBlock !== undefined
    ? parseInt(params.highlightBlock, 10)
    : null
  const [highlightedBlock, setHighlightedBlock] = useState<number | null>(highlightBlockIndex)
  const highlightOpacity = useSharedValue(highlightBlockIndex !== null ? 1 : 0)
  /** Track block offsets for highlight scroll (separate from narration offsets) */
  const blockOffsets = useRef<Map<number, number>>(new Map())

  // Parse MDAST for narration index mapping and copy support
  const parsedAst = useMemo<Root | null>(
    () => sanitizedContent ? parseMarkdown(sanitizedContent) : null,
    [sanitizedContent]
  )

  // Extract paragraphs using the same logic as the backend (convex/audio/actions.ts)
  // to ensure frontend narration indices match audio segment indices exactly
  const backendParagraphs = useMemo(
    () => sanitizedContent ? extractParagraphs(sanitizedContent) : [],
    [sanitizedContent]
  )

  // Compute narration segment map (root child index → backend paragraph index)
  // Uses text-matching to align MDAST nodes with backend audio segments
  const narrationMap = useMemo(
    () => parsedAst ? computeNarrationMap(parsedAst, backendParagraphs) : new Map<number, number>(),
    [parsedAst, backendParagraphs]
  )

  // Paragraph count must match the backend's segment count (not MDAST node count)
  const paragraphCount = backendParagraphs.length

  const narration = useNarrationState(paragraphCount)
  const { isNarrationMode } = narration

  // Stop narration when navigating away from the document
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (narration.isNarrationMode) {
          narration.exitNarrationMode()
        }
      }
    }, [narration.isNarrationMode])
  )

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

  const audioSegments: import('@/components/narration/hooks/useAudioPlayback').AudioSegment[] = segments.map((s: any) => ({
    _id: s._id,
    paragraphIndex: s.paragraphIndex,
    status: s.status,
    audioUrl: s.audioUrl,
    durationMs: s.durationMs ?? undefined,
  }))

  const { isLoading: isSegmentLoading } = useAudioPlayback(audioSegments, narration, {
    title: document?.title ?? 'Narration',
  })

  useEffect(() => {
    if (!isNarrationMode || segments.length === 0) return
    const completedCount = segments.filter((s: { status: string }) => s.status === 'completed').length
    const totalDuration = segments.reduce((sum: number, s: { durationMs?: number | null }) => sum + (s.durationMs ?? 0), 0)
    narration.onParagraphReady(completedCount, totalDuration / 1000)
    if (audioJob && completedCount === audioJob.totalSegments && audioJob.totalSegments > 0) {
      narration.onAllReady()
    }
  }, [segments, isNarrationMode, audioJob])

  // ─── Narration progress persistence ──────────────────────────────────────

  // Save progress when paragraph changes during playback
  useEffect(() => {
    if (!documentId || !isNarrationMode) return
    const { activeParagraphIndex, playbackSpeed, status } = narration.state
    if (activeParagraphIndex < 0) return
    if (status === 'playing' || status === 'paused') {
      saveNarrationProgress(documentId, {
        activeParagraphIndex,
        playbackSpeed,
        lastUpdated: Date.now(),
      })
    }
  }, [documentId, isNarrationMode, narration.state.activeParagraphIndex, narration.state.status])

  // Clear progress when narration finishes (paused on last segment)
  useEffect(() => {
    if (!documentId || !isNarrationMode) return
    const { activeParagraphIndex, totalParagraphs, status } = narration.state
    if (status === 'paused' && activeParagraphIndex >= totalParagraphs - 1 && totalParagraphs > 0) {
      clearNarrationProgress(documentId)
    }
  }, [documentId, isNarrationMode, narration.state.status, narration.state.activeParagraphIndex, narration.state.totalParagraphs])

  useEffect(() => {
    paragraphOffsets.current.clear()
    headingOffsets.current.clear()
    blockOffsets.current.clear()
  }, [sanitizedContent])

  // Scroll to highlighted block after layout and fade highlight
  useEffect(() => {
    if (highlightedBlock === null) return
    // Give blocks time to measure layout
    const scrollTimer = setTimeout(() => {
      const offset = blockOffsets.current.get(highlightedBlock)
      if (offset !== undefined) {
        scrollViewRef.current?.scrollTo({ y: Math.max(0, offset - 100), animated: true })
      }
    }, 400)
    // Start highlight flash: hold bright for 1.5s, then fade out over 1s
    highlightOpacity.value = withSequence(
      withTiming(1, { duration: 200 }),
      withDelay(1500, withTiming(0, { duration: 1000, easing: REasing.out(REasing.cubic) }))
    )
    // Clear highlight state after animation completes
    const clearTimer = setTimeout(() => setHighlightedBlock(null), 3000)
    return () => {
      clearTimeout(scrollTimer)
      clearTimeout(clearTimer)
    }
  }, [highlightedBlock])

  const generateAction = useAction(api.audio.actions.generateForDocument)
  const regenerateAction = useAction(api.audio.actions.regenerateForDocument)
  const retryFailedAction = useAction(api.audio.actions.retryFailedSegments)

  const handleRetryFailed = async () => {
    if (!documentId) return
    await retryFailedAction({ documentId })
  }

  const handleLinkPress = (url: string): boolean => {
    // Handle internal anchor links
    if (url.startsWith('#')) {
      const targetSlug = slugify(decodeURIComponent(url.slice(1)))
      const offset = headingOffsets.current.get(targetSlug)
      if (offset !== undefined) {
        scrollViewRef.current?.scrollTo({ y: Math.max(0, offset - 80), animated: true })
      }
      return true
    }
    if (!isValidUrl(url)) {
      console.warn('[DocumentRoute] Blocked unsafe URL:', url)
      return false
    }
    setWebViewUrl(url)
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

  const _handleUnpublish = async () => {
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
        // Restore saved progress if available
        const saved = await loadNarrationProgress(documentId)
        if (saved && saved.activeParagraphIndex > 0 && saved.activeParagraphIndex < paragraphCount) {
          narration.skipToParagraph(saved.activeParagraphIndex)
          if (saved.playbackSpeed && saved.playbackSpeed !== 1) {
            narration.setSpeed(saved.playbackSpeed)
          }
        }
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

  // Extract text from a block and show the text selection sheet
  const handleLongPressBlock = useCallback((rootChildIndex: number) => {
    if (!parsedAst) return
    const node = parsedAst.children[rootChildIndex]
    if (!node) return
    const text = extractTextFromNode(node)
    if (!text.trim()) return
    selectedBlockRef.current = { text, rootIndex: rootChildIndex }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setTextSelectionVisible(true)
  }, [parsedAst])

  // Copy the currently selected block text to clipboard
  const handleCopySelected = useCallback(async () => {
    if (!selectedBlockRef.current) return
    await Clipboard.setStringAsync(selectedBlockRef.current.text)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setCopiedToast(true)
    setTimeout(() => setCopiedToast(false), 1500)
  }, [])

  // Start narration from the selected block (from long-press)
  const handleListenFromBlock = useCallback(async () => {
    if (!selectedBlockRef.current) return
    const narrationIndex = narrationMap.get(selectedBlockRef.current.rootIndex)
    if (narrationIndex === undefined) return

    if (!isNarrationMode) {
      // Enter narration mode and skip to the selected paragraph
      if (generatingRef.current) return
      generatingRef.current = true
      narration.enterNarrationMode()
      if (documentId) {
        try {
          await generateAction({ documentId })
          narration.skipToParagraph(narrationIndex)
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
    } else {
      // Already in narration mode — just skip to the paragraph
      narration.skipToParagraph(narrationIndex)
    }
  }, [narrationMap, isNarrationMode, narration, documentId, generateAction])

  // Open chat picker for an excerpt (from long-press)
  const handleAddExcerptToChat = useCallback(() => {
    if (!selectedBlockRef.current) return
    chatContextRef.current = {
      scope: 'excerpt',
      excerpt: selectedBlockRef.current.text,
      blockIndex: selectedBlockRef.current.rootIndex,
    }
    setChatPickerVisible(true)
  }, [])

  // Open chat picker for the full document (from actions sheet)
  const handleAddFullDocToChat = useCallback(() => {
    chatContextRef.current = { scope: 'full' }
    setChatPickerVisible(true)
  }, [])

  // Handle conversation selection from ChatPickerSheet
  const handleChatSelected = useCallback(async (conversationId: string) => {
    if (!document || !id) return
    const { scope, excerpt, blockIndex } = chatContextRef.current
    const category = mapDocumentCategoryToCategoryType(document.category)

    try {
      let targetConversationId: Id<'conversations'>

      if (conversationId === 'new') {
        targetConversationId = await createConversation({
          title: document.title,
          lastMessagePreview: scope === 'excerpt' ? excerpt?.slice(0, 100) : `Added: ${document.title}`,
        })
      } else {
        targetConversationId = conversationId as Id<'conversations'>
      }

      // Create user message with document context card
      const content = scope === 'excerpt'
        ? `I'd like to discuss this excerpt from "${document.title}":\n\n${excerpt}`
        : `I'd like to discuss this document: ${document.title}`

      await createMessage({
        conversationId: targetConversationId,
        role: 'user',
        content,
        messageType: 'result_card',
        cardData: {
          card_type: 'document_context',
          document_id: id,
          title: document.title,
          category,
          scope,
          ...(scope === 'full' ? { snippet: document.content.replace(/^---[\s\S]*?---\n*/, '').replace(/[#*_`>[\]]/g, '').trim().slice(0, 120) } : {}),
          ...(scope === 'excerpt' && excerpt ? { excerpt } : {}),
          ...(scope === 'excerpt' && blockIndex !== undefined ? { blockIndex } : {}),
        },
        documentId: id as Id<'documents'>,
      })

      // Navigate to the chat
      router.push(`/chat/${targetConversationId}`)
    } catch (err) {
      console.warn('[DocumentRoute] Add to chat error:', err)
      Alert.alert('Error', 'Failed to add document to chat. Please try again.')
    }
  }, [document, id, createConversation, createMessage, router])

  // Get heading slug for a root-level heading node
  const getHeadingSlug = useCallback((rootIndex: number): string | null => {
    if (!parsedAst) return null
    const node = parsedAst.children[rootIndex]
    if (!node || node.type !== 'heading') return null
    const headingText = extractTextFromMdast(node)
    return slugify(headingText)
  }, [parsedAst])

  // Wrap each root-level MDAST child with narration highlight and/or copy support
  const wrapRootChild = useMemo(() => {
    return (child: React.ReactNode, rootIndex: number, nodeType: string) => {
      const narrationIndex = narrationMap.get(rootIndex)
      const headingSlug = nodeType === 'heading' ? getHeadingSlug(rootIndex) : null

      // In narration mode: wrap with highlight + tap-to-skip + long-press for actions
      if (isNarrationMode && narrationIndex !== undefined) {
        const isActive = narration.state.activeParagraphIndex === narrationIndex
        return (
          <Pressable
            key={`narration-${narrationIndex}`}
            testID={`narration-block-${narrationIndex}`}
            onPress={() => {
              // Haptic fires immediately for a responsive feel
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              // Debounce the actual skip to prevent overlapping player teardown/create cycles
              if (skipDebounceRef.current !== null) {
                clearTimeout(skipDebounceRef.current)
              }
              skipDebounceRef.current = setTimeout(() => {
                skipDebounceRef.current = null
                narration.skipToParagraph(narrationIndex)
              }, 200)
            }}
            onLongPress={() => handleLongPressBlock(rootIndex)}
            onLayout={(e) => {
              paragraphOffsets.current.set(narrationIndex, e.nativeEvent.layout.y)
              if (headingSlug) {
                headingOffsets.current.set(headingSlug, e.nativeEvent.layout.y)
              }
            }}
          >
            <NarrationHighlightBlock isActive={isActive} primaryColor={themeColors.primary}>
              {child}
            </NarrationHighlightBlock>
          </Pressable>
        )
      }

      // Normal mode: long-press for actions sheet, track heading positions for internal links
      const isHighlighted = highlightedBlock === rootIndex
      const isSelected = textSelectionVisible && selectedBlockRef.current?.rootIndex === rootIndex

      const block = (
        <Pressable
          testID={`doc-block-${rootIndex}`}
          onLongPress={() => handleLongPressBlock(rootIndex)}
          onLayout={(e) => {
            blockOffsets.current.set(rootIndex, e.nativeEvent.layout.y)
            if (headingSlug) {
              headingOffsets.current.set(headingSlug, e.nativeEvent.layout.y)
            }
          }}
        >
          <Animated.View
            style={{
              backgroundColor: isSelected ? `${themeColors.primary}14` : 'transparent',
              borderLeftWidth: isSelected ? 2 : 0,
              borderLeftColor: isSelected ? themeColors.primary : 'transparent',
              paddingLeft: isSelected ? 8 : 0,
            }}
          >
            {child}
          </Animated.View>
        </Pressable>
      )

      // Wrap with animated highlight if this is the targeted block
      if (isHighlighted) {
        return (
          <HighlightWrap opacity={highlightOpacity} color={themeColors.primary}>
            {block}
          </HighlightWrap>
        )
      }

      return block
    }
  }, [isNarrationMode, narrationMap, narration.state.activeParagraphIndex, themeColors.primary, handleLongPressBlock, getHeadingSlug, highlightedBlock, highlightOpacity, textSelectionVisible])

  // Auto-scroll to active paragraph (with fallback for unmapped indices)
  useEffect(() => {
    if (!isNarrationMode || narration.state.activeParagraphIndex < 0) return
    const offset = paragraphOffsets.current.get(narration.state.activeParagraphIndex)
      ?? findNearestOffset(paragraphOffsets.current, narration.state.activeParagraphIndex)
    if (offset !== undefined) {
      scrollViewRef.current?.scrollTo({ y: Math.max(0, offset - 120), animated: true })
    }
  }, [isNarrationMode, narration.state.activeParagraphIndex])

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

  // TypeScript narrowing: after loading/null/invalid guards above, document is defined
  if (!document) return null

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
            wrapRootChild={wrapRootChild}
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
        onAddToChatPress={handleAddFullDocToChat}
        isNarrationActive={isNarrationMode}
        isPublic={document.isPublic}
      />

      <WebViewSheet
        visible={webViewUrl !== null}
        url={webViewUrl ?? ''}
        onClose={() => setWebViewUrl(null)}
      />

      <TextSelectionSheet
        visible={textSelectionVisible}
        onClose={() => setTextSelectionVisible(false)}
        onCopy={handleCopySelected}
        onAddToChat={handleAddExcerptToChat}
        onListen={handleListenFromBlock}
        previewText={selectedBlockRef.current?.text}
      />

      <ChatPickerSheet
        visible={chatPickerVisible}
        onClose={() => setChatPickerVisible(false)}
        onSelect={handleChatSelected}
      />

      {copiedToast && (
        <View
          style={{
            position: 'absolute',
            bottom: isNarrationMode ? NARRATION_BAR_HEIGHT + insets.bottom + 16 : insets.bottom + 16,
            alignSelf: 'center',
            backgroundColor: themeColors.foreground,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            borderRadius: 20,
          }}
          pointerEvents="none"
        >
          <Text style={{ color: themeColors.background, fontSize: typography.label.fontSize, fontWeight: typography.label.fontWeight }}>
            Copied to clipboard
          </Text>
        </View>
      )}
    </ScreenLayout>
  )
}

/**
 * Animated narration highlight wrapper.
 * Smoothly transitions the active paragraph's background, border, and padding
 * using withTiming instead of instant style swaps.
 */
function NarrationHighlightBlock({
  children,
  isActive,
  primaryColor,
}: {
  children: React.ReactNode
  isActive: boolean
  primaryColor: string
}) {
  const activeValue = useSharedValue(isActive ? 1 : 0)

  useEffect(() => {
    activeValue.value = withTiming(isActive ? 1 : 0, { duration: 150 })
  }, [isActive, activeValue])

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: activeValue.value > 0
      ? `${primaryColor}${Math.round(activeValue.value * 0x14).toString(16).padStart(2, '0')}`
      : 'transparent',
    borderLeftWidth: activeValue.value * 2,
    borderLeftColor: primaryColor,
    paddingLeft: activeValue.value * 8,
  }))

  return (
    <Animated.View style={animatedStyle}>
      {children}
    </Animated.View>
  )
}

/**
 * Animated highlight wrapper for scroll-to-highlight feature.
 * Renders a colored border-left and subtle background that fades out.
 */
function HighlightWrap({
  children,
  opacity,
  color,
}: {
  children: React.ReactNode
  opacity: SharedValue<number>
  color: string
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: `${color}${Math.round(opacity.value * 20).toString(16).padStart(2, '0')}`,
    borderLeftWidth: 3,
    borderLeftColor: color,
    paddingLeft: 8,
    borderRadius: 4,
  }))

  return (
    <Animated.View style={animatedStyle}>
      {children}
    </Animated.View>
  )
}
