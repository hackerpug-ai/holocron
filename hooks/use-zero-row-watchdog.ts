/**
 * Shared Zero-row loading watchdog (S31-FE-02).
 *
 * When a Zero-backed query is enabled but the row stays `undefined` past the
 * deadline (zero-cache down / never replicates), surface a terminal Error so
 * existing error branches can render instead of spinning forever.
 *
 * Does NOT fire when:
 * - `enabled` is false (query not asked — id null / disabled)
 * - the row becomes defined before the deadline
 */

import { useEffect, useRef, useState } from 'react';

/**
 * Cold-sync floor. Must stay >= 15000 so a healthy slow first paint (R39)
 * is not reported as a terminal error. Cap policy: ask before > 45000.
 */
export const ZERO_ROW_WATCHDOG_DEADLINE_MS = 30_000;

/**
 * Exported terminal copy for Zero-row timeout surfaces.
 * Follows SURFACE_UNAVAILABLE_MESSAGE precedent — never inline at call sites.
 */
export const ZERO_ROW_WATCHDOG_MESSAGE = 'Live data sync unavailable — could not load this content';

/**
 * @param row - Query row: `undefined` while still pending, any other value
 *   (including `null` / empty array) means the query produced a result.
 * @param enabled - Whether the query was actually requested.
 * @returns Error after deadline only for enabled-and-still-undefined; else null.
 */
export function useZeroRowWatchdog(row: unknown, enabled: boolean): Error | null {
  const [error, setError] = useState<Error | null>(null);
  const pending = enabled && row === undefined;
  // Survive effect re-runs (Strict Mode / Zero reconnect churn) without resetting
  // the deadline while still pending. Full unmount still resets via ref identity.
  const pendingSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!pending) {
      pendingSinceRef.current = null;
      setError(null);
      return;
    }

    if (pendingSinceRef.current == null) {
      pendingSinceRef.current = Date.now();
    }

    const elapsed = Date.now() - pendingSinceRef.current;
    const remaining = Math.max(0, ZERO_ROW_WATCHDOG_DEADLINE_MS - elapsed);

    if (remaining === 0) {
      setError(new Error(ZERO_ROW_WATCHDOG_MESSAGE));
      return;
    }

    const timer = setTimeout(() => {
      setError(new Error(ZERO_ROW_WATCHDOG_MESSAGE));
    }, remaining);

    return () => {
      clearTimeout(timer);
    };
  }, [pending]);

  // While not pending, never report a stale error from a previous cycle.
  if (!pending) {
    return null;
  }

  return error;
}
