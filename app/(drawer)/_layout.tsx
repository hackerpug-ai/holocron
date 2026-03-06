import { Drawer } from 'expo-router/drawer'
import { DrawerContent } from '@/screens/DrawerContent'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Doc } from '@/convex/_generated/dataModel'
import type { Conversation } from '@/lib/types/conversations'
import { useRouter } from 'expo-router'
import { useDrawerStatus } from '@react-navigation/drawer'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { log } from '@/lib/logger-client'

/**
 * Custom drawer content that wires Convex useQuery/useMutation
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

  // Direct Convex useQuery for conversations list
  const conversations = useQuery(api.conversations.index.list, { limit: 50 }) ?? []

  // Active conversation tracking (local state)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)

  // Convex mutations
  const createConversation = useMutation(api.conversations.mutations.create)
  const updateConversation = useMutation(api.conversations.mutations.update)
  const removeConversation = useMutation(api.conversations.mutations.remove)

  // Loading states from mutations
  const isCreating = false
  const isRenaming = false
  const isDeleting = false
  const error = null

  const handleNewChatPress = () => {
    // Navigate to /chat/new for lazy conversation creation
    // Conversation will be created when first message is sent
    router.push('/chat/new')
  }

  const handleConversationPress = (conversation: Conversation) => {
    setActiveConversationId(conversation.id)
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
      // Convert string ID to Convex ID type
      await updateConversation({ id: actionMenuConversation.id as any, title: newTitle })
      setIsActionMenuOpen(false)
    } catch (err) {
      log('DrawerLayout').error('Failed to rename conversation', err, { id: actionMenuConversation.id, newTitle })
    }
  }

  const handleDelete = async () => {
    if (!actionMenuConversation) return
    try {
      const isDeletingActive = actionMenuConversation.id === activeConversationId

      // Get remaining conversations before deletion
      const remaining = conversations.filter((c: Doc<'conversations'>) => c._id !== actionMenuConversation.id)

      let navigateToId: string | null = null
      if (isDeletingActive) {
        if (remaining.length === 0) {
          // Create new conversation if last one deleted
          const newId = await createConversation({ title: 'New Chat' })
          setActiveConversationId(newId)
          navigateToId = newId
        } else {
          // Switch to most recent remaining conversation
          const next = remaining[0]
          setActiveConversationId(next._id)
          navigateToId = next._id
        }
      }

      await removeConversation({ id: actionMenuConversation.id as any })
      setIsActionMenuOpen(false)

      // Navigate to the next conversation if the active one was deleted
      if (navigateToId) {
        router.push(`/chat/${navigateToId}`)
      }
    } catch (err) {
      log('DrawerLayout').error('Failed to delete conversation', err, { id: actionMenuConversation.id })
    }
  }

  const handleHolocronPress = () => {
    // Navigate to the active conversation or the most recent one
    const targetId = activeConversationId ?? conversations[0]?._id
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

  // Map Convex documents to Conversation interface
  const mappedConversations: Conversation[] = conversations.map((c: Doc<'conversations'>) => ({
    id: c._id,
    title: c.title,
    lastMessage: c.lastMessagePreview,
    lastMessageAt: c.updatedAt ? new Date(c.updatedAt) : undefined,
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
  }))

  return (
    <DrawerContent
      conversations={mappedConversations}
      activeConversationId={activeConversationId ?? undefined}
      isLoading={false}
      isRenaming={isRenaming}
      isDeleting={isDeleting}
      error={error}
      onNewChatPress={handleNewChatPress}
      onConversationPress={handleConversationPress}
      onConversationLongPress={handleConversationLongPress}
      onHolocronPress={handleHolocronPress}
      onArticlesPress={handleArticlesPress}
      onSettingsPress={handleSettingsPress}
      onRetry={() => {}}
      actionMenuOpen={isActionMenuOpen}
      actionMenuConversationTitle={actionMenuConversation?.title ?? ''}
      onActionMenuOpenChange={setIsActionMenuOpen}
      onRename={handleRename}
      onDelete={handleDelete}
      hasActiveTasks={false}
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

  // Direct Convex useQuery for conversations list
  const conversations = useQuery(api.conversations.index.list, { limit: 50 }) ?? []

  // Convex mutations
  const createConversation = useMutation(api.conversations.mutations.create)

  // Active conversation tracking (local state)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)

  // Prevent duplicate initialization on re-renders (React 18 Strict Mode)
  // Two refs: isInitializing prevents concurrent runs, hasInitialized tracks completion
  const hasInitialized = useRef(false)
  const isInitializing = useRef(false)

  const isLoading = conversations === undefined

  useEffect(() => {
    // Skip if already loading, initialized, or currently initializing
    if (isLoading || hasInitialized.current || isInitializing.current) {
      return
    }

    const initializeConversation = async () => {
      // Mark as initializing to prevent concurrent runs
      isInitializing.current = true

      try {
        if (conversations.length > 0) {
          // Navigate to most recent conversation (already sorted by updated_at)
          const mostRecent = conversations[0]
          setActiveConversationId(mostRecent._id)
          router.replace(`/chat/${mostRecent._id}`)
          // Mark as complete only after navigation succeeds
          hasInitialized.current = true
        } else {
          // No conversations exist -- create a new "New Chat" conversation
          const newId = await createConversation({ title: 'New Chat' })
          setActiveConversationId(newId)
          router.replace(`/chat/${newId}`)
          // Mark as complete only after async operations succeed
          hasInitialized.current = true
        }
      } catch (err) {
        log('DrawerLayout').error('Failed to create initial conversation', err)
        // Error will be in the hook's error state
        // Don't set hasInitialized so retry is possible
      } finally {
        // Always clear the initializing flag
        isInitializing.current = false
      }
    }

    initializeConversation()
  }, [isLoading, conversations, createConversation, router, setActiveConversationId])

  // Show loading screen while determining initial conversation
  if (isLoading && !hasInitialized.current) {
    return <InitialLoadingScreen />
  }

  // Normal drawer layout after initialization
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']} className="bg-background">
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
        <Drawer.Screen
          name="research/[sessionId]"
          options={{ headerShown: false, title: 'Research Details' }}
        />
      </Drawer>
    </SafeAreaView>
  )
}
