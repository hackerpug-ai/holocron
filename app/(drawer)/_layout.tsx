import { Drawer } from 'expo-router/drawer'
import { useDrawerStatus } from '@react-navigation/drawer'
import { DrawerContent } from '@/screens/DrawerContent'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Doc } from '@/convex/_generated/dataModel'
import type { Conversation } from '@/lib/types/conversations'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/hooks/use-theme'
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
  const _isDrawerOpen = useDrawerStatus() === 'open'
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false)
  const [actionMenuConversation, _setActionMenuConversation] = useState<{
    id: string
    title: string
  } | null>(null)

  // Direct Convex useQuery for conversations list
  const conversations = useQuery(api.conversations.index.list, { limit: 50 }) ?? []

  // Active conversation tracking (local state)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)

  // Convex mutations
  const updateConversation = useMutation(api.conversations.mutations.update)
  const removeConversation = useMutation(api.conversations.mutations.remove)

  // Loading states from mutations
  const _isCreating = false
  const isRenaming = false
  const isDeleting = false
  const error = null

  const handleNewChatPress = () => {
    // Navigate to /chat/new for lazy conversation creation
    // Conversation will be created when first message is sent
    router.push('/chat/new')
  }

  const handleConversationDelete = (conversation: Conversation) => {
    // Long-press inline delete: execute delete immediately
    executeDelete(conversation.id)
  }

  const executeDelete = async (conversationId: string) => {
    try {
      const isDeletingActive = conversationId === activeConversationId

      // Get remaining conversations before deletion
      const remaining = conversations.filter((c: Doc<'conversations'>) => c._id !== conversationId)

      let navigateToId: string | null = null
      if (isDeletingActive) {
        if (remaining.length === 0) {
          // Navigate to /chat/new for lazy conversation creation
          setActiveConversationId(null)
          navigateToId = 'new'
        } else {
          // Switch to most recent remaining conversation
          const next = remaining[0]
          setActiveConversationId(next._id)
          navigateToId = next._id
        }
      }

      await removeConversation({ id: conversationId as any })

      // Navigate to the next conversation if the active one was deleted
      if (navigateToId) {
        router.push(`/chat/${navigateToId}`)
      }
    } catch (err) {
      log('DrawerLayout').error('Failed to delete conversation', err, { id: conversationId })
    }
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
    // For action menu deletes, use the same execution logic
    await executeDelete(actionMenuConversation.id)
    setIsActionMenuOpen(false)
  }

  // Navigate to conversation
  const handleConversationPress = (conversation: Conversation) => {
    setActiveConversationId(conversation.id)
    router.push(`/chat/${conversation.id}`)
  }

  const handleArticlesPress = () => {
    router.push('/articles')
  }

  const handleToolbeltPress = () => {
    router.push('/toolbelt')
  }

  const handleSubscriptionsPress = () => {
    router.push('/subscriptions')
  }

  const handleWhatsNewPress = () => {
    router.push('/whats-new')
  }

  const handleSettingsPress = () => {
    router.push('/settings')
  }

  const handleImprovementsPress = () => {
    router.push('/improvements')
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
      onConversationDelete={handleConversationDelete}
      onArticlesPress={handleArticlesPress}
      onSubscriptionsPress={handleSubscriptionsPress}
      onWhatsNewPress={handleWhatsNewPress}
      onToolbeltPress={handleToolbeltPress}
      onSettingsPress={handleSettingsPress}
      onImprovementsPress={handleImprovementsPress}
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
function _InitialLoadingScreen() {
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
function _InitialErrorScreen({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
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
  const { colors: themeColors } = useTheme()

  // Direct Convex useQuery for conversations list
  const conversations = useQuery(api.conversations.index.list, { limit: 50 }) ?? []

  // Active conversation tracking (local state)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)

  // Prevent duplicate initialization on re-renders (React 18 Strict Mode)
  // Two refs: isInitializing prevents concurrent runs, hasInitialized tracks completion
  const hasInitialized = useRef(false)
  const isInitializing = useRef(false)

  const isLoading = conversations === undefined

  useEffect(() => {
    // On first mount, navigate to /chat/new immediately (optimistic empty state)
    if (!hasInitialized.current && !isInitializing.current) {
      isInitializing.current = true
      router.replace('/chat/new')
      hasInitialized.current = true
      isInitializing.current = false
    }

    // After conversations load, navigate to most recent if any exist
    if (!isLoading && conversations.length > 0 && hasInitialized.current) {
      const mostRecent = conversations[0]
      // Only navigate if we're currently at /chat/new
      if (activeConversationId === null) {
        setActiveConversationId(mostRecent._id)
        router.replace(`/chat/${mostRecent._id}`)
      }
    }
  }, [isLoading, conversations, router, activeConversationId])

  // No loading screen - show UI immediately

  // Normal drawer layout after initialization
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']} className="bg-background">
      <Drawer
        screenOptions={{
          headerShown: false,
          drawerType: 'slide',
          drawerStyle: { width: '80%', backgroundColor: themeColors.background },
        }}
        drawerContent={CustomDrawerContent}
      >
        <Drawer.Screen
          name="chat/[conversationId]"
          options={{ headerShown: false, title: 'Chat' }}
        />
        <Drawer.Screen
          name="research/[sessionId]"
          options={{ headerShown: false, title: 'Research Details' }}
        />
        <Drawer.Screen
          name="articles"
          options={{ headerShown: false, title: 'Articles' }}
        />
        <Drawer.Screen
          name="toolbelt"
          options={{ headerShown: false, title: 'Toolbelt' }}
        />
        <Drawer.Screen
          name="subscriptions"
          options={{ headerShown: false, title: 'Subscriptions' }}
        />
        <Drawer.Screen
          name="subscriptions/settings"
          options={{ headerShown: false, title: 'Subscription Settings' }}
        />
        <Drawer.Screen
          name="subscriptions/social"
          options={{ headerShown: false, title: 'Community Posts' }}
        />
        <Drawer.Screen
          name="subscription-content/[groupKey]"
          options={{ headerShown: false, title: 'Subscription Content' }}
        />
        <Drawer.Screen
          name="whats-new/index"
          options={{ headerShown: false, title: "What's New" }}
        />
        <Drawer.Screen
          name="whats-new/[reportId]"
          options={{ headerShown: false, title: "What's New Report" }}
        />
        <Drawer.Screen
          name="settings"
          options={{ headerShown: false, title: 'Settings' }}
        />
        <Drawer.Screen
          name="improvements"
          options={{ headerShown: false, title: 'Improvements' }}
        />
        <Drawer.Screen
          name="improvements/[requestId]"
          options={{ headerShown: false, title: 'Improvement Details' }}
        />
      </Drawer>
    </SafeAreaView>
  )
}
