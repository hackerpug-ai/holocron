/**
 * US-017: Session timeout with spoken farewell and warm connection
 *
 * SessionTimeout — tracks 30s idle silence and fires onTimeout callback.
 *   - Interruptible: cancel() stops the timeout before it fires.
 *
 * WarmConnection — holds a WebRTCConnection open for 5 minutes after
 *   session timeout to enable sub-200ms re-activation without a new
 *   ephemeral token.
 */

/** 30 seconds — matches idle_timeout_ms in server_vad config */
export const IDLE_TIMEOUT_MS = 30_000

/** 5 minutes — warm connection window after session timeout */
export const WARM_DURATION_MS = 5 * 60 * 1_000

export interface SessionTimeoutOptions {
  onTimeout: () => void
}

/**
 * Manages a single idle-timeout countdown.
 *
 * Usage:
 *   const timeout = new SessionTimeout({ onTimeout: handleTimeout })
 *   timeout.start()       // begin countdown
 *   timeout.cancel()      // user spoke — stop countdown
 *   timeout.isActive()    // true while counting down
 */
export class SessionTimeout {
  private readonly onTimeout: () => void
  private timerId: ReturnType<typeof setTimeout> | null = null

  constructor(options: SessionTimeoutOptions) {
    this.onTimeout = options.onTimeout
  }

  start(): void {
    this.cancel()
    this.timerId = setTimeout(() => {
      this.timerId = null
      this.onTimeout()
    }, IDLE_TIMEOUT_MS)
  }

  cancel(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
  }

  isActive(): boolean {
    return this.timerId !== null
  }
}

/**
 * A minimal interface for any connection that can be destroyed.
 * Avoids importing WebRTCConnection directly (keeps this module
 * dependency-free from native modules).
 */
export interface DestroyableConnection {
  destroy(): void
}

/**
 * Keeps a WebRTC connection warm for 5 minutes after session timeout.
 * Allows re-activation within that window without a new ephemeral token.
 *
 * Usage:
 *   const warm = new WarmConnection()
 *
 *   // On timeout — keep connection warm
 *   warm.startWarmPeriod(conn)
 *
 *   // On re-activation
 *   const conn = warm.reactivate()
 *   if (conn) {
 *     // fast path — reuse warm connection
 *   } else {
 *     // cold start — create new connection
 *   }
 */
export class WarmConnection {
  private timerId: ReturnType<typeof setTimeout> | null = null
  private connection: DestroyableConnection | null = null

  /**
   * Begin the warm period, keeping conn alive for WARM_DURATION_MS.
   * After WARM_DURATION_MS, destroy the connection automatically.
   */
  startWarmPeriod(conn: DestroyableConnection): void {
    // Clear any previous warm period
    this.destroy()

    this.connection = conn
    this.timerId = setTimeout(() => {
      this.connection?.destroy()
      this.connection = null
      this.timerId = null
    }, WARM_DURATION_MS)
  }

  /**
   * Attempt to re-activate using the warm connection.
   *
   * Returns the warm connection if within the 5-minute window (and cancels
   * the auto-destroy timer so the caller can take ownership).
   * Returns null if the warm period has expired — caller must cold-start.
   */
  reactivate(): DestroyableConnection | null {
    if (this.connection !== null && this.timerId !== null) {
      clearTimeout(this.timerId)
      this.timerId = null
      const conn = this.connection
      this.connection = null
      return conn
    }
    return null
  }

  /**
   * Returns true while a warm connection is held (within the 5-min window).
   */
  isWarm(): boolean {
    return this.connection !== null && this.timerId !== null
  }

  /**
   * Immediately destroy the warm connection and clear the timer.
   * Safe to call multiple times.
   */
  destroy(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
    if (this.connection !== null) {
      this.connection.destroy()
      this.connection = null
    }
  }
}
