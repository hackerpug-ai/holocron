import { ConversationRow } from '@/components/ConversationRow'
import { ConversationActionMenu } from '@/components/ConversationActionMenu'
import { DrawerHeader, type NavSection } from '@/components/DrawerHeader'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { BookOpen, Bell, Settings, Wrench } from '@/components/ui/icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, Pressable, View, type ViewProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Conversation } from '@/lib/types/conversations'

// Re-export Conversation type for convenience
export type { Conversation }

const DISMISS_DELAY = 4000 // auto-dismiss delete button after 4s

interface DrawerContentProps extends Omit<ViewProps, 'children'> {
  /** List of conversations */
  conversations?: Conversation[]
  /** ID of the currently active conversation */
  activeConversationId?: string
  /** Current search query */
  searchQuery?: string
  /** Callback when search query changes */
  onSearchChange?: (_query: string) => void
  /** Callback when Articles link is pressed */
  onArticlesPress?: () => void
  /** Callback when Subscriptions link is pressed */
  onSubscriptionsPress?: () => void
  /** Callback when Toolbelt link is pressed */
  onToolbeltPress?: () => void
  /** Callback when Settings is pressed */
  onSettingsPress?: () => void
  /** Callback when New Chat is pressed */
  onNewChatPress?: () => void
  /** Callback when a conversation is selected */
  onConversationPress?: (_conversation: Conversation) => void
  /** Callback when a conversation delete is triggered */
  onConversationDelete?: (_conversation: Conversation) => void
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
  /** Callback when delete is confirmed from action menu */
  onDelete?: () => void
  /** Whether a rename operation is in progress */
  isRenaming?: boolean
  /** Whether a delete operation is in progress */
  isDeleting?: boolean
  /** Whether there are active long-running tasks */
  hasActiveTasks?: boolean
}

/**
 * DrawerContent is the navigation drawer screen.
 * Composes DrawerHeader and ConversationRow atoms.
 * Shows search, app sections, and conversation list.
 *
 * Manages "one delete at a time" state - only one conversation row
 * can show its inline delete button at a time.
 */
export function DrawerContent({
  conversations = [],
  activeConversationId,
  searchQuery = '',
  onSearchChange,
  onArticlesPress,
  onSubscriptionsPress,
  onToolbeltPress,
  onSettingsPress,
  onNewChatPress,
  onConversationPress,
  onConversationDelete,
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
  hasActiveTasks = false,
  className,
  ...props
}: DrawerContentProps) {
  const insets = useSafeAreaInsets()

  // Track which conversation row is showing its delete button (only one at a time)
  const [deleteVisibleId, setDeleteVisibleId] = useState<string | null>(null)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearDismissTimer = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current)
      dismissTimer.current = null
    }
  }, [])

  // Auto-dismiss after delay
  useEffect(() => {
    if (deleteVisibleId) {
      clearDismissTimer()
      dismissTimer.current = setTimeout(() => {
        setDeleteVisibleId(null)
      }, DISMISS_DELAY)
    }
    return clearDismissTimer
  }, [deleteVisibleId, clearDismissTimer])

  const handleRowLongPress = useCallback((conversationId: string) => {
    // If the same row is long-pressed again, dismiss it
    // Otherwise, show the new one (auto-hides previous)
    setDeleteVisibleId((prev) => (prev === conversationId ? null : conversationId))
  }, [])

  const handleDismissDelete = useCallback(() => {
    clearDismissTimer()
    setDeleteVisibleId(null)
  }, [clearDismissTimer])

  const sections: NavSection[] = [
    { id: 'articles', label: 'Articles', icon: <BookOpen size={20} className="text-foreground" />, onPress: onArticlesPress },
    { id: 'subscriptions', label: 'Subscriptions', icon: <Bell size={20} className="text-foreground" />, onPress: onSubscriptionsPress },
    { id: 'toolbelt', label: 'Toolbelt', icon: <Wrench size={20} className="text-foreground" />, onPress: onToolbeltPress },
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
      id={item.id}
      title={item.title}
      lastMessage={item.lastMessage}
      lastMessageAt={item.lastMessageAt}
      isActive={item.id === activeConversationId}
      isDeleteVisible={deleteVisibleId === item.id}
      onPress={() => {
        handleDismissDelete()
        onConversationPress?.(item)
      }}
      onLongPress={() => handleRowLongPress(item.id)}
      onDelete={onConversationDelete ? () => {
        handleDismissDelete()
        onConversationDelete(item)
      } : undefined}
      onDismissDelete={handleDismissDelete}
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
        hasActiveTasks={hasActiveTasks}
        style={{ paddingTop: insets.top + 12 }}
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
          contentContainerStyle={{ gap: 2, paddingBottom: insets.bottom }}
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
