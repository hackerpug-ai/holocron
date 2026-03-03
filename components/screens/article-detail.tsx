import { CategoryBadge, type CategoryType } from "@/components/CategoryBadge";
import { MarkdownView } from "@/components/markdown/MarkdownView";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { X } from "lucide-react-native";
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewProps,
  type ScrollView as ScrollViewType,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useRef, useEffect, useMemo } from "react";
import { useTheme } from "@/hooks/use-theme";
import { useWebView } from "@/hooks/useWebView";
import { sanitizeMarkdown, isValidUrl } from "@/lib/sanitizeMarkdown";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_HEIGHT * 0.25;

/**
 * Mock article data structure for design/preview purposes.
 * In production, this will be replaced with real data from the API.
 */
export interface MockArticle {
  id: string | number;
  title: string;
  category: CategoryType;
  date: string;
  time?: string;
  research_type?: string;
  content: string;
}

interface ArticleDetailProps extends Omit<ViewProps, "children"> {
  /** Article data to display */
  article: MockArticle;
  /** Callback when overlay is dismissed */
  onClose: () => void;
  /** Whether the overlay is visible */
  visible: boolean;
  /** Optional test ID prefix */
  testID?: string;
  /** Initial scroll position to restore (in pixels) */
  initialScrollPosition?: number;
  /** Optional callback when scroll position changes */
  onScrollPositionChange?: (position: number) => void;
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
  testID = "article-detail",
  initialScrollPosition = 0,
  onScrollPositionChange,
  className,
  ...props
}: ArticleDetailProps) {
  const theme = useTheme();
  const { openUrl } = useWebView();
  const translateY = useSharedValue(0);
  const contextY = useSharedValue(0);
  const isActive = useSharedValue(false);
  const scrollViewRef = useRef<ScrollViewType>(null);

  // Sanitize markdown content to prevent XSS attacks
  const sanitizedContent = useMemo(
    () => sanitizeMarkdown(article.content),
    [article.content],
  );

  // Handle link press with URL validation - opens in in-app WebView
  const handleLinkPress = (url: string): boolean => {
    // Validate URL before opening
    if (!isValidUrl(url)) {
      console.warn("[ArticleDetail] Blocked unsafe URL:", url);
      return false; // Block unsafe URLs
    }

    // Open safe URLs in in-app WebView
    openUrl(url);
    return true;
  };

  // Restore scroll position when component becomes visible
  useEffect(() => {
    if (visible && initialScrollPosition > 0) {
      // Small delay to ensure ScrollView is mounted and has content
      const timeoutId = setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: initialScrollPosition,
          animated: false,
        });
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [visible, initialScrollPosition]);

  // Handle scroll position changes
  const handleScroll = (event: {
    nativeEvent: { contentOffset: { y: number } };
  }) => {
    if (onScrollPositionChange) {
      onScrollPositionChange(event.nativeEvent.contentOffset.y);
    }
  };

  // Handle swipe-to-dismiss gesture
  const gesture = Gesture.Pan()
    .onStart(() => {
      contextY.value = translateY.value;
      isActive.value = true;
    })
    .onUpdate((event) => {
      // Only allow downward swipes (positive translationY)
      if (event.translationY > 0) {
        translateY.value = contextY.value + event.translationY;
      }
    })
    .onEnd((event) => {
      isActive.value = false;
      const shouldClose = event.translationY > SWIPE_THRESHOLD;

      if (shouldClose) {
        translateY.value = withTiming(-SCREEN_HEIGHT, {}, () => {
          runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0);
      }
    });

  // Handle close button press
  const handleClose = () => {
    translateY.value = withTiming(-SCREEN_HEIGHT, {}, () => {
      runOnJS(onClose)();
    });
  };

  // Animated style for the overlay
  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [0, -SCREEN_HEIGHT * 0.5],
      [1, 0],
      Extrapolation.CLAMP,
    );

    return {
      transform: [{ translateY: translateY.value }],
      opacity,
    };
  });

  const animatedBackdropStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [0, -SCREEN_HEIGHT * 0.5],
      [0.5, 0],
      Extrapolation.CLAMP,
    );

    return {
      opacity,
    };
  });

  // Don't render if not visible
  if (!visible) return null;

  const dateObj = new Date(article.date);
  const formattedDate = dateObj.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const formattedTime = article.time
    ? new Date(article.time).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : dateObj.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

  // Create dynamic styles using theme tokens
  const dynamicStyles = StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
    },
    container: {
      height: SCREEN_HEIGHT,
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: theme.radius.xl,
      borderTopRightRadius: theme.radius.xl,
      overflow: "hidden",
    },
    header: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    dragIndicator: {
      width: 36,
      height: 4,
      backgroundColor: theme.colors.indicator,
      borderRadius: theme.radius.sm,
      alignSelf: "center",
      marginBottom: theme.spacing.lg,
    },
    closeButton: {
      position: "absolute",
      top: theme.spacing.md,
      right: theme.spacing.md,
    },
    closeButtonInner: {
      padding: theme.spacing.md,
      borderRadius: 20,
      backgroundColor: theme.colors.closeBtn,
    },
    scrollContent: {
      flex: 1,
    },
    scrollContentContainer: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.xl,
      paddingBottom: theme.spacing["2xl"],
    },
  });

  return (
    <View
      className={cn("absolute bottom-0 left-0 right-0 z-50", className)}
      testID={testID}
      {...props}
    >
      {/* Backdrop */}
      <Animated.View style={[dynamicStyles.backdrop, animatedBackdropStyle]}>
        <Pressable
          onPress={handleClose}
          testID={`${testID}-backdrop`}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Overlay Content */}
      <GestureDetector gesture={gesture}>
        <Animated.View style={[dynamicStyles.container, animatedStyle]}>
          {/* Header with drag indicator and close button */}
          <View style={dynamicStyles.header}>
            {/* Drag Indicator */}
            <View
              style={dynamicStyles.dragIndicator}
              testID={`${testID}-drag-indicator`}
            />

            {/* Close Button */}
            <Pressable
              onPress={handleClose}
              style={dynamicStyles.closeButton}
              testID={`${testID}-close`}
            >
              <View style={dynamicStyles.closeButtonInner}>
                <X size={20} className="text-foreground" strokeWidth={2.5} />
              </View>
            </Pressable>
          </View>

          {/* Scrollable Content */}
          <ScrollView
            ref={scrollViewRef}
            style={dynamicStyles.scrollContent}
            contentContainerStyle={dynamicStyles.scrollContentContainer}
            testID={`${testID}-scroll-view`}
            showsVerticalScrollIndicator={true}
            onScroll={handleScroll}
            scrollEventThrottle={100}
          >
            {/* Title */}
            <Text className="text-foreground mb-4 text-2xl font-bold leading-normal">
              {article.title}
            </Text>

            {/* Metadata Row */}
            <View className="mb-6 flex-row flex-wrap items-center gap-3">
              <CategoryBadge category={article.category} />
              <View className="flex-row items-center gap-1">
                <Text className="text-muted-foreground text-sm">
                  {formattedDate}
                </Text>
                {formattedTime && (
                  <>
                    <Text className="text-muted-foreground text-sm"> at </Text>
                    <Text className="text-muted-foreground text-sm">
                      {formattedTime}
                    </Text>
                  </>
                )}
              </View>
              {article.research_type && (
                <View className="rounded-md bg-muted px-2 py-1">
                  <Text className="text-foreground text-xs">
                    {article.research_type}
                  </Text>
                </View>
              )}
            </View>

            {/* Content - Markdown (sanitized) */}
            <MarkdownView
              content={sanitizedContent}
              onLinkPress={handleLinkPress}
              contentOnly={true}
              testID={`${testID}-markdown`}
            />
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
