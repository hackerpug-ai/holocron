import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { useConversations } from '@/hooks/useConversations'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'

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

  // Placeholder for the actual chat interface
  // This will be implemented in a future task to display messages
  return (
    <View style={styles.container} className="bg-background" testID="chat-screen">
      <View className="p-4 border-b border-border">
        <Text variant="h1" className="text-xl font-semibold">
          Chat: {conversationId}
        </Text>
      </View>
      <View style={styles.content} className="p-6">
        <Text className="text-muted-foreground text-center">
          Chat interface will be implemented here.
        </Text>
        <Text className="text-muted-foreground text-center text-sm mt-2">
          Conversation ID: {conversationId}
        </Text>
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
