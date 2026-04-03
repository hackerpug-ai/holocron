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
import { Image } from 'expo-image'
import { Skeleton } from './skeleton'

export interface OptimizedImageProps {
  /** Image URI or require() source */
  source: string | number | { uri: string }
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

  // Map resizeMode to Image resizeMode
  const imageResizeMode = resizeMode === 'center' ? 'center' : resizeMode

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

      {/* Image with fade-in */}
      <Animated.View
        style={{
          opacity,
          width: '100%',
          height: '100%',
        }}
        pointerEvents="none"
      >
        <Image
          source={typeof source === 'string' ? source : (typeof source === 'number' ? source : source.uri)}
          cachePolicy="memory"
          recyclingKey={typeof source === 'string' ? source : (typeof source === 'number' ? String(source) : source.uri)}
          resizeMode={imageResizeMode}
          onLoad={handleLoad}
          onError={handleError}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: typeof borderRadius === 'number' ? borderRadius : undefined,
            backgroundColor: isLoading ? 'rgba(0,0,0,0.05)' : undefined,
          }}
        />
      </Animated.View>
    </View>
  )
}
