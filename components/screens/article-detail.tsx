import { CategoryBadge, type CategoryType } from '@/components/CategoryBadge'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { ChevronDown, X } from 'lucide-react-native'
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
  type ViewProps,
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Markdown from 'react-native-markdown-display'
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')
const SWIPE_THRESHOLD = -SCREEN_HEIGHT * 0.25

/**
 * Helper function to get markdown colors based on current color scheme
 * Uses HSL values from global.css theme
 */
const getMarkdownColors = (isDark: boolean) => {
  if (isDark) {
    return {
      // Dark mode colors from global.css
      body: '#FAFAFA', // foreground: 210 40% 98% -> #FAFAFA
      heading1: '#FAFAFA',
      heading2: '#FAFAFA',
      heading3: '#FAFAFA',
      heading4: '#FAFAFA',
      heading5: '#FAFAFA',
      heading6: '#FAFAFA',
      link: '#7DD3FC', // Light blue accent for links in dark mode
      blockquote: '#A1A1AA', // muted-foreground
      code: '#F4F4F5', // Light background for inline code
      code_bg: '#27272A', // muted background
      fence_bg: '#1E1E1E', // Darker background for code blocks
      bullet: '#FAFAFA',
      hr: '#3F3F46', // border
      table_border: '#3F3F46',
      table_header: '#FAFAFA',
      table_body: '#D4D4D8',
    }
  }
  return {
    // Light mode colors from global.css
    body: '#0A0A0A', // foreground: 222.2 84% 4.9% -> #0A0A0A
    heading1: '#0A0A0A',
    heading2: '#0A0A0A',
    heading3: '#0A0A0A',
    heading4: '#0A0A0A',
    heading5: '#0A0A0A',
    heading6: '#0A0A0A',
    link: '#1D4ED8', // Blue for links in light mode
    blockquote: '#71717A', // muted-foreground: 215.4 16.3% 46.9%
    code: '#0A0A0A', // Dark text for inline code
    code_bg: '#F5F5F5', // Light background for inline code
    fence_bg: '#27272A', // Dark background for code blocks
    bullet: '#0A0A0A',
    hr: '#E4E4E7', // border: 214.3 31.8% 91.4%
    table_border: '#E4E4E7',
    table_header: '#0A0A0A',
    table_body: '#52525B',
  }
}

/**
 * Mock article data structure for design/preview purposes.
 * In production, this will be replaced with real data from the API.
 */
export interface MockArticle {
  id: string | number
  title: string
  category: CategoryType
  date: string
  time?: string
  research_type?: string
  content: string
}

interface ArticleDetailProps extends Omit<ViewProps, 'children'> {
  /** Article data to display */
  article: MockArticle
  /** Callback when overlay is dismissed */
  onClose: () => void
  /** Whether the overlay is visible */
  visible: boolean
  /** Optional test ID prefix */
  testID?: string
}

/**
 * ArticleDetail displays full article content in a full-screen overlay.
 * Features:
 * - Swipe-to-dismiss gesture
 * - Close button in header
 * - Category badge and date/time metadata
 * - Scrollable content area
 *
 * @example
 * ```tsx
 * <ArticleDetail
 *   article={mockArticle}
 *   onClose={() => setVisible(false)}
 *   visible={isVisible}
 * />
 * ```
 */
export function ArticleDetail({
  article,
  onClose,
  visible,
  testID = 'article-detail',
  className,
  ...props
}: ArticleDetailProps) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const translateY = useSharedValue(0)
  const contextY = useSharedValue(0)
  const isActive = useSharedValue(false)

  // Handle swipe-to-dismiss gesture
  const gesture = Gesture.Pan()
    .onStart(() => {
      contextY.value = translateY.value
      isActive.value = true
    })
    .onUpdate((event) => {
      // Only allow downward swipes (negative translation)
      if (event.translationY < 0) {
        translateY.value = contextY.value + event.translationY
      }
    })
    .onEnd((event) => {
      isActive.value = false
      const shouldClose = event.translationY < SWIPE_THRESHOLD

      if (shouldClose) {
        translateY.value = withTiming(-SCREEN_HEIGHT, {}, () => {
          runOnJS(onClose)()
        })
      } else {
        translateY.value = withSpring(0)
      }
    })

  // Handle close button press
  const handleClose = () => {
    translateY.value = withTiming(-SCREEN_HEIGHT, {}, () => {
      runOnJS(onClose)()
    })
  }

  // Animated style for the overlay
  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [0, -SCREEN_HEIGHT * 0.5],
      [1, 0],
      Extrapolation.CLAMP
    )

    return {
      transform: [{ translateY: translateY.value }],
      opacity,
    }
  })

  const animatedBackdropStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [0, -SCREEN_HEIGHT * 0.5],
      [0.5, 0],
      Extrapolation.CLAMP
    )

    return {
      opacity,
    }
  })

  // Don't render if not visible
  if (!visible) return null

  const dateObj = new Date(article.date)
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const formattedTime = article.time
    ? new Date(article.time).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : dateObj.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })

  return (
    <View
      className={cn('absolute bottom-0 left-0 right-0 z-50', className)}
      testID={testID}
      {...props}
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, animatedBackdropStyle]}>
        <Pressable
          onPress={handleClose}
          testID={`${testID}-backdrop`}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Overlay Content */}
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.container, animatedStyle]}>
          {/* Header with drag indicator and close button */}
          <View style={styles.header}>
            {/* Drag Indicator */}
            <View
              style={styles.dragIndicator}
              testID={`${testID}-drag-indicator`}
            />

            {/* Close Button */}
            <Pressable
              onPress={handleClose}
              style={styles.closeButton}
              testID={`${testID}-close`}
            >
              <View style={styles.closeButtonInner}>
                <X size={20} className="text-foreground" strokeWidth={2.5} />
              </View>
            </Pressable>
          </View>

          {/* Scrollable Content */}
          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.scrollContentContainer}
            testID={`${testID}-scroll-view`}
            showsVerticalScrollIndicator={true}
          >
            {/* Title */}
            <Text className="text-foreground mb-4 text-2xl font-bold leading-tight">
              {article.title}
            </Text>

            {/* Metadata Row */}
            <View className="mb-6 flex-row flex-wrap items-center gap-3">
              <CategoryBadge category={article.category} />
              <View className="flex-row items-center gap-1">
                <Text className="text-muted-foreground text-sm">{formattedDate}</Text>
                {formattedTime && (
                  <>
                    <Text className="text-muted-foreground text-sm"> at </Text>
                    <Text className="text-muted-foreground text-sm">{formattedTime}</Text>
                  </>
                )}
              </View>
              {article.research_type && (
                <View className="rounded-md bg-muted px-2 py-1">
                  <Text className="text-foreground text-xs">{article.research_type}</Text>
                </View>
              )}
            </View>

            {/* Content - Markdown */}
            <Markdown style={getMarkdownStyles(isDark)}>{article.content}</Markdown>
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

/**
 * Generate markdown styles based on current theme
 */
const getMarkdownStyles = (isDark: boolean) => {
  const colors = getMarkdownColors(isDark)
  return StyleSheet.create({
    // Body text
    body: {
      color: colors.body,
      fontSize: 16,
      lineHeight: 28,
      marginBottom: 16,
    },
    // Headings
    heading1: {
      color: colors.heading1,
      fontSize: 28,
      fontWeight: '700',
      marginTop: 24,
      marginBottom: 12,
      lineHeight: 36,
    },
    heading2: {
      color: colors.heading2,
      fontSize: 24,
      fontWeight: '600',
      marginTop: 20,
      marginBottom: 10,
      lineHeight: 32,
    },
    heading3: {
      color: colors.heading3,
      fontSize: 20,
      fontWeight: '600',
      marginTop: 16,
      marginBottom: 8,
      lineHeight: 28,
    },
    heading4: {
      color: colors.heading4,
      fontSize: 18,
      fontWeight: '600',
      marginTop: 14,
      marginBottom: 8,
      lineHeight: 26,
    },
    heading5: {
      color: colors.heading5,
      fontSize: 16,
      fontWeight: '600',
      marginTop: 12,
      marginBottom: 6,
      lineHeight: 24,
    },
    heading6: {
      color: colors.heading6,
      fontSize: 14,
      fontWeight: '600',
      marginTop: 10,
      marginBottom: 6,
      lineHeight: 22,
    },
    // Paragraphs
    paragraph: {
      marginBottom: 16,
      lineHeight: 28,
    },
    // Links
    link: {
      color: colors.link,
      textDecorationLine: 'underline',
    },
    // Lists
    list_item: {
      marginBottom: 8,
      flexDirection: 'row',
    },
    bullet_list: {
      marginBottom: 16,
    },
    bullet_list_icon: {
      color: colors.bullet,
      marginRight: 8,
      fontSize: 16,
    },
    ordered_list_icon: {
      color: colors.bullet,
      marginRight: 8,
      fontSize: 16,
      fontWeight: '600',
    },
    // Code blocks
    code_inline: {
      backgroundColor: colors.code_bg,
      color: colors.code,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 4,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 14,
    },
    code_block: {
      backgroundColor: colors.fence_bg,
      padding: 16,
      borderRadius: 8,
      marginBottom: 16,
      overflow: 'hidden',
      borderLeftWidth: 4,
      borderLeftColor: colors.link,
    },
    fence: {
      backgroundColor: colors.fence_bg,
      padding: 16,
      borderRadius: 8,
      marginBottom: 16,
      overflow: 'hidden',
      borderLeftWidth: 4,
      borderLeftColor: colors.link,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 14,
      lineHeight: 22,
    },
    // Blockquotes
    blockquote: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
      borderLeftWidth: 4,
      borderLeftColor: colors.blockquote,
      paddingLeft: 16,
      paddingVertical: 12,
      paddingRight: 12,
      marginBottom: 16,
      fontStyle: 'italic',
    },
    blockquote_text: {
      color: colors.blockquote,
      fontSize: 16,
      lineHeight: 26,
    },
    // Horizontal rules
    hr: {
      backgroundColor: colors.hr,
      height: 1,
      marginVertical: 20,
    },
    // Tables
    table: {
      borderWidth: 1,
      borderColor: colors.table_border,
      borderRadius: 8,
      marginBottom: 16,
      overflow: 'hidden',
    },
    thead: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
    },
    th: {
      color: colors.table_header,
      fontWeight: '600',
      padding: 12,
      borderWidth: 1,
      borderColor: colors.table_border,
    },
    td: {
      color: colors.table_body,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.table_border,
    },
    // Strong/Bold
    strong: {
      fontWeight: '700',
    },
    // Emphasis/Italic
    em: {
      fontStyle: 'italic',
    },
    // Softbreaks
    softbreak: {
      width: '100%',
      height: 8,
    },
    // Hardbreaks
    hardbreak: {
      width: '100%',
      height: 16,
    },
  })
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    height: SCREEN_HEIGHT,
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  dragIndicator: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  closeButtonInner: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
})
