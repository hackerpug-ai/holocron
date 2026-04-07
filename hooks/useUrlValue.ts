import { useLocalSearchParams } from 'expo-router'

/**
 * Hook to read a URL parameter value directly from the search params.
 *
 * URL params are the source of truth - this hook reads them directly
 * without any state syncing anti-patterns.
 *
 * For updates: use `router.setParams()` directly in your component.
 *
 * @example
 * ```tsx
 * const sessionId = useUrlValue('sessionId')
 * const router = useRouter()
 *
 * // To update the URL param:
 * router.setParams({ sessionId: 'new-value' })
 * ```
 *
 * @param key - The URL parameter key to read
 * @returns The parameter value or empty string if not present
 */
export function useUrlValue(key: string): string {
  const params = useLocalSearchParams()
  return (params[key] as string) ?? ''
}
