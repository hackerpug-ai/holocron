import { ConvexClient } from 'convex/browser'
import type { FunctionReference } from 'convex/server'
import { env } from '../config/env.ts'

/**
 * Holocron Convex Client wrapper
 * Provides subscription-based access to Convex backend with type-safe wrappers
 */
export class HolocronConvexClient {
  private client: ConvexClient

  constructor() {
    this.client = new ConvexClient(env.CONVEX_URL)
  }

  /**
   * Subscribe to realtime query updates
   * Returns an unsubscribe function
   */
  subscribe<T>(
    query: FunctionReference<'query'>,
    args: unknown,
    onUpdate: (result: T) => void
  ): () => void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.client.onUpdate(query as any, args, onUpdate)
  }

  /**
   * Execute a query once
   */
  async query<T>(
    query: FunctionReference<'query'>,
    args?: unknown
  ): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.client.query(query as any, args ?? {}) as Promise<T>
  }

  /**
   * Execute a mutation
   */
  async mutation<T>(
    mutation: FunctionReference<'mutation'>,
    args?: unknown
  ): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.client.mutation(mutation as any, args ?? {}) as Promise<T>
  }

  /**
   * Execute an action
   */
  async action<T>(
    action: FunctionReference<'action'>,
    args?: unknown
  ): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.client.action(action as any, args ?? {}) as Promise<T>
  }

  /**
   * Close the client connection
   */
  close(): void {
    this.client.close()
  }
}

/**
 * Singleton Convex client instance
 */
export const holocronClient = new HolocronConvexClient()
