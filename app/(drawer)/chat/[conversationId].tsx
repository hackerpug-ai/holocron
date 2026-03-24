import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState, useCallback, useRef } from 'react'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import { useQuery, useMutation, useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Doc, Id } from '@/convex/_generated/dataModel'
import { useChatHistory } from '@/hooks/use-chat-history'
import { View, ActivityIndicator, StyleSheet, Keyboard, Pressable, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { ScreenHeader } from '@/components/ui/screen-header'
import { ChatThread } from '@/components/chat/ChatThread'
import { ChatInput } from '@/components/chat/ChatInput'
import { SquarePen } from '@/components/ui/icons'
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

  // Determine if this is a new (lazy) conversation
  const isNewConversation = conversationId === 'new'

  // Direct Convex useQuery for conversations list
  const conversations = useQuery(api.conversations.index.list, { limit: 50 }) ?? []

  // Query to check if conversation exists (only for real IDs, not "new")
  const conversation = useQuery(
    api.conversations.queries.get,
    !isNewConversation && conversationId ? { id: conversationId as Id<"conversations"> } : "skip"
  )

  // Active conversation tracking (local state)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)

  // Fetch chat history - pass null for new conversations to skip query
  const chatHistoryId = isNewConversation ? null : (conversationId ?? null)
  const {
    messages = [],
    isLoading: isLoadingMessages = false,
    error: messagesError = null,
  } = useChatHistory(chatHistoryId) ?? { messages: [], isLoading: false, error: null }

  // Soft delete mutation for messages
  const softDelete = useMutation(api.chatMessages.mutations.softDelete)

  // Cancel agent mutation
  const cancelAgent = useMutation(api.chat.agentMutations.cancelAgent)

  // Convex action for sending messages
  const sendChat = useAction(api.chat.index.send)

  // Derive streaming message ID: when agent is busy, treat the last agent message as streaming
  const agentBusy = conversation?.agentBusy ?? false
  const streamingMessageId = agentBusy
    ? (messages.find((m) => m.role === 'agent')?.id ?? null)
    : null

  // Local state for sending
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<Error | null>(null)

  // Store the last sent message for retry
  const lastMessageRef = useRef<string | null>(null)

  // Handle send with Convex action
  const handleSend = useCallback(async (content: string) => {
    if (!content.trim() || isSending) return

    // Dismiss keyboard
    Keyboard.dismiss()

    lastMessageRef.current = content.trim()
    setIsSending(true)
    setSendError(null)

    try {
      // Call Convex action - let it create conversation if needed
      const result = await sendChat({
        conversationId: isNewConversation ? undefined : (conversationId as Id<"conversations">),
        content: content.trim(),
      })

      // If this was a new conversation, redirect to the created conversation
      if (isNewConversation && result?.conversationId) {
        router.replace(`/chat/${result.conversationId}`)
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to send message')
      setSendError(error)
    } finally {
      setIsSending(false)
    }
  }, [conversationId, isSending, isNewConversation, sendChat, router])

  // Cancel in-progress agent run
  const handleCancelAgent = useCallback(() => {
    if (conversationId) {
      cancelAgent({ conversationId: conversationId as Id<'conversations'> })
    }
  }, [conversationId, cancelAgent])

  // Retry failed send
  const handleRetry = useCallback(() => {
    setSendError(null)
    if (lastMessageRef.current) {
      handleSend(lastMessageRef.current)
    }
  }, [handleSend])

  // Handle final result card press - navigate to research detail view
  const handleFinalResultPress = (sessionId: string) => {
    router.push(`/research/${sessionId}`)
  }

  // Handle What's New report card press - navigate to report detail view
  const handleWhatsNewReportPress = (reportId: string) => {
    router.push(`/whats-new/${reportId}`)
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

  // Redirect to /chat/new if conversation doesn't exist
  useEffect(() => {
    // If we tried to load a real conversation but it doesn't exist, redirect
    if (
      !isNewConversation &&
      conversationId &&
      conversation === null &&
      conversations !== undefined
    ) {
      console.log('Conversation not found, redirecting to new')
      router.replace('/chat/new')
    }
  }, [conversationId, conversation, isNewConversation, conversations, router])

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
    <KeyboardAvoidingView
      style={styles.container}
      className="bg-background"
      testID="chat-screen"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
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
        showTypingIndicator={isSending || agentBusy}
        isLoading={isLoadingMessages}
        safeAreaTop={contentTopPadding}
        testID="chat-thread"
        onFinalResultPress={handleFinalResultPress}
        onWhatsNewReportPress={handleWhatsNewReportPress}
        onDeleteMessage={(messageId) => softDelete({ id: messageId as Id<'chatMessages'> })}
        streamingMessageId={streamingMessageId}
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
        {agentBusy && (
          <View className="items-center py-1" testID="stop-generating-container">
            <Pressable
              onPress={handleCancelAgent}
              className="flex-row items-center gap-1 px-3 py-1.5 rounded-full border border-border active:bg-muted"
              testID="stop-generating-button"
              accessibilityRole="button"
              accessibilityLabel="Stop generating"
            >
              <Text className="text-sm text-muted-foreground">Stop generating</Text>
            </Pressable>
          </View>
        )}
        <ChatInput
          onSend={handleSend}
          disabled={isSending || agentBusy}
          testID="chat-input"
        />
      </View>
    </KeyboardAvoidingView>
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
