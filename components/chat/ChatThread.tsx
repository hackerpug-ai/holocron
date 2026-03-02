import { View, FlatList, ActivityIndicator } from 'react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useRef, useEffect } from 'react'
import type { MessageRole } from '@/lib/types/conversations'

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
  testID?: string
}

// Temporary MessageBubble stub until US-013 is complete
// This will be replaced with the real MessageBubble component
function MessageBubbleStub({ role, content }: { role: MessageRole; content: string }) {
  const isUser = role === 'user'
  const isSystem = role === 'system'

  return (
    <View
      className={cn(
        'my-1 px-4',
        isUser && 'items-end',
        isSystem && 'items-center',
        !isUser && !isSystem && 'items-start'
      )}
    >
      <View
        className={cn(
          'rounded-lg p-3',
          isUser && 'bg-primary max-w-[75%]',
          isSystem && 'bg-muted max-w-[80%]',
          !isUser && !isSystem && 'bg-card max-w-[75%]'
        )}
      >
        <Text
          variant={isSystem ? 'small' : 'default'}
          className={cn(
            isUser && 'text-primary-foreground',
            isSystem && 'text-muted-foreground',
            !isUser && !isSystem && 'text-foreground'
          )}
        >
          {content}
        </Text>
      </View>
    </View>
  )
}

export function ChatThread({
  messages,
  onLoadMore,
  isLoadingMore,
  hasMore,
  testID = 'chat-thread',
}: ChatThreadProps) {
  const flatListRef = useRef<FlatList>(null)

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true })
    }
  }, [messages.length])

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <MessageBubbleStub role={item.role} content={item.content} />
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
        ListFooterComponent={renderLoadingIndicator}
        contentContainerStyle={
          messages.length === 0 ? { flexGrow: 1 } : undefined
        }
      />
    </View>
  )
}
