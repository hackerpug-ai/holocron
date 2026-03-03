import { ConversationRow } from '@/components/ConversationRow'
import { ConversationActionMenu } from '@/components/ConversationActionMenu'
import { DrawerHeader, type NavSection } from '@/components/DrawerHeader'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { BookOpen, MessageSquare, Settings } from 'lucide-react-native'
import { useMemo } from 'react'
import { FlatList, Pressable, View, type ViewProps } from 'react-native'
import type { Conversation } from '@/lib/types/conversations'

// Re-export Conversation type for convenience
export type { Conversation }

interface DrawerContentProps extends Omit<ViewProps, 'children'> {
  /** List of conversations */
  conversations?: Conversation[]
  /** ID of the currently active conversation */
  activeConversationId?: string
  /** Current search query */
  searchQuery?: string
  /** Callback when search query changes */
  onSearchChange?: (_query: string) => void
  /** Callback when Holocron (main chat) section is pressed */
  onHolocronPress?: () => void
  /** Callback when Articles link is pressed */
  onArticlesPress?: () => void
  /** Callback when Settings is pressed */
  onSettingsPress?: () => void
  /** Callback when New Chat is pressed */
  onNewChatPress?: () => void
  /** Callback when a conversation is selected */
  onConversationPress?: (_conversation: Conversation) => void
  /** Callback when a conversation is long-pressed */
  onConversationLongPress?: (_conversation: Conversation) => void
  /** Loading state for conversation fetch */
  isLoading?: boolean
  /** Error state for conversation fetch */
  error?: Error | null
  /** Callback to retry fetching conversations */
  onRetry?: () => void
  /** Whether the action menu is open */
  actionMenuOpen?: boolean
  /** Title of the conversation for the action menu */
  actionMenuConversationTitle?: string
  /** Callback when action menu open state changes */
  onActionMenuOpenChange?: (_open: boolean) => void
  /** Callback when rename is confirmed */
  onRename?: (_newTitle: string) => void
  /** Callback when delete is confirmed */
  onDelete?: () => void
  /** Whether a rename operation is in progress */
  isRenaming?: boolean
  /** Whether a delete operation is in progress */
  isDeleting?: boolean
}

/**
 * DrawerContent is the navigation drawer screen.
 * Composes DrawerHeader and ConversationRow atoms.
 * Shows search, app sections, and conversation list.
 */
export function DrawerContent({
  conversations = [],
  activeConversationId,
  searchQuery = '',
  onSearchChange,
  onHolocronPress,
  onArticlesPress,
  onSettingsPress,
  onNewChatPress,
  onConversationPress,
  onConversationLongPress,
  isLoading = false,
  error = null,
  onRetry,
  actionMenuOpen = false,
  actionMenuConversationTitle = '',
  onActionMenuOpenChange,
  onRename,
  onDelete,
  isRenaming = false,
  isDeleting = false,
  className,
  ...props
}: DrawerContentProps) {
  const sections: NavSection[] = [
    { id: 'holocron', label: 'Holocron', icon: <MessageSquare size={20} className="text-foreground" />, onPress: onHolocronPress },
    { id: 'articles', label: 'Articles', icon: <BookOpen size={20} className="text-foreground" />, onPress: onArticlesPress },
    { id: 'settings', label: 'Settings', icon: <Settings size={20} className="text-foreground" />, onPress: onSettingsPress },
  ]

  // Filter conversations based on search query (case-insensitive)
  const filteredConversations = useMemo(() => {
    const trimmedQuery = searchQuery.trim().toLowerCase()
    if (!trimmedQuery) {
      return conversations
    }
    return conversations.filter((c) =>
      c.title.toLowerCase().includes(trimmedQuery)
    )
  }, [conversations, searchQuery])

  // Track if we're showing filtered (no results) vs empty (no conversations)
  const isSearchActive = searchQuery.trim().length > 0
  const hasNoSearchResults = isSearchActive && filteredConversations.length === 0 && conversations.length > 0

  const renderConversation = ({ item }: { item: Conversation }) => (
    <ConversationRow
      title={item.title}
      lastMessage={item.lastMessage}
      lastMessageAt={item.lastMessageAt}
      isActive={item.id === activeConversationId}
      onPress={() => onConversationPress?.(item)}
      onLongPress={() => onConversationLongPress?.(item)}
    />
  )

  const renderListEmptyComponent = () => {
    if (isLoading) {
      return (
        <View className="items-center py-8" testID="drawer-content-loading">
          <Text className="text-muted-foreground text-sm">Loading conversations...</Text>
        </View>
      )
    }

    if (error) {
      return (
        <Pressable
          onPress={onRetry}
          className="items-center py-8 active:bg-muted"
          testID="drawer-content-error"
          accessibilityRole="button"
          accessibilityLabel="Failed to load conversations. Tap to retry"
          accessibilityHint="Double tap to retry loading conversations"
        >
          <Text className="text-destructive text-sm">Failed to load conversations</Text>
          <Text className="text-muted-foreground mt-1 text-xs">Tap to retry</Text>
        </Pressable>
      )
    }

    // Show "no results" when searching with no matches
    if (hasNoSearchResults) {
      return (
        <View className="items-center py-8" testID="drawer-content-no-results">
          <Text className="text-muted-foreground text-sm">No conversations found</Text>
          <Text className="text-muted-foreground mt-1 text-xs">
            Try a different search term
          </Text>
        </View>
      )
    }

    return (
      <View className="items-center py-8" testID="drawer-content-empty">
        <Text className="text-muted-foreground text-sm">No conversations yet</Text>
        <Text className="text-muted-foreground mt-1 text-xs">
          Tap the compose icon to start
        </Text>
      </View>
    )
  }

  return (
    <View
      className={cn('bg-background flex-1', className)}
      testID="drawer-content"
      {...props}
    >
      {/* Header with Search + Compose + Sections */}
      <DrawerHeader
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onNewChatPress={onNewChatPress}
        sections={sections}
      />

      {/* Divider */}
      <View className="bg-border mx-3 h-px" />

      {/* Conversation List */}
      <View className="flex-1 px-2 pt-3">
        <Text className="text-muted-foreground mb-2 px-3 text-xs font-medium uppercase tracking-wide">
          Conversations
        </Text>
        <FlatList
          data={filteredConversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 2 }}
          ListEmptyComponent={renderListEmptyComponent}
        />
      </View>

      {/* Conversation Action Menu */}
      <ConversationActionMenu
        open={actionMenuOpen}
        onOpenChange={onActionMenuOpenChange ?? (() => {})}
        conversationTitle={actionMenuConversationTitle}
        onRename={onRename}
        onDelete={onDelete}
        isRenaming={isRenaming}
        isDeleting={isDeleting}
      />
    </View>
  )
}
