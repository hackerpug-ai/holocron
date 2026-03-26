import { useState } from 'react'

export interface WebViewState {
  visible: boolean
  url: string
}

/**
 * WebViewSheet Integration for Feed Items
 *
 * STANDARD PATTERN (MUST USE):
 * 1. Import useWebView hook
 * 2. Destructure: webViewState, openUrl, closeWebView
 * 3. Add single WebViewSheet at component root
 * 4. Call openUrl() from Pressable onPress
 *
 * @example
 * ```tsx
 * import { useWebView } from '@/hooks/useWebView'
 * import { WebViewSheet } from '@/components/webview/WebViewSheet'
 *
 * export function MyFeedCard({ item }) {
 *   const { webViewState, openUrl, closeWebView } = useWebView()
 *
 *   return (
 *     <>
 *       <Pressable onPress={() => openUrl(item.url)}>
 *         <Text>{item.title}</Text>
 *       </Pressable>
 *
 *       <WebViewSheet
 *         visible={webViewState.visible}
 *         url={webViewState.url}
 *         onClose={closeWebView}
 *         testID={`feed-item-${item._id}-webview`}
 *       />
 *     </>
 *   )
 * }
 * ```
 *
 * ALTERNATIVES: NONE - This is the only approved pattern for feed items
 *
 * WHY: Consistent UX, in-app browsing, swipe-to-dismiss, navigation controls
 */
export function useWebView() {
  const [webViewState, setWebViewState] = useState<WebViewState>({
    visible: false,
    url: '',
  })

  const openUrl = (url: string) => {
    setWebViewState({ visible: true, url })
  }

  const closeWebView = () => {
    setWebViewState({ visible: false, url: '' })
  }

  return {
    webViewState,
    openUrl,
    closeWebView,
  }
}
