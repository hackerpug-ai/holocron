import { View, FlatList, ActivityIndicator } from 'react-native'
import { Text } from '@/components/ui/text'
import { useRef, useEffect } from 'react'
import type { MessageRole } from '@/lib/types/conversations'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  createdAt: Date
}

export interface ChatThreadProps {
  messages: ChatMessage[]
  onLoadMore: () => void
  isLoadingMore: boolean
  hasMore: boolean
  showTypingIndicator?: boolean
  testID?: string
}

export function ChatThread({
  messages,
  onLoadMore,
  isLoadingMore,
  hasMore,
  showTypingIndicator = false,
  testID = 'chat-thread',
}: ChatThreadProps) {
  const flatListRef = useRef<FlatList>(null)

  // Auto-scroll to bottom when new messages are added or typing indicator appears
  useEffect(() => {
    if (messages.length > 0 || showTypingIndicator) {
      flatListRef.current?.scrollToEnd({ animated: true })
    }
  }, [messages.length, showTypingIndicator])

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <MessageBubble
      role={item.role}
      content={item.content}
      createdAt={item.createdAt}
      showTimestamp={true}
      testID={`message-${item.id}`}
    />
  )

  const renderEmptyState = () => (
    <View className="flex-1 items-center justify-center p-6">
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
          messages.length === 0 ? { flexGrow: 1 } : undefined
        }
      />
    </View>
  )
}
