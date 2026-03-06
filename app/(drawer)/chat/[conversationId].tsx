import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState, useCallback } from 'react'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import { useQuery, useMutation, useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Doc, Id } from '@/convex/_generated/dataModel'
import { useChatHistory } from '@/hooks/use-chat-history'
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
 * 1. Display the chat messages for that conversation
 * 2. Enable deep-linking to specific conversations
 */

export default function ChatScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>()
  const router = useRouter()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()

  // Direct Convex useQuery for conversations list
  const conversations = useQuery(api.conversations.list, { limit: 50 }) ?? []

  // Active conversation tracking (local state)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)

  // Convex mutation for creating conversations
  const createConversationMutation = useMutation(api.conversations.create)

  // Fetch chat history for this conversation
  const {
    messages,
    isLoading: isLoadingMessages,
    error: messagesError,
  } = useChatHistory(conversationId ?? null)

  // Determine if this is a new (lazy) conversation
  const isNewConversation = conversationId === 'new'

  // Create conversation callback for lazy creation
  const createConversation = async (): Promise<string> => {
    const newId = await createConversationMutation({ title: 'New Chat' })
    setActiveConversationId(newId)
    return newId
  }

  // Convex action for sending messages
  const sendChat = useAction(api.chat.send)

  // Local state for sending
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<Error | null>(null)

  // Handle send with Convex action
  const handleSend = useCallback(async (content: string) => {
    if (!content.trim() || isSending) return

    // Dismiss keyboard
    Keyboard.dismiss()

    // Handle new conversation creation
    let targetConversationId = conversationId ?? ''
    if (isNewConversation) {
      // Create conversation first
      const newId = await createConversation()
      targetConversationId = newId
      router.replace(`/chat/${newId}`)
    }

    if (!targetConversationId || targetConversationId === 'new') {
      setSendError(new Error('No valid conversation ID'))
      return
    }

    setIsSending(true)
    setSendError(null)

    try {
      // Call Convex action - this handles both user and agent messages
      await sendChat({
        conversationId: targetConversationId as Id<"conversations">,
        content: content.trim(),
      })

      // Note: Convex action already persists both user and agent messages
      // The useChatHistory hook will automatically update via Convex reactivity
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to send message')
      setSendError(error)
    } finally {
      setIsSending(false)
    }
  }, [conversationId, isSending, isNewConversation, sendChat, createConversation, router])

  // Handle session selection from resume list (sends /resume command)
  const handleSessionSelect = useCallback(async (sessionId: string) => {
    await handleSend(`/resume ${sessionId}`)
  }, [handleSend])

  // Retry failed send
  const handleRetry = useCallback(() => {
    // For simple retry, we could store the last message
    // For now, just clear the error
    setSendError(null)
  }, [])

  // Handle final result card press - navigate to research detail view
  const handleFinalResultPress = (sessionId: string) => {
    router.push(`/research/${sessionId}`)
  }

  // Open the drawer menu
  const handleOpenMenu = () => {
    navigation.dispatch(DrawerActions.openDrawer())
  }

  // Create a new chat (lazy - navigates to /chat/new)
  const handleNewChat = () => {
    router.push('/chat/new')
  }

  // Set the active conversation when the route loads (skip for 'new')
  useEffect(() => {
    if (conversationId && !isNewConversation) {
      setActiveConversationId(conversationId)
    }
  }, [conversationId, isNewConversation])

  // Loading state based on conversations query
  const isLoading = conversations === undefined

  // Validate that the conversation exists (skip for 'new' conversations)
  const conversationExists = isNewConversation || conversations.some((c: Doc<'conversations'>) => c._id === conversationId)

  // Loading state (but not for new conversations - they don't need to load)
  if (isLoading && !isNewConversation) {
    return (
      <View style={styles.centerContainer} className="bg-background p-6" testID="chat-loading-screen">
        <ActivityIndicator size="large" testID="loading-spinner" />
        <Text className="text-muted-foreground mt-4 text-sm">Loading conversation...</Text>
      </View>
    )
  }

  // Error state from chat messages
  if (messagesError) {
    return (
      <View style={styles.centerContainer} className="bg-background p-6" testID="chat-error-screen">
        <Text className="text-destructive text-center text-lg">Failed to load conversation</Text>
        <Text className="text-muted-foreground text-center text-sm mt-2">{messagesError.message}</Text>
        <Button onPress={() => router.push('/')} testID="go-home-button" className="mt-4">
          <Text>Go to Home</Text>
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
        showTypingIndicator={isSending}
        isLoading={isLoadingMessages}
        safeAreaTop={contentTopPadding}
        testID="chat-thread"
        onSessionSelect={handleSessionSelect}
        onFinalResultPress={handleFinalResultPress}
      />
      {/* Bottom area with safe area padding */}
      <View style={{ paddingBottom: insets.bottom }}>
        {sendError && (
          <View className="bg-destructive/10 px-4 py-2 flex-row items-center justify-between" testID="error-banner">
            <Text className="text-destructive">Failed to send message</Text>
            <Pressable onPress={handleRetry} testID="error-retry-button">
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
