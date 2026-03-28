import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useEffect } from 'react'
import { Text } from '@/components/ui/text'
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  RefreshCw,
  X,
} from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import WebView, { type WebViewNavigation } from 'react-native-webview'

const SCREEN_HEIGHT = Dimensions.get('window').height
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.88

const TIMING_IN = { duration: 300, easing: Easing.out(Easing.cubic) }
const TIMING_OUT = { duration: 250, easing: Easing.in(Easing.cubic) }
const DISMISS_THRESHOLD = 120

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

export interface WebViewSheetProps {
  visible: boolean
  url: string
  onClose: () => void
  testID?: string
}

/**
 * Bottom sheet that displays a WebView for in-app link previewing.
 * Slides up from bottom, swipe down to dismiss.
 */
export function WebViewSheet({
  visible,
  url,
  onClose,
  testID = 'webview-sheet',
}: WebViewSheetProps) {
  const insets = useSafeAreaInsets()
  const { colors, spacing, radius } = useTheme()
  const webViewRef = useRef<WebView>(null)

  const translateY = useSharedValue(SHEET_HEIGHT)
  const backdropOpacity = useSharedValue(0)

  // WebView nav state
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [loading, setLoading] = useState(true)
  const [currentUrl, setCurrentUrl] = useState(url)

  const { host, isSecure } = getDisplayUrl(currentUrl)

  // Reset state when URL changes
  useEffect(() => {
    setCurrentUrl(url)
    setCanGoBack(false)
    setCanGoForward(false)
    setLoading(true)
  }, [url])

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, TIMING_IN)
      backdropOpacity.value = withTiming(1, TIMING_IN)
    } else {
      translateY.value = withTiming(SHEET_HEIGHT, TIMING_OUT)
      backdropOpacity.value = withTiming(0, TIMING_OUT)
    }
  }, [visible])

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(translateY.value, 0) }],
  }))

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  const dismiss = () => {
    translateY.value = withTiming(SHEET_HEIGHT, TIMING_OUT)
    backdropOpacity.value = withTiming(0, TIMING_OUT)
    // Delay onClose so animation finishes
    setTimeout(onClose, 250)
  }

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD) {
        translateY.value = withTiming(SHEET_HEIGHT, TIMING_OUT)
        backdropOpacity.value = withTiming(0, TIMING_OUT)
        runOnJS(onClose)()
      } else {
        translateY.value = withTiming(0, TIMING_IN)
      }
    })

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack)
    setCanGoForward(navState.canGoForward)
    setCurrentUrl(navState.url)
  }

  if (!visible) return null

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={dismiss}
      testID={testID}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* Backdrop */}
        <Pressable
          onPress={dismiss}
          testID={`${testID}-backdrop`}
          style={{ flex: 1 }}
        >
          <Animated.View
            style={[
              backdropStyle,
              { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
            ]}
          />
        </Pressable>

        {/* Sheet */}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              sheetStyle,
              styles.sheet,
              {
                height: SHEET_HEIGHT,
                paddingBottom: insets.bottom,
                backgroundColor: colors.background,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
              },
            ]}
          >
            {/* Drag handle */}
            <View style={styles.handleRow}>
              <View
                style={[
                  styles.handle,
                  { backgroundColor: colors.mutedForeground + '4D' },
                ]}
              />
            </View>

            {/* Toolbar */}
            <View
              style={[
                styles.toolbar,
                {
                  borderBottomColor: colors.border,
                  paddingHorizontal: spacing.sm,
                },
              ]}
            >
              {/* Close */}
              <Pressable
                onPress={dismiss}
                style={styles.iconButton}
                testID={`${testID}-close`}
                accessibilityRole="button"
                accessibilityLabel="Close browser"
              >
                <X size={20} className="text-foreground" />
              </Pressable>

              {/* URL bar */}
              <View
                style={[
                  styles.urlBar,
                  {
                    backgroundColor: colors.muted,
                    borderRadius: radius.md,
                  },
                ]}
              >
                {isSecure && (
                  <Lock
                    size={12}
                    className="text-muted-foreground"
                    style={{ marginRight: 4 }}
                  />
                )}
                <Text
                  variant="small"
                  className="text-foreground"
                  numberOfLines={1}
                  style={{ flex: 1 }}
                  testID={`${testID}-url`}
                >
                  {host}
                </Text>
              </View>

              {/* Nav controls */}
              <View style={styles.navControls}>
                {canGoBack && (
                  <Pressable
                    onPress={() => webViewRef.current?.goBack()}
                    style={styles.iconButton}
                    testID={`${testID}-back`}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                  >
                    <ChevronLeft size={20} className="text-foreground" />
                  </Pressable>
                )}
                {canGoForward && (
                  <Pressable
                    onPress={() => webViewRef.current?.goForward()}
                    style={styles.iconButton}
                    testID={`${testID}-forward`}
                    accessibilityRole="button"
                    accessibilityLabel="Go forward"
                  >
                    <ChevronRight size={20} className="text-foreground" />
                  </Pressable>
                )}
                <Pressable
                  onPress={() => webViewRef.current?.reload()}
                  style={styles.iconButton}
                  disabled={loading}
                  testID={`${testID}-refresh`}
                  accessibilityRole="button"
                  accessibilityLabel={loading ? 'Loading' : 'Refresh'}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
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
                onShouldStartLoadWithRequest={(request) => {
                  const { url: reqUrl } = request
                  if (
                    reqUrl.startsWith('twitter://') ||
                    reqUrl.startsWith('x://') ||
                    reqUrl.startsWith('intent://')
                  ) {
                    return false
                  }
                  return true
                }}
                onLoadStart={() => setLoading(true)}
                onLoadEnd={() => setLoading(false)}
                style={{ backgroundColor: colors.background }}
                testID={`${testID}-webview`}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={false}
                allowsBackForwardNavigationGestures={true}
                onError={(syntheticEvent) => {
                  console.error(
                    '[WebViewSheet] Error loading URL:',
                    syntheticEvent.nativeEvent
                  )
                }}
              />
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
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
  navControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  webViewContainer: {
    flex: 1,
  },
})
