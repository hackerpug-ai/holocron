import { Drawer } from 'expo-router/drawer'
import { DrawerContent, type Conversation } from '@/screens/DrawerContent'
import { useConversations } from '@/hooks/useConversations'
import { useRouter } from 'expo-router'
import { useDrawerStatus } from '@react-navigation/drawer'
import { useEffect } from 'react'

/**
 * Custom drawer content that wires the useConversations hook
 * to the DrawerContent component and handles navigation.
 */
function CustomDrawerContent() {
  const router = useRouter()
  const isDrawerOpen = useDrawerStatus() === 'open'
  const {
    conversations,
    activeConversationId,
    isLoading,
    error,
    createConversation,
    switchConversation,
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
      // Navigate to the new conversation (will be created as a route later)
      router.push(`/`)
    } catch (err) {
      // Error is already set in the hook state
      console.error('Failed to create conversation:', err)
    }
  }

  const handleConversationPress = (conversation: Conversation) => {
    switchConversation(conversation.id)
    // Navigate to the conversation (will be created as a route later)
    router.push(`/`)
  }

  const handleHolocronPress = () => {
    router.push('/')
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
      onHolocronPress={handleHolocronPress}
      onArticlesPress={handleArticlesPress}
      onSettingsPress={handleSettingsPress}
      onRetry={refetch}
    />
  )
}

export default function DrawerLayout() {
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
        name="(tabs)"
        options={{ headerShown: false, title: 'Holocron' }}
      />
    </Drawer>
  )
}
