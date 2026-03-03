import { CategoryBadge, type CategoryType } from '@/components/CategoryBadge'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { ChevronDown, X } from 'lucide-react-native'
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native'
import { GestureDetector, Gesture } from 'react-native-gesture-handler'
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

            {/* Content */}
            <View className="gap-4">
              <Text className="text-foreground text-base leading-7">
                {article.content}
              </Text>
            </View>
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  )
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
