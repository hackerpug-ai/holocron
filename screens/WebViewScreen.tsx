import { ScreenHeader } from '@/components/ui/screen-header'
import { Text } from '@/components/ui/text'
import { useTheme } from '@/hooks/use-theme'
import { ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react-native'
import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native'
import WebView, {
  type WebViewNavigation,
  type WebViewMessageEvent,
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
 * WebViewScreen provides a full-screen web browser with navigation controls.
 *
 * Features:
 * - Back/Forward navigation buttons
 * - Refresh button
 * - Close button to exit
 * - Loading indicator
 * - Dynamic page title display
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
  title: customTitle,
  testID = 'webview-screen',
  style,
  ...props
}: WebViewScreenProps) {
  const theme = useTheme()
  const webViewRef = useRef<WebView>(null)

  // State
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [loading, setLoading] = useState(true)
  const [currentUrl, setCurrentUrl] = useState(url)
  const [pageTitle, setPageTitle] = useState(customTitle || 'Loading...')

  // Navigation handlers
  const handleGoBack = () => {
    webViewRef.current?.goBack()
  }

  const handleGoForward = () => {
    webViewRef.current?.goForward()
  }

  const handleRefresh = () => {
    webViewRef.current?.reload()
  }

  // WebView event handlers
  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack)
    setCanGoForward(navState.canGoForward)
    setCurrentUrl(navState.url)
    setPageTitle(navState.title || customTitle || navState.url)
  }

  const handleLoadStart = () => {
    setLoading(true)
  }

  const handleLoadEnd = () => {
    setLoading(false)
  }

  // Create dynamic styles using theme tokens
  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    controlBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.colors.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    controlButton: {
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
    },
    webViewContainer: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    loadingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
  })

  return (
    <View style={[dynamicStyles.container, style]} testID={testID} {...props}>
      {/* Header */}
      <ScreenHeader
        title={pageTitle}
        showBack={false}
        leftContent={
          <Pressable
            onPress={onClose}
            style={dynamicStyles.controlButton}
            testID={`${testID}-close-button`}
            accessibilityRole="button"
            accessibilityLabel="Close browser"
          >
            <X size={24} className="text-foreground" />
          </Pressable>
        }
        safeAreaTop
      />

      {/* URL Display */}
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          backgroundColor: theme.colors.muted,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Text
          variant="small"
          className="text-muted-foreground"
          numberOfLines={1}
          testID={`${testID}-url-display`}
        >
          {currentUrl}
        </Text>
      </View>

      {/* Navigation Controls */}
      <View style={dynamicStyles.controlBar}>
        {/* Back Button */}
        <Pressable
          onPress={handleGoBack}
          disabled={!canGoBack}
          style={dynamicStyles.controlButton}
          testID={`${testID}-back-button`}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft
            size={24}
            className={canGoBack ? 'text-foreground' : 'text-muted-foreground'}
          />
        </Pressable>

        {/* Forward Button */}
        <Pressable
          onPress={handleGoForward}
          disabled={!canGoForward}
          style={dynamicStyles.controlButton}
          testID={`${testID}-forward-button`}
          accessibilityRole="button"
          accessibilityLabel="Go forward"
        >
          <ChevronRight
            size={24}
            className={
              canGoForward ? 'text-foreground' : 'text-muted-foreground'
            }
          />
        </Pressable>

        {/* Refresh Button */}
        <Pressable
          onPress={handleRefresh}
          style={dynamicStyles.controlButton}
          testID={`${testID}-refresh-button`}
          accessibilityRole="button"
          accessibilityLabel="Refresh page"
        >
          <RefreshCw size={24} className="text-foreground" />
        </Pressable>
      </View>

      {/* WebView */}
      <View style={dynamicStyles.webViewContainer}>
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
          startInLoadingState={true}
          // Handle errors gracefully
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent
            console.error('[WebViewScreen] Error loading URL:', nativeEvent)
          }}
          // iOS specific
          allowsBackForwardNavigationGestures={true}
        />

        {/* Loading Overlay */}
        {loading && (
          <View style={dynamicStyles.loadingOverlay} testID={`${testID}-loading`}>
            <ActivityIndicator
              size="large"
              color={theme.colors.primary}
              testID={`${testID}-loading-indicator`}
            />
            <Text
              variant="small"
              className="text-muted-foreground mt-4"
            >
              Loading...
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}
