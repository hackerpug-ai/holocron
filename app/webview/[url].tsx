import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebViewScreen } from '@/screens/WebViewScreen';

/**
 * WebView route screen that displays web content in a full-screen browser.
 * Accepts a URL parameter from the route.
 *
 * Route: /webview/[url]
 *
 * @example
 * ```tsx
 * // Navigate to WebView screen
 * router.push(`/webview/${encodeURIComponent('https://example.com')}`)
 * ```
 */
export default function WebViewRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string | string[] }>();

  // Decode the URL from the route parameter
  const rawUrl = Array.isArray(params.url) ? params.url[0] : params.url;
  const url = rawUrl ? decodeURIComponent(rawUrl) : 'about:blank';

  return <WebViewScreen url={url} onClose={() => router.back()} />;
}
