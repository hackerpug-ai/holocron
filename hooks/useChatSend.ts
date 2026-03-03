/**
 * Custom hook for sending messages with optimistic updates
 *
 * Integrates with the chat-send Edge Function (US-011)
 * Provides optimistic updates for ChatInput component (US-017)
 *
 * @see US-017 - Wire ChatInput to chat-send API with optimistic updates
 *
 * BEHAVIOR (TDD Acceptance Criteria):
 *
 * AC-1: Optimistic updates
 * - GIVEN a conversation ID and message content
 * - WHEN send is called
 * - THEN show user message immediately with temp ID before API responds
 *
 * AC-2: Successful response handling
 * - GIVEN a successful API response
 * - WHEN the response contains user_message_id and agent_messages
 * - THEN replace temp message with real message and append agent messages
 *
 * AC-3: Failed sends with retry
 * - GIVEN an API error during send
 * - WHEN the send fails
 * - THEN mark message as failed and preserve content for retry
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { ChatMessage } from '@/components/chat/ChatThread'
import type { MessageType } from '@/lib/types/conversations'

interface ChatSendRequest {
  conversation_id: string
  content: string
  message_type: 'text' | 'slash_command'
}

interface AgentMessage {
  id: string
  role: 'agent'
  content: string
  message_type: MessageType
  card_data?: unknown
}

interface ChatSendResponse {
  user_message_id: string
  agent_messages: AgentMessage[]
}

interface UseChatSendResult {
  send: (_content: string) => Promise<string | null>
  sendResumeCommand: (_sessionId: string) => Promise<string | null>
  isSending: boolean
  pendingMessage: ChatMessage | null
  error: Error | null
  retry: () => Promise<void>
  clearError: () => void
}

/**
 * Send messages with optimistic updates
 *
 * @param conversationId - UUID of the conversation (or 'new' for lazy creation)
 * @param prependMessages - Callback to prepend messages to the list
 * @param replaceMessage - Callback to replace a temp message with real message
 * @param onCreateConversation - Optional callback to create conversation on first message (for lazy creation)
 */
export function useChatSend(
  conversationId: string,
  prependMessages: (_messages: ChatMessage[]) => void,
  replaceMessage: (_tempId: string, _realMessage: ChatMessage) => void,
  onCreateConversation?: () => Promise<string>
): UseChatSendResult {
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [pendingMessage, setPendingMessage] = useState<ChatMessage | null>(null)

  // Track last failed message for retry
  const lastFailedMessageRef = useRef<string | null>(null)

  // Track the actual conversation ID (may be created lazily)
  const actualConversationIdRef = useRef<string>(conversationId)

  // Update ref when conversationId prop changes
  useEffect(() => {
    actualConversationIdRef.current = conversationId
  }, [conversationId])

  const send = useCallback(
    async (content: string): Promise<string | null> => {
      if (!content.trim() || isSending) {
        return null
      }

      setIsSending(true)
      setError(null)

      // Track if we created a new conversation
      let newConversationId: string | null = null

      // Generate temporary ID for optimistic update
      const tempId = `temp-${Date.now()}`

      const tempMessage: ChatMessage = {
        id: tempId,
        role: 'user',
        content,
        createdAt: new Date(),
      }

      // AC-1: Optimistic update - show message immediately
      setPendingMessage(tempMessage)
      prependMessages([tempMessage])

      try {
        // Lazy conversation creation: create on first message
        let targetConversationId = actualConversationIdRef.current
        if (targetConversationId === 'new' && onCreateConversation) {
          newConversationId = await onCreateConversation()
          targetConversationId = newConversationId
          actualConversationIdRef.current = newConversationId
        }

        if (!targetConversationId || targetConversationId === 'new') {
          throw new Error('No valid conversation ID')
        }

        // Build API request
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
        const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

        if (!supabaseUrl || !anonKey) {
          throw new Error('Missing Supabase configuration')
        }

        const requestBody: ChatSendRequest = {
          conversation_id: targetConversationId,
          content,
          message_type: 'text',
        }

        const response = await fetch(
          `${supabaseUrl}/functions/v1/chat-send`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${anonKey}`,
              'apikey': anonKey,
            },
            body: JSON.stringify(requestBody),
          }
        )

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`API error: ${response.status} - ${errorText}`)
        }

        const data: ChatSendResponse = await response.json()

        // AC-2: Success - replace temp message with confirmed user message
        const confirmedUserMessage: ChatMessage = {
          id: data.user_message_id,
          role: 'user',
          content,
          createdAt: new Date(),
        }

        // Replace the temp message with the real one
        replaceMessage(tempId, confirmedUserMessage)

        // Add agent messages
        const agentMessages: ChatMessage[] = data.agent_messages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          message_type: msg.message_type,
          card_data: msg.card_data as Record<string, unknown> | undefined,
          createdAt: new Date(),
        }))

        if (agentMessages.length > 0) {
          prependMessages(agentMessages)
        }

        // Clear tracking refs on success
        setPendingMessage(null)
        lastFailedMessageRef.current = null

        // Return new conversation ID if one was created
        return newConversationId

      } catch (err) {
        // AC-3: Mark message as failed (keep for retry)
        const error = err instanceof Error ? err : new Error('Unknown error')
        setError(error)
        lastFailedMessageRef.current = content
        console.error('useChatSend error:', error)
        return null
      } finally {
        setIsSending(false)
      }
    },
    [conversationId, isSending, prependMessages, replaceMessage, onCreateConversation]
  )

  const retry = useCallback(async () => {
    if (lastFailedMessageRef.current) {
      await send(lastFailedMessageRef.current)
    }
  }, [send])

  /**
   * Send a resume command for a specific session
   * Sends `/resume {sessionId}` to the chat backend
   *
   * @param sessionId - The session ID to resume
   * @returns Promise that resolves to new conversation ID if created, null otherwise
   */
  const sendResumeCommand = useCallback(
    async (sessionId: string): Promise<string | null> => {
      return send(`/resume ${sessionId}`)
    },
    [send]
  )

  const clearError = useCallback(() => {
    setError(null)
    setPendingMessage(null)
    lastFailedMessageRef.current = null
  }, [])

  return {
    send,
    sendResumeCommand,
    isSending,
    pendingMessage,
    error,
    retry,
    clearError,
  }
}
