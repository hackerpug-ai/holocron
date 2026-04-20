/**
 * SkeletonCard - Animated skeleton loading state for newsfeed cards
 *
 * Provides shaped placeholders with shimmer animation to prevent layout shift
 * during data fetch. Supports both finding and hero card variants.
 *
 * @see .spec/prd/newsfeed-redesign/tasks/sprint-02-newsfeed-design-polish/DESIGN-005-implement-skeleton-loading-states-for-finding-card-and-hero-card.md
 */

import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

const SHIMMER_MIN = 0.3;
const SHIMMER_MAX = 0.6;
const SHIMMER_DURATION = 1000;

export interface SkeletonCardProps {
  testID?: string;
  variant: 'finding' | 'hero';
}

/**
 * Shared skeleton component with shimmer animation
 *
 * Uses React Native Animated API with useNativeDriver for smooth 60fps rendering.
 * Animation loops infinitely and cleans up on unmount.
 */
export function SkeletonCard({ testID = 'skeleton-card', variant }: SkeletonCardProps) {
  const shimmerAnim = useRef(new Animated.Value(SHIMMER_MIN)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: SHIMMER_MAX,
          duration: SHIMMER_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: SHIMMER_MIN,
          duration: SHIMMER_DURATION,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerAnim]);

  const opacity = shimmerAnim.interpolate({
    inputRange: [SHIMMER_MIN, SHIMMER_MAX],
    outputRange: [SHIMMER_MIN, SHIMMER_MAX],
  });

  if (variant === 'hero') {
    return (
      <View
        testID={testID}
        accessibilityLabel="Loading content"
        className="border-l-4 border-l-muted bg-card px-5 py-5"
      >
        <Animated.View style={{ opacity }}>
          {/* TOP SIGNAL Eyebrow placeholder */}
          <View className="mb-2 h-3 w-16 rounded bg-muted" />

          {/* Title placeholder - extrabold, xl, 3 lines */}
          <View className="mb-2 h-6 w-full rounded bg-muted" />
          <View className="mb-2 h-6 w-4/5 rounded bg-muted" />

          {/* Summary placeholder - 4 lines */}
          <View className="mb-3 h-4 w-full rounded bg-muted" />
          <View className="mb-3 h-4 w-full rounded bg-muted" />
          <View className="mb-3 h-4 w-3/4 rounded bg-muted" />

          {/* Bottom meta row placeholder */}
          <View className="mt-4 flex-row justify-between">
            <View className="h-3 w-20 rounded bg-muted" />
            <View className="h-3 w-16 rounded bg-muted" />
          </View>
        </Animated.View>
      </View>
    );
  }

  // Finding card variant
  return (
    <View
      testID={testID}
      accessibilityLabel="Loading content"
      className="border-l-3 border-l-muted border-b border-b-border px-4 pb-4 pt-3"
    >
      <Animated.View style={{ opacity }}>
        {/* Top row: category label + score dots + relative time */}
        <View className="mb-2 flex-row justify-between">
          <View className="h-3 w-16 rounded bg-muted" />
          <View className="h-3 w-24 rounded bg-muted" />
        </View>

        {/* Title */}
        <View className="mb-2 h-5 w-full rounded bg-muted" />
        <View className="mb-2 h-5 w-3/4 rounded bg-muted" />

        {/* Summary */}
        <View className="mb-2 h-4 w-full rounded bg-muted" />
        <View className="mb-2 h-4 w-full rounded bg-muted" />
        <View className="mb-2 h-4 w-2/3 rounded bg-muted" />

        {/* Bottom row: source + engagement velocity */}
        <View className="mt-2 flex-row gap-2">
          <View className="h-3 w-24 rounded bg-muted" />
          <View className="h-3 w-16 rounded bg-muted" />
        </View>
      </Animated.View>
    </View>
  );
}
