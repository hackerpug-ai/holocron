import { ConversationRow } from '@/components/ConversationRow'
import { DrawerHeader } from '@/components/DrawerHeader'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { ScrollView, View, type ViewProps } from 'react-native'

/** Conversation data structure */
export interface Conversation {
  /** Unique conversation identifier (UUID from Supabase) */
  id: string
  /** Conversation title displayed in the row */
  title: string
  /** Preview of the last message in the conversation */
  lastMessage?: string
  /** Timestamp of the last message */
  lastMessageAt?: Date
}

interface DrawerContentProps extends Omit<ViewProps, 'children'> {
  /** List of conversations to display */
  conversations: Conversation[]
  /** ID of the currently active conversation */
  activeConversationId?: string
  /** Current search query */
  searchQuery?: string
  /** Callback when search query changes */
  onSearchChange?: (query: string) => void
  /** Callback when New Chat button is pressed */
  onNewChatPress?: () => void
  /** Callback when a conversation is selected */
  onConversationPress?: (id: string) => void
  /** Callback when a conversation is long-pressed */
  onConversationLongPress?: (id: string) => void
}

/**
 * DrawerContent is the complete navigation drawer panel content.
 * Composes DrawerHeader and a scrollable list of ConversationRow items.
 * Matches the ChatGPT-style drawer pattern.
 *
 * @example
 * ```tsx
 * <DrawerContent
 *   conversations={conversations}
 *   activeConversationId="conv-123"
 *   onConversationPress={(id) => navigateToChat(id)}
 *   onNewChatPress={() => startNewChat()}
 * />
 * ```
 */
export function DrawerContent({
  conversations,
  activeConversationId,
  searchQuery = '',
  onSearchChange,
  onNewChatPress,
  onConversationPress,
  onConversationLongPress,
  className,
  ...props
}: DrawerContentProps) {
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
      />

      {/* Divider */}
      <View className="bg-border mx-3 h-px" testID="drawer-content-divider" />

      {/* Conversations Label */}
      <View className="px-5 pt-3 pb-2" testID="drawer-content-header">
        <Text className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Conversations
        </Text>
      </View>

      {/* Scrollable Conversation List */}
      <ScrollView
        className="flex-1 px-2"
        contentContainerClassName="gap-1"
        testID="drawer-content-scroll"
      >
        {conversations.length === 0 ? (
          /* Empty State */
          <View className="items-center justify-center py-8" testID="drawer-content-empty">
            <Text className="text-muted-foreground text-sm">No conversations yet</Text>
          </View>
        ) : (
          /* Conversation Rows */
          conversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              title={conversation.title}
              lastMessage={conversation.lastMessage}
              lastMessageAt={conversation.lastMessageAt}
              isActive={conversation.id === activeConversationId}
              onPress={() => onConversationPress?.(conversation.id)}
              onLongPress={() => onConversationLongPress?.(conversation.id)}
            />
          ))
        )}
      </ScrollView>
    </View>
  )
}
