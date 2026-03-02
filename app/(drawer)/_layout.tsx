import { Drawer } from 'expo-router/drawer'
import { DrawerContent } from '@/screens/DrawerContent'
import { useConversations, type Conversation } from '@/hooks/useConversations'
import { useRouter } from 'expo-router'
import { useDrawerStatus } from '@react-navigation/drawer'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, View, Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'

/**
 * Custom drawer content that wires the useConversations hook
 * to the DrawerContent component and handles navigation.
 */
function CustomDrawerContent() {
  const router = useRouter()
  const isDrawerOpen = useDrawerStatus() === 'open'
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false)
  const [actionMenuConversation, setActionMenuConversation] = useState<{
    id: string
    title: string
  } | null>(null)

  const {
    conversations,
    activeConversationId,
    isLoading,
    error,
    createConversation,
    switchConversation,
    renameConversation,
    deleteConversation,
    refetch,
  } = useConversations()

  // Refetch conversations when drawer opens
  useEffect(() => {
    if (isDrawerOpen) {
      refetch()
    }
  }, [isDrawerOpen, refetch])

  const handleNewChatPress = async () => {
    try {
      const newId = await createConversation()
      switchConversation(newId)
      // Navigate to the new conversation's chat route
      router.push(`/chat/${newId}`)
    } catch (err) {
      // Error is already set in the hook state
      console.error('Failed to create conversation:', err)
    }
  }

  const handleConversationPress = (conversation: Conversation) => {
    switchConversation(conversation.id)
    // Navigate to the conversation's chat route
    router.push(`/chat/${conversation.id}`)
  }

  const handleConversationLongPress = (conversation: Conversation) => {
    setActionMenuConversation({ id: conversation.id, title: conversation.title })
    setIsActionMenuOpen(true)
  }

  const handleRename = async (newTitle: string) => {
    if (!actionMenuConversation) return
    try {
      await renameConversation(actionMenuConversation.id, newTitle)
      setIsActionMenuOpen(false)
    } catch (err) {
      console.error('Failed to rename conversation:', err)
    }
  }

  const handleDelete = async () => {
    if (!actionMenuConversation) return
    try {
      const navigateToId = await deleteConversation(actionMenuConversation.id)
      setIsActionMenuOpen(false)
      // Navigate to the next conversation if the active one was deleted
      if (navigateToId) {
        router.push(`/chat/${navigateToId}`)
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err)
    }
  }

  const handleHolocronPress = () => {
    // Navigate to the active conversation or the most recent one
    const targetId = activeConversationId ?? conversations[0]?.id
    if (targetId) {
      router.push(`/chat/${targetId}`)
    } else {
      // If no conversations exist, navigate to home
      router.push('/')
    }
  }

  const handleArticlesPress = () => {
    router.push('/articles')
  }

  const handleSettingsPress = () => {
    router.push('/settings')
  }

  return (
    <DrawerContent
      conversations={conversations}
      activeConversationId={activeConversationId ?? undefined}
      isLoading={isLoading}
      error={error}
      onNewChatPress={handleNewChatPress}
      onConversationPress={handleConversationPress}
      onConversationLongPress={handleConversationLongPress}
      onHolocronPress={handleHolocronPress}
      onArticlesPress={handleArticlesPress}
      onSettingsPress={handleSettingsPress}
      onRetry={refetch}
      actionMenuOpen={isActionMenuOpen}
      actionMenuConversationTitle={actionMenuConversation?.title ?? ''}
      onActionMenuOpenChange={setIsActionMenuOpen}
      onRename={handleRename}
      onDelete={handleDelete}
    />
  )
}

/**
 * Loading screen shown while determining the initial conversation on app launch.
 */
function InitialLoadingScreen() {
  return (
    <View className="bg-background flex-1 items-center justify-center" testID="initial-loading-screen">
      <ActivityIndicator size="large" testID="loading-spinner" />
      <Text className="text-muted-foreground mt-4 text-sm">Loading conversations...</Text>
    </View>
  )
}

/**
 * Error screen shown when initial conversation fetch fails.
 */
function InitialErrorScreen({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return (
    <View className="bg-background flex-1 items-center justify-center gap-4 p-6" testID="initial-error-screen">
      <Text className="text-destructive text-center text-lg">Failed to load conversations</Text>
      <Text className="text-muted-foreground text-center text-sm">{error?.message}</Text>
      <Button onPress={onRetry} testID="retry-button">
        <Text>Retry</Text>
      </Button>
    </View>
  )
}

export default function DrawerLayout() {
  const router = useRouter()
  const {
    conversations,
    isLoading,
    error,
    createConversation,
    switchConversation,
    refetch,
  } = useConversations()

  // Prevent duplicate initialization on re-renders (React 18 Strict Mode)
  const hasInitialized = useRef(false)

  useEffect(() => {
    // Skip if already loading or initialized
    if (isLoading || hasInitialized.current) {
      return
    }

    const initializeConversation = async () => {
      hasInitialized.current = true

      if (conversations.length > 0) {
        // Navigate to most recent conversation (already sorted by updated_at)
        const mostRecent = conversations[0]
        switchConversation(mostRecent.id)
        router.replace(`/chat/${mostRecent.id}`)
      } else {
        // No conversations exist -- create a new "New Chat" conversation
        try {
          const newId = await createConversation()
          switchConversation(newId)
          router.replace(`/chat/${newId}`)
        } catch (err) {
          console.error('Failed to create initial conversation:', err)
          // Error will be in the hook's error state
          hasInitialized.current = false // Allow retry
        }
      }
    }

    initializeConversation()
  }, [isLoading, conversations, createConversation, switchConversation, router])

  // Show loading screen while determining initial conversation
  if (isLoading && !hasInitialized.current) {
    return <InitialLoadingScreen />
  }

  // Show error screen if initial fetch failed
  if (error && !hasInitialized.current) {
    return <InitialErrorScreen error={error} onRetry={refetch} />
  }

  // Normal drawer layout after initialization
  return (
    <Drawer
      screenOptions={{
        headerShown: false,
        drawerType: 'slide',
        drawerStyle: { width: '80%' },
      }}
      drawerContent={CustomDrawerContent}
    >
      <Drawer.Screen
        name="chat/[conversationId]"
        options={{ headerShown: false, title: 'Chat' }}
      />
      <Drawer.Screen
        name="(tabs)"
        options={{ headerShown: false, title: 'Holocron' }}
      />
    </Drawer>
  )
}
