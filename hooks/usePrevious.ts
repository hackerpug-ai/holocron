import { useRef, useEffect } from 'react'

/**
 * Hook to track the previous value of a variable.
 *
 * Returns the previous value (undefined on first render).
 * Uses ref pattern to avoid causing re-renders.
 *
 * @example
 * ```tsx
 * const prevCount = usePrevious(count)
 * if (prevCount !== count && prevCount !== undefined) {
 *   console.log(`Count changed from ${prevCount} to ${count}`)
 * }
 * ```
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>(undefined)

  // Store current value in ref for next render
  useEffect(() => {
    ref.current = value
  })

  // Return previous value (undefined on first render)
  return ref.current
}
