/**
 * Custom hook for fetching chat history using Convex
 *
 * Uses direct Convex useQuery for optimal performance.
 * Real-time updates are automatic via Convex reactivity - no subscriptions needed.
 *
 * Migration: US-060 - Direct entity watching pattern
 */

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import type { ChatMessage } from '@/components/chat/ChatThread'

interface UseChatHistoryReturn {
  messages: ChatMessage[]
  isLoading: boolean
  error: Error | null
}

/**
 * Fetch chat history for a conversation with automatic real-time updates.
 *
 * @param conversationId - ID of the conversation
 * @param limit - Optional limit for number of messages (default: no limit)
 *
 * @example
 * ```tsx
 * const { messages, isLoading, error } = useChatHistory(conversationId)
 *
 * if (isLoading) return <LoadingSpinner />
 * if (error) return <ErrorState message={error.message} />
 *
 * return <ChatThread messages={messages} />
 * ```
 */
export function useChatHistory(
  conversationId: string | null,
  limit?: number
): UseChatHistoryReturn {
  // Direct Convex useQuery - automatically updates when messages change
  const messagesData = useQuery(
    api.chatMessages.queries.listByConversation,
    conversationId
      ? {
          conversationId: conversationId as Id<'conversations'>,
          limit,
        }
      : 'skip'
  )

  // Transform Convex Doc to ChatMessage format
  const messages: ChatMessage[] = (messagesData ?? []).map((msg: any) => {
    const transformed = {
      id: msg._id,
      role: msg.role,
      content: msg.content,
      message_type: msg.messageType,
      card_data: msg.cardData,
      toolCallId: msg.toolCallId ?? null,
      createdAt: new Date(msg.createdAt),
    }

    // Debug log for result_card messages
    if (msg.messageType === 'result_card') {
      console.log('[useChatHistory] Transforming result_card:', {
        original: { messageType: msg.messageType, cardData: msg.cardData },
        transformed: { message_type: transformed.message_type, card_data: transformed.card_data }
      })
    }

    return transformed
  })

  return {
    messages,
    isLoading: conversationId !== null && messagesData === undefined,
    error: null, // Convex queries don't throw - they return undefined
  }
}
