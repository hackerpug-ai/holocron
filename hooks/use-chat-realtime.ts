/**
 * Custom hook for Supabase Realtime subscription to chat messages
 *
 * Subscribes to INSERT events on chat_messages table filtered by conversation_id
 * Handles cleanup when conversation changes
 *
 * @see US-018 - Add typing indicator and timestamp display to message bubbles
 */

import { useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ChatMessage } from '@/components/chat/ChatThread'
import type { MessageRole } from '@/lib/types/conversations'

interface ChatMessageRow {
  id: string
  conversation_id: string
  role: MessageRole
  content: string
  created_at: string
  message_type: string
  card_data?: Record<string, unknown> | null
  session_id?: string | null
  document_id?: number | null
}

interface UseChatRealtimeOptions {
  conversationId: string | null
  onNewMessage: (message: ChatMessage) => void
}

/**
 * Subscribe to real-time updates for a conversation
 *
 * @param conversationId - UUID of the conversation to subscribe to
 * @param onNewMessage - Callback invoked when a new message arrives
 */
export function useChatRealtime({
  conversationId,
  onNewMessage,
}: UseChatRealtimeOptions) {
  // Memoize callback to prevent unnecessary re-subscriptions
  const handleNewMessage = useCallback(
    (payload: { new: ChatMessageRow }) => {
      const msg = payload.new
      const chatMessage: ChatMessage = {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: new Date(msg.created_at),
      }
      onNewMessage(chatMessage)
    },
    [onNewMessage]
  )

  useEffect(() => {
    if (!conversationId) return

    // Create channel for this conversation
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        handleNewMessage
      )
      .subscribe()

    // Cleanup: unsubscribe when conversation changes or component unmounts
    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, handleNewMessage])
}
