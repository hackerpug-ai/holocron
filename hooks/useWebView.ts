import { useRouter } from 'expo-router'
import { useCallback } from 'react'

/**
 * Hook to open URLs in the in-app WebView.
 *
 * @example
 * ```tsx
 * const { openUrl } = useWebView()
 *
 * // Open a URL in the WebView
 * openUrl('https://example.com')
 * ```
 */
export function useWebView() {
  const router = useRouter()

  /**
   * Opens a URL in the in-app WebView browser.
   * Encodes the URL to safely pass through route parameters.
   */
  const openUrl = useCallback(
    (url: string) => {
      const encodedUrl = encodeURIComponent(url)
      router.push(`/webview/${encodedUrl}`)
    },
    [router]
  )

  return {
    openUrl,
  }
}
