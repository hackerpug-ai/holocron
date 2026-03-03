import { ChatBubble, type ChatRole } from '@/components/ChatBubble'
import { ChatInput, type SlashCommand } from '@/components/chat/ChatInput'
import { type CategoryType } from '@/components/CategoryBadge'
import { CommandBadge } from '@/components/CommandBadge'
import { ResearchProgress, type ResearchStatus } from '@/components/ResearchProgress'
import { ResultCard, type ResultType } from '@/components/ResultCard'
import { TypingIndicator } from '@/components/TypingIndicator'
import { cn } from '@/lib/utils'
import { useRef } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, View, type ViewProps } from 'react-native'

export interface ChatMessage {
  id: string
  content: string
  sender: ChatRole
  timestamp: Date
  isPending?: boolean
  /** If this message contains a slash command */
  command?: {
    name: string
    args?: string
  }
  /** If this message has result cards */
  results?: Array<{
    id: string
    title: string
    type: ResultType
    snippet?: string
    category?: CategoryType
    confidence?: number
  }>
  /** If this message has active research */
  research?: {
    query: string
    status: ResearchStatus
    progress: number
    currentIteration?: number
    totalIterations?: number
    statusMessage?: string
  }
}

interface ChatScreenProps extends Omit<ViewProps, 'children'> {
  /** Messages to display */
  messages?: ChatMessage[]
  /** Whether the agent is processing */
  isTyping?: boolean
  /** Whether input should be disabled */
  inputDisabled?: boolean
  /** Callback when user sends a message */
  onSendMessage?: (_message: string) => void
  /** Callback when user selects a slash command from the menu */
  onSelectCommand?: (_command: SlashCommand) => void
  /** Callback when a result card is pressed */
  onResultPress?: (_resultId: string) => void
  /** Callback when menu button is pressed */
  onMenuPress?: () => void
}

/**
 * ChatScreen is the main chat interface screen.
 * Features a refined, editorial aesthetic with smooth animations
 * and thoughtful visual hierarchy.
 */
export function ChatScreen({
  messages = [],
  isTyping = false,
  inputDisabled = false,
  onSendMessage,
  onSelectCommand,
  onResultPress,
  className,
  ...props
}: ChatScreenProps) {
  const flatListRef = useRef<FlatList>(null)

  const handleSend = (message: string) => {
    onSendMessage?.(message)
  }

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const isFirstMessage = index === 0
    const prevMessage = index > 0 ? messages[index - 1] : null
    const isNewSender = !prevMessage || prevMessage.sender !== item.sender

    return (
      <View
        className={cn(
          'px-4',
          // Tighter spacing for consecutive messages from same sender
          isNewSender ? 'pt-4' : 'pt-1.5',
          isFirstMessage && 'pt-6'
        )}
      >
        {/* Command Badge if this is a command message */}
        {item.command && (
          <View className="mb-3 ml-10">
            <CommandBadge command={item.command.name} args={item.command.args} />
          </View>
        )}

        {/* Chat Bubble */}
        <ChatBubble
          content={item.content}
          sender={item.sender}
          timestamp={isNewSender ? item.timestamp : undefined}
          isPending={item.isPending}
        />

        {/* Result Cards */}
        {item.results && item.results.length > 0 && (
          <View className="ml-10 mt-3 gap-2">
            {item.results.map((result) => (
              <ResultCard
                key={result.id}
                title={result.title}
                type={result.type}
                snippet={result.snippet}
                category={result.category}
                confidence={result.confidence}
                onPress={() => onResultPress?.(result.id)}
              />
            ))}
          </View>
        )}

        {/* Research Progress */}
        {item.research && (
          <View className="ml-10 mt-3">
            <ResearchProgress
              query={item.research.query}
              status={item.research.status}
              progress={item.research.progress}
              currentIteration={item.research.currentIteration}
              totalIterations={item.research.totalIterations}
              statusMessage={item.research.statusMessage}
            />
          </View>
        )}
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className={cn('bg-background flex-1', className)}
      testID="chat-screen"
      {...props}
    >
      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 16 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          isTyping ? (
            <View className="px-4 pt-4">
              <TypingIndicator />
            </View>
          ) : null
        }
      />

      {/* Input Bar - ChatInput handles command selection internally */}
      <ChatInput
        onSend={handleSend}
        onSelectCommand={onSelectCommand}
        disabled={inputDisabled}
        placeholder="Ask anything..."
      />
    </KeyboardAvoidingView>
  )
}
