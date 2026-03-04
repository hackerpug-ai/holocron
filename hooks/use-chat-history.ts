/**
 * Custom hook for fetching chat history with pagination
 *
 * Integrates with the chat-history Edge Function (US-012)
 * Provides data for ChatThread component (US-015)
 *
 * @see US-016 - Wire ChatThread to chat-history API with pagination
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { log } from '@/lib/logger-client'
import type { ChatMessage } from '@/components/chat/ChatThread'
import type { MessageRole, MessageType } from '@/lib/types/conversations'
import { useChatRealtime } from './use-chat-realtime'

interface ChatHistoryResponse {
  messages: Array<{
    id: string
    conversation_id: string
    role: MessageRole
    content: string
    message_type: MessageType
    card_data?: Record<string, unknown> | null
    session_id?: string | null
    document_id?: number | null
    created_at: string
  }>
  has_more: boolean
  next_cursor: string | null
}

interface UseChatHistoryReturn {
  messages: ChatMessage[]
  isLoading: boolean
  isLoadingMore: boolean
  error: Error | null
  loadMore: () => void
  hasMore: boolean
  refetch: () => void
  prependMessages: (_newMessages: ChatMessage[]) => void
  replaceMessage: (_tempId: string, _realMessage: ChatMessage) => void
}

/**
 * Fetch chat history for a conversation with cursor-based pagination
 *
 * @param conversationId - UUID of the conversation
 * @param limit - Number of messages per page (default: 20, max: 100)
 */
export function useChatHistory(
  conversationId: string | null,
  limit = 20
): UseChatHistoryReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)

  // Track if initial load has been attempted
  const hasLoadedRef = useRef(false)

  // Fetch function (initial or paginated)
  const fetchMessages = useCallback(
    async (cursor: string | null = null) => {
      if (!conversationId) return

      const isInitialLoad = cursor === null
      if (isInitialLoad) {
        setIsLoading(true)
      } else {
        setIsLoadingMore(true)
      }
      setError(null)

      try {
        // Build query params
        const params = new URLSearchParams({
          conversation_id: conversationId,
          limit: limit.toString(),
        })

        if (cursor) {
          params.append('before', cursor)
        }

        // Use fetch directly for GET requests with query params
        // supabase.functions.invoke doesn't support GET with query params properly
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
        const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

        if (!supabaseUrl || !anonKey) {
          throw new Error('Missing Supabase configuration')
        }

        const response = await fetch(
          `${supabaseUrl}/functions/v1/chat-history?${params.toString()}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${anonKey}`,
              'apikey': anonKey,
            },
          }
        )

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`API error: ${response.status} - ${errorText}`)
        }

        const data: ChatHistoryResponse = await response.json()

        // Transform API messages to ChatMessage format
        const transformedMessages: ChatMessage[] = data.messages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          message_type: msg.message_type,
          card_data: msg.card_data,
          createdAt: new Date(msg.created_at),
        }))

        if (isInitialLoad) {
          setMessages(transformedMessages)
        } else {
          // Append older messages (need to reverse since API returns newest-first)
          setMessages((prev) => [...prev, ...transformedMessages.reverse()])
        }

        setHasMore(data.has_more)
        setNextCursor(data.next_cursor)
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error')
        setError(error)

        log('useChatHistory').error('Failed to fetch chat history', error, {
          conversationId,
        })
      } finally {
        setIsLoading(false)
        setIsLoadingMore(false)
      }
    },
    [conversationId, limit]
  )

  // Initial load when conversationId changes
  useEffect(() => {
    if (conversationId && !hasLoadedRef.current) {
      hasLoadedRef.current = true
      setMessages([])
      setHasMore(false)
      setNextCursor(null)
      fetchMessages(null)
    }

    // Reset when conversationId changes
    return () => {
      if (conversationId) {
        hasLoadedRef.current = false
      }
    }
  }, [conversationId, fetchMessages])

  // Load more messages (pagination)
  const loadMore = useCallback(() => {
    if (!isLoadingMore && !isLoading && hasMore && nextCursor) {
      fetchMessages(nextCursor)
    }
  }, [isLoadingMore, isLoading, hasMore, nextCursor, fetchMessages])

  // Refetch from beginning
  const refetch = useCallback(() => {
    hasLoadedRef.current = false
    setMessages([])
    setHasMore(false)
    setNextCursor(null)
    fetchMessages(null)
  }, [fetchMessages])

  // Prepend messages (for optimistic updates and new messages)
  const prependMessages = useCallback((newMessages: ChatMessage[]) => {
    setMessages((prev) => [...newMessages, ...prev])
  }, [])

  // Replace message (for replacing temp IDs with real IDs after API success)
  const replaceMessage = useCallback((tempId: string, realMessage: ChatMessage) => {
    setMessages((prev) => prev.map((msg) =>
      msg.id === tempId ? realMessage : msg
    ))
  }, [])

  // Handle new messages from Realtime (with deduplication)
  const handleRealtimeMessage = useCallback((newMessage: ChatMessage) => {
    setMessages((prev) => {
      // Deduplicate: check if message already exists
      const exists = prev.some((msg) => msg.id === newMessage.id)
      if (exists) return prev

      // Add new message to the front (newest first)
      return [newMessage, ...prev]
    })
  }, [])

  // Subscribe to Realtime updates
  useChatRealtime({
    conversationId,
    onNewMessage: handleRealtimeMessage,
  })

  return {
    messages,
    isLoading,
    isLoadingMore,
    error,
    loadMore,
    hasMore,
    refetch,
    prependMessages,
    replaceMessage,
  }
}
