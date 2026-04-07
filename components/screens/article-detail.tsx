import { CategoryBadge, type CategoryType } from "@/components/CategoryBadge";
import { MarkdownView } from "@/components/markdown/MarkdownView";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { X } from "@/components/ui/icons";
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
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import React, { useCallback, useRef, useEffect, useMemo, useState } from "react";
import { useTheme } from "@/hooks/use-theme";
import { useWebView } from "@/hooks/useWebView";
import { sanitizeMarkdown, isValidUrl } from "@/lib/sanitizeMarkdown";
import { useNarrationState } from "@/components/narration/hooks/useNarrationState";
import { useAudioPlayback } from "@/components/narration/hooks/useAudioPlayback";
import {
  NarrationControlBar,
  NARRATION_BAR_HEIGHT,
} from "@/components/narration/NarrationControlBar";
import { NarrationToggleButton } from "@/components/narration/NarrationToggleButton";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { parseMarkdown } from "@/components/markdown/parsers";
import { computeNarrationMap, extractTextFromNode, findNearestOffset } from "@/lib/mdast-utils";
import { extractParagraphs } from "@/lib/extractParagraphs";
import {
  saveNarrationProgress,
  loadNarrationProgress,
  clearNarrationProgress,
} from "@/components/narration/hooks/useNarrationProgress";
import type { Root } from "mdast";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_HEIGHT * 0.25;

/**
 * Animated wrapper for narration blocks that pulses when audio is loading.
 */
function NarrationBlockWrapper({
  isActive,
  isLoading,
  primaryColor,
  children,
  onPress,
  onLongPress,
  onLayout,
  testID,
}: {
  isActive: boolean;
  isLoading: boolean;
  primaryColor: string;
  children: React.ReactNode;
  onPress: () => void;
  onLongPress: () => void;
  onLayout: (e: { nativeEvent: { layout: { y: number } } }) => void;
  testID: string;
}) {
  const pulseOpacity = useSharedValue(0);

  useEffect(() => {
    if (isLoading && isActive) {
      pulseOpacity.value = withRepeat(
        withTiming(0.15, { duration: 600 }),
        -1,
        true,
      );
    } else {
      pulseOpacity.value = withTiming(isActive ? 0.08 : 0, { duration: 200 });
    }
  }, [isLoading, isActive, pulseOpacity]);

  const animatedBgStyle = useAnimatedStyle(() => ({
    backgroundColor: `${primaryColor}${Math.round(pulseOpacity.value * 255).toString(16).padStart(2, "0")}`,
    borderLeftWidth: isActive ? 2 : 0,
    borderLeftColor: isActive ? primaryColor : "transparent",
    paddingLeft: isActive ? 8 : 0,
  }));

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      onLayout={onLayout}
    >
      <Animated.View style={animatedBgStyle}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/**
 * Mock article data structure for design/preview purposes.
 * In production, this will be replaced with real data from the API.
 */
export interface MockArticle {
  id: string | number;
  /** Convex document ID for narration support */
  documentId?: string;
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
  const { colors, typography } = theme;
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

  const insets = useSafeAreaInsets();
  const paragraphOffsets = useRef<Map<number, number>>(new Map());
  const [copiedToast, setCopiedToast] = useState(false);
  const [skipToast, setSkipToast] = useState<number | null>(null);

  // Parse MDAST for narration index mapping and copy support
  const parsedAst = useMemo<Root | null>(
    () => sanitizedContent ? parseMarkdown(sanitizedContent) : null,
    [sanitizedContent],
  );

  // Extract paragraphs using the same logic as the backend (convex/audio/actions.ts)
  const backendParagraphs = useMemo(
    () => sanitizedContent ? extractParagraphs(sanitizedContent) : [],
    [sanitizedContent],
  );

  // Compute narration segment map (root child index → backend paragraph index)
  const narrationMap = useMemo(
    () => parsedAst ? computeNarrationMap(parsedAst, backendParagraphs) : new Map<number, number>(),
    [parsedAst, backendParagraphs],
  );

  // Paragraph count must match the backend's segment count
  const paragraphCount = backendParagraphs.length;

  const narration = useNarrationState(paragraphCount);
  const { isNarrationMode } = narration;

  // Subscribe to audio segments only when in narration mode
  const convexDocId = article.documentId as Id<"documents"> | undefined;
  const segments =
    useQuery(
      api.audio.queries.getSegments,
      isNarrationMode && convexDocId ? { documentId: convexDocId } : "skip",
    ) ?? [];

  const { isLoading: isAudioLoading } = useAudioPlayback(segments, narration, {
    title: article.title,
  });

  useEffect(() => {
    if (!isNarrationMode || segments.length === 0) return;
    const completedCount = segments.filter((s: { status: string }) => s.status === 'completed').length;
    const totalDuration = segments.reduce((sum: number, s: { durationMs?: number | null }) => sum + (s.durationMs ?? 0), 0);
    narration.onParagraphReady(completedCount, totalDuration / 1000);
    if (completedCount === segments.length && segments.length > 0) {
      narration.onAllReady();
    }
  }, [segments, isNarrationMode]);

  useEffect(() => { paragraphOffsets.current.clear(); }, [sanitizedContent]);

  // ─── Narration progress persistence ──────────────────────────────────────

  // Save progress when paragraph changes during playback
  useEffect(() => {
    if (!convexDocId || !isNarrationMode) return;
    const { activeParagraphIndex, playbackSpeed, status } = narration.state;
    if (activeParagraphIndex < 0) return;
    if (status === "playing" || status === "paused") {
      saveNarrationProgress(convexDocId, {
        activeParagraphIndex,
        playbackSpeed,
        lastUpdated: Date.now(),
      });
    }
  }, [convexDocId, isNarrationMode, narration.state.activeParagraphIndex, narration.state.status]);

  // Clear progress when narration finishes (paused on last segment)
  useEffect(() => {
    if (!convexDocId || !isNarrationMode) return;
    const { activeParagraphIndex, totalParagraphs, status } = narration.state;
    if (status === "paused" && activeParagraphIndex >= totalParagraphs - 1 && totalParagraphs > 0) {
      clearNarrationProgress(convexDocId);
    }
  }, [convexDocId, isNarrationMode, narration.state.status, narration.state.activeParagraphIndex, narration.state.totalParagraphs]);

  const generateAction = useAction(api.audio.actions.generateForDocument);
  const regenerateAction = useAction(api.audio.actions.regenerateForDocument);

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

  // Auto-scroll to active paragraph during narration
  useEffect(() => {
    if (!isNarrationMode || narration.state.activeParagraphIndex < 0) return;
    const offset = paragraphOffsets.current.get(
      narration.state.activeParagraphIndex,
    ) ?? findNearestOffset(paragraphOffsets.current, narration.state.activeParagraphIndex);
    if (offset !== undefined) {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, offset - 120),
        animated: true,
      });
    }
  }, [isNarrationMode, narration.state.activeParagraphIndex]);

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

  // Handle narration mode toggle
  const handleToggleNarration = async () => {
    if (isNarrationMode) {
      paragraphOffsets.current.clear();
      narration.exitNarrationMode();
      return;
    }
    narration.enterNarrationMode();
    if (convexDocId) {
      try {
        const result = await generateAction({ documentId: convexDocId });
        if (result.segmentCount > 0) {
          narration.onAllReady();
        }
        // Restore saved progress if available
        const saved = await loadNarrationProgress(convexDocId);
        if (saved && saved.activeParagraphIndex > 0 && saved.activeParagraphIndex < paragraphCount) {
          narration.skipToParagraph(saved.activeParagraphIndex);
          if (saved.playbackSpeed && saved.playbackSpeed !== 1) {
            narration.setSpeed(saved.playbackSpeed);
          }
        }
      } catch (err) {
        console.error('[Narration] Generation failed:', err);
        narration.exitNarrationMode();
      }
    }
  };

  // Handle close button press
  const handleClose = () => {
    if (isNarrationMode) narration.exitNarrationMode();
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

  // Copy section text to clipboard
  const handleCopySection = useCallback(async (rootChildIndex: number) => {
    if (!parsedAst) return;
    const node = parsedAst.children[rootChildIndex];
    if (!node) return;
    const text = extractTextFromNode(node);
    if (!text.trim()) return;
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 1500);
  }, [parsedAst]);

  // Wrap each root-level MDAST child with narration highlight and/or copy support
  const wrapRootChild = useMemo(() => {
    return (child: React.ReactNode, rootIndex: number, _nodeType: string) => {
      const narrationIndex = narrationMap.get(rootIndex);

      // In narration mode: wrap with animated highlight + tap-to-skip + long-press-to-copy
      if (isNarrationMode && narrationIndex !== undefined) {
        const isBlockActive = narration.state.activeParagraphIndex === narrationIndex;
        return (
          <NarrationBlockWrapper
            key={`narration-${narrationIndex}`}
            testID={`narration-block-${narrationIndex}`}
            isActive={isBlockActive}
            isLoading={isAudioLoading}
            primaryColor={colors.primary}
            onPress={() => {
              narration.skipToParagraph(narrationIndex);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setSkipToast(narrationIndex);
              setTimeout(() => setSkipToast(null), 1500);
            }}
            onLongPress={() => handleCopySection(rootIndex)}
            onLayout={(e) => {
              paragraphOffsets.current.set(narrationIndex, e.nativeEvent.layout.y);
            }}
          >
            {child}
          </NarrationBlockWrapper>
        );
      }

      // Normal mode: long-press to copy
      return (
        <Pressable
          testID={`doc-block-${rootIndex}`}
          onLongPress={() => handleCopySection(rootIndex)}
        >
          {child}
        </Pressable>
      );
    };
  }, [isNarrationMode, narrationMap, narration.state.activeParagraphIndex, colors.primary, isAudioLoading, handleCopySection]);

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
      backgroundColor: colors.overlay,
      opacity: 0.5,
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

            {/* Narration Toggle - positioned on the left side of the header */}
            {article.documentId && (
              <View
                style={{
                  position: "absolute",
                  top: theme.spacing.md,
                  left: theme.spacing.md,
                }}
              >
                <NarrationToggleButton
                  isActive={isNarrationMode}
                  onPress={handleToggleNarration}
                  testID={`${testID}-narration-toggle`}
                />
              </View>
            )}

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
            contentContainerStyle={{
              ...dynamicStyles.scrollContentContainer,
              paddingBottom: isNarrationMode
                ? NARRATION_BAR_HEIGHT + insets.bottom + 24
                : theme.spacing["2xl"],
            }}
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
              wrapRootChild={wrapRootChild}
            />
          </ScrollView>

          <NarrationControlBar
            narration={narration}
            isVisible={isNarrationMode}
            onRegenerate={() => { if (convexDocId) regenerateAction({ documentId: convexDocId }) }}
          />

          {copiedToast && (
            <View
              style={{
                position: "absolute",
                bottom: isNarrationMode ? NARRATION_BAR_HEIGHT + insets.bottom + 16 : insets.bottom + 16,
                alignSelf: "center",
                backgroundColor: colors.foreground,
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 20,
              }}
              pointerEvents="none"
            >
              <Text style={{ color: colors.background, fontSize: typography.label.fontSize, fontWeight: typography.label.fontWeight }}>
                Copied to clipboard
              </Text>
            </View>
          )}

          {skipToast !== null && (
            <View
              style={{
                position: "absolute",
                bottom: isNarrationMode ? NARRATION_BAR_HEIGHT + insets.bottom + 16 : insets.bottom + 16,
                alignSelf: "center",
                backgroundColor: colors.foreground,
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 20,
              }}
              pointerEvents="none"
            >
              <Text style={{ color: colors.background, fontSize: typography.label.fontSize, fontWeight: typography.label.fontWeight }}>
                {`Loading section ${skipToast + 1}...`}
              </Text>
            </View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
