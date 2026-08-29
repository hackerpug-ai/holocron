/**
 * Subscription cleanup registry for the legacy package.
 * Realtime push was retired with the platform HTTP repoint (S31-05).
 */

type SubscriptionHandler = () => void;

export class SubscriptionManager {
  private subscriptions: Map<string, SubscriptionHandler> = new Map();

  add(sessionId: string, unsubscribe: SubscriptionHandler): void {
    this.remove(sessionId);
    this.subscriptions.set(sessionId, unsubscribe);
  }

  remove(sessionId: string): void {
    const unsub = this.subscriptions.get(sessionId);
    if (unsub) {
      unsub();
      this.subscriptions.delete(sessionId);
    }
  }

  cleanup(): void {
    for (const unsub of this.subscriptions.values()) {
      unsub();
    }
    this.subscriptions.clear();
  }
}

export const subscriptionManager = new SubscriptionManager();

/** No-op progress stream — platform HTTP has no realtime push channel. */
export function streamProgress(_sessionId: string): () => void {
  return () => {
    // intentionally empty
  };
}
