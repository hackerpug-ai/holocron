import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { useConversations } from '@/hooks/useConversations'
import { useChatHistory } from '@/hooks/use-chat-history'
import { useSendMessage } from '@/hooks/use-send-message'
import { View, ActivityIndicator, StyleSheet, Keyboard } from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { ChatThread } from '@/components/chat/ChatThread'
import { ChatInput } from '@/components/chat/ChatInput'

/**
 * Chat screen for a specific conversation.
 * This route displays the chat interface for the conversation specified in the URL.
 *
 * Route: /chat/[conversationId]
 *
 * The conversationId from the URL is used to:
 * 1. Set the active conversation in the useConversations hook
 * 2. Display the chat messages for that conversation
 * 3. Enable deep-linking to specific conversations
 */
export default function ChatScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>()
  const router = useRouter()
  const { switchConversation, conversations, isLoading, error, refetch } = useConversations()

  // Fetch chat history for this conversation
  const {
    messages,
    isLoading: isLoadingMessages,
    isLoadingMore,
    error: messagesError,
    loadMore,
    hasMore,
    prependMessages,
  } = useChatHistory(conversationId ?? null)

  // Send message hook with optimistic updates
  const { sendMessage, isSending, error: sendError } = useSendMessage(
    conversationId ?? '',
    prependMessages
  )

  // Handle send
  const handleSend = async (content: string) => {
    if (!content.trim() || !conversationId) return

    // Dismiss keyboard
    Keyboard.dismiss()

    // Send message
    await sendMessage(content)
  }

  // Set the active conversation when the route loads
  useEffect(() => {
    if (conversationId) {
      switchConversation(conversationId)
    }
  }, [conversationId, switchConversation])

  // Validate that the conversation exists
  const conversationExists = conversations.some((c) => c.id === conversationId)

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.centerContainer} className="bg-background p-6" testID="chat-loading-screen">
        <ActivityIndicator size="large" testID="loading-spinner" />
        <Text className="text-muted-foreground mt-4 text-sm">Loading conversation...</Text>
      </View>
    )
  }

  // Error state
  if (error) {
    return (
      <View style={styles.centerContainer} className="bg-background p-6" testID="chat-error-screen">
        <Text className="text-destructive text-center text-lg">Failed to load conversation</Text>
        <Text className="text-muted-foreground text-center text-sm mt-2">{error.message}</Text>
        <Button onPress={refetch} testID="retry-button" className="mt-4">
          <Text>Retry</Text>
        </Button>
      </View>
    )
  }

  // Conversation not found state
  if (!conversationExists && conversationId) {
    return (
      <View style={styles.centerContainer} className="bg-background p-6" testID="chat-not-found-screen">
        <Text className="text-destructive text-center text-lg">Conversation not found</Text>
        <Text className="text-muted-foreground text-center text-sm mt-2">
          The conversation you're looking for doesn't exist or has been deleted.
        </Text>
        <Button onPress={() => router.push('/')} testID="go-home-button" className="mt-4">
          <Text>Go to Home</Text>
        </Button>
      </View>
    )
  }

  // Messages loading state (shows while fetching initial messages)
  if (isLoadingMessages) {
    return (
      <View style={styles.centerContainer} className="bg-background p-6" testID="chat-messages-loading">
        <ActivityIndicator size="large" testID="messages-loading-spinner" />
        <Text className="text-muted-foreground mt-4 text-sm">Loading messages...</Text>
      </View>
    )
  }

  // Messages error state
  if (messagesError) {
    return (
      <View style={styles.centerContainer} className="bg-background p-6" testID="chat-messages-error">
        <Text className="text-destructive text-center text-lg">Failed to load messages</Text>
        <Text className="text-muted-foreground text-center text-sm mt-2">{messagesError.message}</Text>
      </View>
    )
  }

  // Chat interface with messages
  return (
    <View style={styles.container} className="bg-background" testID="chat-screen">
      <ChatThread
        messages={messages}
        onLoadMore={loadMore}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        showTypingIndicator={isSending}
        testID="chat-thread"
      />
      <ChatInput
        onSend={handleSend}
        disabled={isSending}
        testID="chat-input"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
