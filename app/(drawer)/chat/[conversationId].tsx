import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import { useConversations } from '@/hooks/useConversations'
import { useChatHistory } from '@/hooks/use-chat-history'
import { useChatSend } from '@/hooks/useChatSend'
import { View, ActivityIndicator, StyleSheet, Keyboard, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { ScreenHeader } from '@/components/ui/screen-header'
import { ChatThread } from '@/components/chat/ChatThread'
import { ChatInput } from '@/components/chat/ChatInput'
import { SquarePen } from 'lucide-react-native'
import { spacing } from '@/lib/theme'

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
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { switchConversation, createConversation, conversations, isLoading, error, refetch } = useConversations()

  // Fetch chat history for this conversation
  const {
    messages,
    isLoading: isLoadingMessages,
    isLoadingMore,
    error: messagesError,
    loadMore,
    hasMore,
    prependMessages,
    replaceMessage,
  } = useChatHistory(conversationId ?? null)

  // Send message hook with optimistic updates
  const { send, isSending, error: sendError, retry } = useChatSend(
    conversationId ?? '',
    prependMessages,
    replaceMessage
  )

  // Handle send
  const handleSend = async (content: string) => {
    if (!content.trim() || !conversationId) return

    // Dismiss keyboard
    Keyboard.dismiss()

    // Send message
    await send(content)
  }

  // Open the drawer menu
  const handleOpenMenu = () => {
    navigation.dispatch(DrawerActions.openDrawer())
  }

  // Create a new chat
  const handleNewChat = async () => {
    try {
      const newId = await createConversation()
      switchConversation(newId)
      router.push(`/chat/${newId}`)
    } catch (err) {
      console.error('Failed to create conversation:', err)
    }
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

  // Chat interface with messages
  // Show UI immediately - messages load seamlessly in background (no blocking loader)
  // Add some padding at the "top" of the inverted list (which is paddingBottom in FlatList)
  // so when scrolled to the top, the first message has breathing room below the header
  const contentTopPadding = spacing.lg

  return (
    <View style={styles.container} className="bg-background" testID="chat-screen">
      {/* Sticky header with safe area */}
      <ScreenHeader
        showMenu
        onMenu={handleOpenMenu}
        rightContent={
          <Pressable
            onPress={handleNewChat}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
            testID="chat-header-new-chat-button"
            accessibilityRole="button"
            accessibilityLabel="New chat"
          >
            <SquarePen size={22} className="text-foreground" />
          </Pressable>
        }
        testID="chat-header"
      />
      <ChatThread
        messages={messages}
        onLoadMore={loadMore}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        showTypingIndicator={isSending}
        isLoading={isLoadingMessages}
        safeAreaTop={contentTopPadding}
        testID="chat-thread"
      />
      {/* Bottom area with safe area padding */}
      <View style={{ paddingBottom: insets.bottom }}>
        {sendError && (
          <View className="bg-destructive/10 px-4 py-2 flex-row items-center justify-between" testID="error-banner">
            <Text className="text-destructive">Failed to send message</Text>
            <Pressable onPress={retry} testID="error-retry-button">
              <Text className="text-primary">Retry</Text>
            </Pressable>
          </View>
        )}
        <ChatInput
          onSend={handleSend}
          disabled={isSending}
          testID="chat-input"
        />
      </View>
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
