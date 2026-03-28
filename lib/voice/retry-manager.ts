/**
 * US-015: RetryManager
 *
 * Handles WebRTC connection failure detection and automatic retry with
 * exponential backoff (1s, 2s, 4s). Provides spoken feedback at each
 * retry step and transitions to ERROR state after max retries exhausted.
 *
 * Also supports single-retry for Convex function calls on network failure.
 */

export type RetryState = 'connecting' | 'listening' | 'error'

export interface RetryManagerCallbacks {
  /** Called with user-friendly spoken messages at each retry step */
  onSpokenFeedback: (message: string) => void
  /** Called when retry state changes */
  onStateChange: (state: RetryState) => void
  /** Called before each retry attempt to clean up orphaned connections */
  onCleanup?: () => void
}

export interface RetryManagerOptions extends RetryManagerCallbacks {
  /** Base delay in ms for exponential backoff. Default: 1000 */
  baseDelay?: number
  /** Maximum number of retry attempts. Default: 3 */
  maxRetries?: number
}

export type FunctionCallResult<T> = T | { error: string }

export class RetryManager {
  private readonly onSpokenFeedback: (message: string) => void
  private readonly onStateChange: (state: RetryState) => void
  private readonly onCleanup?: () => void
  private readonly baseDelay: number
  private readonly maxRetries: number

  constructor(options: RetryManagerOptions) {
    this.onSpokenFeedback = options.onSpokenFeedback
    this.onStateChange = options.onStateChange
    this.onCleanup = options.onCleanup
    this.baseDelay = options.baseDelay ?? 1000
    this.maxRetries = options.maxRetries ?? 3
  }

  /**
   * Handles a WebRTC connection failure by retrying connectFn up to maxRetries
   * times with exponential backoff delays (baseDelay * 2^i).
   *
   * - Emits 'connecting' state and spoken feedback before each retry.
   * - On success, emits 'listening' state.
   * - On exhaustion, emits 'error' state and user-friendly spoken message.
   * - Calls onCleanup before each retry to prevent orphaned connections.
   *
   * The initial call to connectFn has already failed before this method is
   * invoked — this method handles the retry sequence only.
   */
  async handleConnectionFailure(connectFn: () => Promise<void>): Promise<void> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const delayMs = this.baseDelay * Math.pow(2, attempt)

      await new Promise<void>((resolve) => setTimeout(resolve, delayMs))

      // Clean up orphaned connection before retry
      this.onCleanup?.()

      // Signal retry in progress
      this.onStateChange('connecting')
      this.onSpokenFeedback('Lost connection. Trying again...')

      try {
        await connectFn()
        // Success — resume normal session
        this.onStateChange('listening')
        return
      } catch {
        // This attempt failed — continue to next retry
      }
    }

    // All retries exhausted
    this.onStateChange('error')
    this.onSpokenFeedback('No internet. Please check your connection.')
  }

  /**
   * Executes a Convex function call and retries exactly once on network failure.
   * Returns the result on success, or { error: message } if both attempts fail.
   */
  async retryFunctionCall<T>(fn: () => Promise<T>): Promise<FunctionCallResult<T>> {
    try {
      return await fn()
    } catch {
      // Retry once
      try {
        return await fn()
      } catch (secondError) {
        const message =
          secondError instanceof Error
            ? secondError.message
            : 'Unknown error'
        return { error: message }
      }
    }
  }
}

/**
 * Factory function to create a RetryManager instance.
 */
export function createRetryManager(options: RetryManagerOptions): RetryManager {
  return new RetryManager(options)
}
