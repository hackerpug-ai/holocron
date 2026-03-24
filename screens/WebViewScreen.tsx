import { Text } from '@/components/ui/text'
import { useTheme } from '@/hooks/use-theme'
import { ChevronLeft, ChevronRight, Lock, RefreshCw, X } from '@/components/ui/icons'
import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import WebView, {
  type WebViewNavigation,
} from 'react-native-webview'

interface WebViewScreenProps extends Omit<ViewProps, 'children'> {
  /** Initial URL to load */
  url: string
  /** Callback when close button is pressed */
  onClose: () => void
  /** Optional custom title (defaults to page title from WebView) */
  title?: string
  /** Optional test ID */
  testID?: string
}

/**
 * Extract hostname from URL for display
 */
function getDisplayUrl(url: string): { host: string; isSecure: boolean } {
  try {
    const parsed = new URL(url)
    return {
      host: parsed.hostname.replace(/^www\./, ''),
      isSecure: parsed.protocol === 'https:',
    }
  } catch {
    return { host: url, isSecure: false }
  }
}

/**
 * WebViewScreen provides a full-screen web browser with navigation controls.
 *
 * Features:
 * - Compact single-row toolbar (Safari-style)
 * - Back/Forward navigation buttons (show only when available)
 * - Refresh button with loading state
 * - Close button to exit
 * - Secure URL indicator
 * - Swipe navigation gestures (iOS)
 * - Theme-aware styling
 *
 * @example
 * ```tsx
 * <WebViewScreen
 *   url="https://example.com"
 *   onClose={() => router.back()}
 * />
 * ```
 */
export function WebViewScreen({
  url,
  onClose,
  title: _title, // Kept for API compatibility, URL bar shows hostname instead
  testID = 'webview-screen',
  style,
  ...props
}: WebViewScreenProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const webViewRef = useRef<WebView>(null)

  // State
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [loading, setLoading] = useState(true)
  const [currentUrl, setCurrentUrl] = useState(url)

  // Derived state
  const { host, isSecure } = getDisplayUrl(currentUrl)

  // Navigation handlers
  const handleGoBack = () => webViewRef.current?.goBack()
  const handleGoForward = () => webViewRef.current?.goForward()
  const handleRefresh = () => webViewRef.current?.reload()

  // WebView event handlers
  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack)
    setCanGoForward(navState.canGoForward)
    setCurrentUrl(navState.url)
  }

  const handleLoadStart = () => setLoading(true)
  const handleLoadEnd = () => setLoading(false)

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }, style]}
      testID={testID}
      {...props}
    >
      {/* Compact Toolbar */}
      <View
        style={[
          styles.toolbar,
          {
            paddingTop: insets.top + theme.spacing.xs,
            backgroundColor: theme.colors.background,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        {/* Close Button */}
        <Pressable
          onPress={onClose}
          style={[styles.iconButton, { marginRight: theme.spacing.xs }]}
          testID={`${testID}-close-button`}
          accessibilityRole="button"
          accessibilityLabel="Close browser"
        >
          <X size={20} className="text-foreground" />
        </Pressable>

        {/* URL Bar */}
        <View
          style={[
            styles.urlBar,
            {
              backgroundColor: theme.colors.muted,
              borderRadius: theme.radius.md,
            },
          ]}
        >
          {isSecure && (
            <Lock size={12} className="text-muted-foreground" style={styles.lockIcon} />
          )}
          <Text
            variant="small"
            className="text-foreground"
            numberOfLines={1}
            style={styles.urlText}
            testID={`${testID}-url-display`}
          >
            {host}
          </Text>
        </View>

        {/* Nav Controls */}
        <View style={styles.navControls}>
          {/* Back - only show if can go back */}
          {canGoBack && (
            <Pressable
              onPress={handleGoBack}
              style={styles.iconButton}
              testID={`${testID}-back-button`}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft size={20} className="text-foreground" />
            </Pressable>
          )}

          {/* Forward - only show if can go forward */}
          {canGoForward && (
            <Pressable
              onPress={handleGoForward}
              style={styles.iconButton}
              testID={`${testID}-forward-button`}
              accessibilityRole="button"
              accessibilityLabel="Go forward"
            >
              <ChevronRight size={20} className="text-foreground" />
            </Pressable>
          )}

          {/* Refresh / Loading */}
          <Pressable
            onPress={handleRefresh}
            style={styles.iconButton}
            disabled={loading}
            testID={`${testID}-refresh-button`}
            accessibilityRole="button"
            accessibilityLabel={loading ? 'Loading' : 'Refresh page'}
          >
            {loading ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <RefreshCw size={18} className="text-muted-foreground" />
            )}
          </Pressable>
        </View>
      </View>

      {/* WebView */}
      <View style={styles.webViewContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: url }}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadStart={handleLoadStart}
          onLoadEnd={handleLoadEnd}
          style={{ backgroundColor: theme.colors.background }}
          testID={`${testID}-webview`}
          // Security settings
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={false}
          // Handle errors gracefully
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent
            console.error('[WebViewScreen] Error loading URL:', nativeEvent)
          }}
          // iOS specific - enables swipe back/forward gestures
          allowsBackForwardNavigationGestures={true}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  urlBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 10,
    marginHorizontal: 4,
  },
  lockIcon: {
    marginRight: 4,
  },
  urlText: {
    flex: 1,
  },
  navControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  webViewContainer: {
    flex: 1,
  },
})
