/**
 * useDebounce Hook
 *
 * A custom debounce hook that properly cancels pending timeouts on unmount.
 * This is useful for delaying execution of a function until after a wait time
 * has elapsed since the last time it was invoked.
 *
 * @template T - Function type to debounce
 * @param fn - The function to debounce
 * @param delay - The delay in milliseconds
 * @returns The debounced function
 *
 * @example
 * ```tsx
 * const debouncedSearch = useDebounce(performSearch, 300)
 *
 * useEffect(() => {
 *   debouncedSearch(searchQuery)
 * }, [searchQuery, debouncedSearch])
 * ```
 */
import { useCallback, useEffect, useRef } from 'react'

export function useDebounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fnRef = useRef(fn)

  // Keep fn ref up to date without causing re-renders
  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  // Cleanup on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => fnRef.current(...args), delay)
    }) as T,
    [delay]
  )
}
