import { useEffect, useRef } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

type SendEventFn = (event: Record<string, unknown>) => void

/**
 * Bridges async tool results from Convex to the OpenAI Realtime voice session.
 *
 * Subscribes to recent chatMessages via Convex reactive query (zero additional
 * network overhead — piggybacks on existing WebSocket). When a new result_card
 * or error message appears from the agent, injects it into the OpenAI conversation
 * so the model can speak the results.
 */
export function useVoiceResultBridge(
  conversationId: Id<'conversations'> | null,
  isActive: boolean,
  sendEvent: SendEventFn | null,
): void {
  // Subscribe to the 3 most recent messages (newest first)
  const messages = useQuery(
    api.chatMessages.queries.listByConversation,
    conversationId && isActive ? { conversationId, limit: 3 } : 'skip',
  )

  const lastSeenIdRef = useRef<string | null>(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!messages || !messages.length || !isActive || !sendEvent) return

    const newest = messages[0] // desc order — index 0 is newest
    if (!newest) return

    // First time we get data: record the current latest ID but don't inject.
    // This prevents speaking old results when the session starts.
    if (!initializedRef.current) {
      lastSeenIdRef.current = newest._id
      initializedRef.current = true
      return
    }

    // Same message we already saw — nothing new
    if (newest._id === lastSeenIdRef.current) return

    // Update tracking
    lastSeenIdRef.current = newest._id

    // Only inject result_card or error messages from the agent
    if (
      newest.role !== 'agent' ||
      (newest.messageType !== 'result_card' && newest.messageType !== 'error')
    ) {
      return
    }

    // Skip messages younger than 3 seconds to avoid double-speaking fast-path
    // results that already returned via function_call_output. Async background
    // results take 10+ seconds so they will always pass this check.
    const messageAge = Date.now() - newest.createdAt
    if (messageAge < 3000) {
      return
    }

    // Truncate for voice — keep payloads reasonable
    const content =
      newest.content.length > 1500
        ? newest.content.slice(0, 1500) + '...'
        : newest.content

    // Inject into OpenAI conversation
    sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `[Background task completed] ${content}`,
          },
        ],
      },
    })

    // Trigger model to speak the result
    sendEvent({ type: 'response.create' })
  }, [messages, isActive, sendEvent])

  // Reset initialization when session becomes inactive
  useEffect(() => {
    if (!isActive) {
      initializedRef.current = false
      lastSeenIdRef.current = null
    }
  }, [isActive])
}
