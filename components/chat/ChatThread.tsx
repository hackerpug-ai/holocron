import { View, FlatList, ActivityIndicator } from 'react-native'
import { Text } from '@/components/ui/text'
import { useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'expo-router'
import type { MessageRole, MessageType } from '@/lib/types/conversations'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  message_type?: MessageType
  card_data?: Record<string, unknown> | null
  createdAt: Date
}

export interface ChatThreadProps {
  messages: ChatMessage[]
  onLoadMore: () => void
  isLoadingMore: boolean
  hasMore: boolean
  showTypingIndicator?: boolean
  /** Safe area top inset to apply as padding */
  safeAreaTop?: number
  testID?: string
}

export function ChatThread({
  messages,
  onLoadMore,
  isLoadingMore,
  hasMore,
  showTypingIndicator = false,
  safeAreaTop = 0,
  testID = 'chat-thread',
}: ChatThreadProps) {
  const flatListRef = useRef<FlatList>(null)
  const router = useRouter()

  // Auto-scroll to bottom when new messages are added or typing indicator appears
  // Note: FlatList is inverted, so offset 0 is the visual bottom (newest messages)
  useEffect(() => {
    if (messages.length > 0 || showTypingIndicator) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true })
    }
  }, [messages.length, showTypingIndicator])

  // Handle card press - navigate to document screen
  const handleCardPress = useCallback((documentId: number) => {
    router.push(`/document/${documentId}`)
  }, [router])

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <MessageBubble
      role={item.role}
      content={item.content}
      message_type={item.message_type}
      card_data={item.card_data}
      createdAt={item.createdAt}
      showTimestamp={true}
      testID={`message-${item.id}`}
      onCardPress={handleCardPress}
    />
  )

  const renderEmptyState = () => (
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

  const renderLoadingIndicator = () => {
    if (!isLoadingMore || !hasMore) return null

    return (
      <View className="items-center justify-center p-3">
        <ActivityIndicator size="small" className="text-primary" />
      </View>
    )
  }

  const renderTypingIndicator = () => {
    if (!showTypingIndicator) return null
    return <TypingIndicator />
  }

  const handleEndReached = () => {
    if (hasMore && !isLoadingMore) {
      onLoadMore()
    }
  }

  return (
    <View className="flex-1" testID={testID}>
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        inverted={true}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={renderEmptyState}
        ListHeaderComponent={renderTypingIndicator}
        ListFooterComponent={renderLoadingIndicator}
        contentContainerStyle={
          messages.length === 0
            ? { flex: 1, justifyContent: 'center', paddingBottom: safeAreaTop }
            : { paddingBottom: safeAreaTop }
        }
      />
    </View>
  )
}
