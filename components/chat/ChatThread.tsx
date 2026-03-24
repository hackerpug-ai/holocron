import { View, FlatList, ActivityIndicator, Pressable, useWindowDimensions } from 'react-native'
import { Text } from '@/components/ui/text'
import { useRef, useEffect, useCallback, useState } from 'react'
import { useRouter } from 'expo-router'
import type { MessageRole, MessageType } from '@/lib/types/conversations'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'
import { MessageActionsSheet } from './MessageActionsSheet'
import * as Haptics from 'expo-haptics'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  message_type?: MessageType
  card_data?: Record<string, unknown> | null
  toolCallId?: string | null
  createdAt: Date
}

export interface ChatThreadProps {
  messages: ChatMessage[]
  showTypingIndicator?: boolean
  /** Initial loading state - shows subtle inline loader */
  isLoading?: boolean
  /** Safe area top inset to apply as padding */
  safeAreaTop?: number
  testID?: string
  /** Callback when a final result card is pressed - navigate to research detail */
  onFinalResultPress?: (sessionId: string) => void
  /** Callback when a What's New report card is pressed - navigate to report detail */
  onWhatsNewReportPress?: (reportId: string) => void
  /** Callback when a message is deleted */
  onDeleteMessage?: (messageId: string) => void
  /** ID of the message currently being streamed - shows cursor, suppresses typing indicator */
  streamingMessageId?: string | null
  /** Navigate to a document with optional highlight at a specific block */
  onDocumentContextNavigate?: (documentId: string, blockIndex?: number) => void
}

export function ChatThread({
  messages,
  showTypingIndicator = false,
  isLoading = false,
  safeAreaTop = 0,
  testID = 'chat-thread',
  onFinalResultPress,
  onWhatsNewReportPress,
  onDeleteMessage,
  streamingMessageId = null,
  onDocumentContextNavigate,
}: ChatThreadProps) {
  const { width: screenWidth } = useWindowDimensions()

  // Bottom sheet state for message actions
  const [actionSheetVisible, setActionSheetVisible] = useState(false)
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)

  // Check if the most recent message has an active research loading card
  // If so, suppress the typing indicator to avoid showing double loaders
  const hasActiveResearchCard = messages.length > 0 && (() => {
    const lastMessage = messages[0] // FlatList is inverted, so [0] is newest
    if (lastMessage?.message_type === 'result_card' && lastMessage?.card_data) {
      const cardType = lastMessage.card_data.card_type
      const status = lastMessage.card_data.status
      // Active research card is one that's loading (not completed)
      return cardType === 'deep_research_loading' && status !== 'completed'
    }
    return false
  })()

  const effectiveShowTypingIndicator = showTypingIndicator && !hasActiveResearchCard && !streamingMessageId
  const flatListRef = useRef<FlatList>(null)
  const router = useRouter()

  // Auto-scroll to bottom when new messages are added or typing indicator appears
  // Note: FlatList is inverted, so offset 0 is the visual bottom (newest messages)
  useEffect(() => {
    if (messages.length > 0 || effectiveShowTypingIndicator) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true })
    }
  }, [messages.length, effectiveShowTypingIndicator])

  // Handle card press - navigate to document screen
  const handleCardPress = useCallback((documentId: number) => {
    router.push(`/document/${documentId}`)
  }, [router])

  const handleMessageLongPress = useCallback((messageId: string) => {
    if (!onDeleteMessage) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setSelectedMessageId(messageId)
    setActionSheetVisible(true)
  }, [onDeleteMessage])

  const handleDeleteFromSheet = useCallback(() => {
    if (selectedMessageId && onDeleteMessage) {
      onDeleteMessage(selectedMessageId)
    }
    setSelectedMessageId(null)
  }, [selectedMessageId, onDeleteMessage])

  const handleSheetClose = useCallback(() => {
    setActionSheetVisible(false)
    setSelectedMessageId(null)
  }, [])

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <Pressable
      onLongPress={() => handleMessageLongPress(item.id)}
      delayLongPress={400}
      disabled={!onDeleteMessage}
    >
      <MessageBubble
        role={item.role}
        content={item.content}
        message_type={item.message_type}
        card_data={item.card_data}
        toolCallId={item.toolCallId}
        createdAt={item.createdAt}
        showTimestamp={true}
        testID={`message-${item.id}`}
        onCardPress={handleCardPress}
        onFinalResultPress={onFinalResultPress}
        onWhatsNewReportPress={onWhatsNewReportPress}
        onDocumentContextNavigate={onDocumentContextNavigate}
        isStreaming={item.id === streamingMessageId}
      />
    </Pressable>
  )

  const renderEmptyState = () => {
    // While loading, show nothing (seamless UI) - or a very subtle indicator
    if (isLoading) {
      return (
        <View
          className="flex-1 items-center justify-center p-6"
          style={{ transform: [{ scaleY: -1 }] }}
          testID="chat-loading-inline"
        >
          <ActivityIndicator size="small" className="text-muted-foreground opacity-50" />
        </View>
      )
    }

    // Truly empty - show helpful message
    return (
      <View
        className="flex-1 items-center justify-center p-6"
        style={{ transform: [{ scaleY: -1 }] }}
      >
        <Text variant="large" className="text-muted-foreground text-center">
          No messages yet
        </Text>
        <Text variant="muted" className="text-center mt-2">
          Start a conversation to see messages here
        </Text>
      </View>
    )
  }

  const renderTypingIndicator = () => {
    if (!effectiveShowTypingIndicator) return null
    return <TypingIndicator />
  }

  return (
    <View className="flex-1" testID={testID}>
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        inverted={true}
        ListEmptyComponent={renderEmptyState}
        ListHeaderComponent={renderTypingIndicator}
        contentContainerStyle={
          messages.length === 0
            ? { flex: 1, justifyContent: 'center', paddingBottom: safeAreaTop }
            : { paddingBottom: safeAreaTop }
        }
      />

      {/* Message actions bottom sheet */}
      <MessageActionsSheet
        visible={actionSheetVisible}
        onClose={handleSheetClose}
        onDeletePress={handleDeleteFromSheet}
      />
    </View>
  )
}
