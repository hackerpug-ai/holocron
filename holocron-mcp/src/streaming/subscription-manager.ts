import type { ResearchSession } from '../convex/types.ts'
import { formatProgress } from './formatter.ts'

type SubscriptionHandler = () => void

/**
 * Manages Convex subscriptions for realtime updates
 * Ensures cleanup on server shutdown
 */
export class SubscriptionManager {
  private subscriptions: Map<string, SubscriptionHandler> = new Map()

  /**
   * Add a subscription with its unsubscribe handler
   */
  add(sessionId: string, unsubscribe: SubscriptionHandler): void {
    // Clean up existing subscription if present
    this.remove(sessionId)
    this.subscriptions.set(sessionId, unsubscribe)
  }

  /**
   * Remove and cleanup a specific subscription
   */
  remove(sessionId: string): void {
    const unsub = this.subscriptions.get(sessionId)
    if (unsub) {
      unsub()
      this.subscriptions.delete(sessionId)
    }
  }

  /**
   * Cleanup all active subscriptions
   */
  cleanup(): void {
    for (const unsub of this.subscriptions.values()) {
      unsub()
    }
    this.subscriptions.clear()
  }

  /**
   * Get count of active subscriptions
   */
  count(): number {
    return this.subscriptions.size
  }
}

/**
 * Stream research progress updates to stderr (MCP stderr logging)
 */
export function streamProgress(session: ResearchSession): void {
  const progress = formatProgress(session)
  console.error(progress) // stderr for MCP, stdout reserved for protocol
}

/**
 * Global subscription manager instance
 */
export const subscriptionManager = new SubscriptionManager()
