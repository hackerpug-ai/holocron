import { useConvex } from 'convex/react';
import { useEffect, useRef } from 'react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

type SendEventFn = (event: Record<string, unknown>) => void;

type BridgeMessage = {
  _id: string;
  role?: string;
  messageType?: string;
  content: string;
  createdAt: number;
};

/**
 * Bridges async tool results from Convex to the OpenAI Realtime voice session.
 *
 * When ConvexProvider is present, subscribes via watchQuery. When absent
 * (chat cold-boot under ZeroProvider only — Sprint 20/24), this hook is a
 * no-op and MUST NOT call useQuery/useAction (those throw without a client).
 *
 * When a new result_card or error message appears from the agent, injects it
 * into the OpenAI conversation so the model can speak the results.
 */
export function useVoiceResultBridge(
  conversationId: Id<'conversations'> | null,
  isActive: boolean,
  sendEvent: SendEventFn | null
): void {
  // useConvex() returns undefined without ConvexProvider — does not throw.
  const convex = useConvex();

  const lastSeenIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const sendEventRef = useRef(sendEvent);
  sendEventRef.current = sendEvent;

  // Reset initialization when session becomes inactive
  useEffect(() => {
    if (!isActive) {
      initializedRef.current = false;
      lastSeenIdRef.current = null;
    }
  }, [isActive]);

  useEffect(() => {
    if (!convex || !conversationId || !isActive) return;

    const injectIfNeeded = (messages: BridgeMessage[] | undefined) => {
      const send = sendEventRef.current;
      if (!messages?.length || !send) return;

      const newest = messages[0]; // desc order — index 0 is newest
      if (!newest) return;

      // First time we get data: record the current latest ID but don't inject.
      // This prevents speaking old results when the session starts.
      if (!initializedRef.current) {
        lastSeenIdRef.current = newest._id;
        initializedRef.current = true;
        return;
      }

      // Same message we already saw — nothing new
      if (newest._id === lastSeenIdRef.current) return;

      // Update tracking
      lastSeenIdRef.current = newest._id;

      // Only inject result_card or error messages from the agent
      if (
        newest.role !== 'agent' ||
        (newest.messageType !== 'result_card' && newest.messageType !== 'error')
      ) {
        return;
      }

      // Skip messages younger than 3 seconds to avoid double-speaking fast-path
      // results that already returned via function_call_output. Async background
      // results take 10+ seconds so they will always pass this check.
      const messageAge = Date.now() - newest.createdAt;
      if (messageAge < 3000) {
        return;
      }

      // Truncate for voice — keep payloads reasonable
      const content =
        newest.content.length > 1500 ? `${newest.content.slice(0, 1500)}...` : newest.content;

      // Inject into OpenAI conversation
      send({
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
      });

      // Trigger model to speak the result
      send({ type: 'response.create' });
    };

    const watch = convex.watchQuery(api.chatMessages.queries.listByConversation, {
      conversationId,
      limit: 3,
    });

    try {
      injectIfNeeded(watch.localQueryResult() as BridgeMessage[] | undefined);
    } catch {
      // localQueryResult may throw before first sync
    }

    const unsubscribe = watch.onUpdate(() => {
      try {
        injectIfNeeded(watch.localQueryResult() as BridgeMessage[] | undefined);
      } catch {
        // ignore transient watch errors
      }
    });

    return unsubscribe;
  }, [convex, conversationId, isActive]);
}
