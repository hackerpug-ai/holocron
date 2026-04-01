/**
 * OptimizedImage - FastImage wrapper with skeleton loading and fade-in
 *
 * Features:
 * - Uses react-native-fast-image for optimized caching and loading
 * - Shows skeleton placeholder while image loads
 * - Smooth fade-in transition when image loads
 * - Proper error handling with fallback UI
 * - Memory-efficient with automatic cleanup
 */

import React, { useState } from 'react'
import { View, StyleSheet, Animated, ViewStyle } from 'react-native'
import FastImage, { Source } from 'react-native-fast-image'
import { Skeleton } from './skeleton'

export interface OptimizedImageProps {
  /** Image URI or require() source */
  source: Source
  /** Image resize mode */
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'center'
  /** Optional style for the container */
  style?: ViewStyle
  /** Optional width (defaults to 100%) */
  width?: number | string
  /** Optional height (required if not using aspectRatio) */
  height?: number | string
  /** Aspect ratio (width/height) - alternative to fixed height */
  aspectRatio?: number
  /** Border radius */
  borderRadius?: number
  /** Optional test ID */
  testID?: string
  /** Fallback component to show on error */
  fallback?: React.ReactNode
  /** Priority for loading (default: normal) */
  priority?: 'low' | 'normal' | 'high'
}

/**
 * OptimizedImage component with skeleton loading and fade-in
 *
 * @example
 * ```tsx
 * <OptimizedImage
 *   source={{ uri: thumbnailUrl }}
 *   aspectRatio={16 / 9}
 *   borderRadius={12}
 *   testID="card-thumbnail"
 * />
 * ```
 */
export function OptimizedImage({
  source,
  resizeMode = 'cover',
  style,
  width = '100%',
  height,
  aspectRatio,
  borderRadius = 0,
  testID = 'optimized-image',
  fallback,
  priority = 'normal',
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [opacity] = useState(new Animated.Value(0))

  const handleLoad = () => {
    setIsLoading(false)
    // Fade in animation
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start()
  }

  const handleError = () => {
    setIsLoading(false)
    setHasError(true)
  }

  // Map priority to FastImage priority
  const fastPriority =
    priority === 'high'
      ? FastImage.priority.high
      : priority === 'low'
        ? FastImage.priority.low
        : FastImage.priority.normal

  // Map resizeMode to FastImage resizeMode
  const fastResizeMode = FastImage.resizeMode[resizeMode]

  const containerStyle: ViewStyle = {
    width: typeof width === 'number' ? width : undefined,
    height: aspectRatio ? undefined : (typeof height === 'number' ? height : undefined),
    aspectRatio: aspectRatio ?? undefined,
    borderRadius: typeof borderRadius === 'number' ? borderRadius : undefined,
    overflow: 'hidden' as const,
    backgroundColor: 'transparent',
  }

  if (hasError && fallback) {
    return (
      <View style={[containerStyle, style]} testID={testID}>
        {fallback}
      </View>
    )
  }

  return (
    <View style={[containerStyle, style]} testID={testID}>
      {/* Skeleton placeholder while loading */}
      {isLoading && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Skeleton
            style={{
              width: '100%',
              height: '100%',
              borderRadius: typeof borderRadius === 'number' ? borderRadius : undefined,
            }}
          />
        </View>
      )}

      {/* FastImage with fade-in */}
      <Animated.View
        style={{
          opacity,
          width: '100%',
          height: '100%',
        }}
        pointerEvents="none"
      >
        <FastImage
          source={{
            ...source,
            priority: fastPriority,
            cache: FastImage.cacheControl.web,
          }}
          resizeMode={fastResizeMode}
          onLoad={handleLoad}
          onError={handleError}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: typeof borderRadius === 'number' ? borderRadius : undefined,
          }}
        />
      </Animated.View>
    </View>
  )
}
