import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { Loader2 } from '@/components/ui/icons'
import type { ViewProps } from 'react-native'
import { View, Animated, Easing, Pressable } from 'react-native'
import { useEffect, useRef } from 'react'

export type ResearchType = 'quick' | 'deep'

export interface DeepResearchLoadingCardProps extends Omit<ViewProps, 'children'> {
  /** The search query/topic being researched */
  query: string
  /** Research type: 'quick' for /research, 'deep' for /deep-research */
  researchType?: ResearchType
  /** Optional loading message */
  message?: string
  /** Optional class name for custom styling */
  className?: string
  /** Session ID for this research */
  sessionId?: string
  /** Whether this is the final completed state */
  isComplete?: boolean
  /** Confidence level when complete */
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW'
  /** Callback when card is pressed (to navigate to detail) */
  onPress?: () => void
}

/**
 * DeepResearchLoadingCard displays a simple loading state
 * while deep research is in progress.
 *
 * Simplified single-pass design:
 * - Simple spinner with "Researching..." message
 * - Topic shown below
 * - Tap to view when complete
 */
// Type-specific color configurations
const typeColors = {
  quick: {
    border: 'border-violet-500/40',
    text: 'text-violet-500',
    badge: 'bg-violet-500/20',
    label: 'QUICK',
    defaultMessage: 'Researching...',
  },
  deep: {
    border: 'border-cyan-500/40',
    text: 'text-cyan-500',
    badge: 'bg-cyan-500/20',
    label: 'DEEP',
    defaultMessage: 'Deep researching...',
  },
} as const

export function DeepResearchLoadingCard({
  query,
  researchType = 'deep',
  message,
  className,
  isComplete = false,
  confidence,
  onPress,
  ...props
}: DeepResearchLoadingCardProps) {
  const colors = typeColors[researchType]
  const displayMessage = message ?? colors.defaultMessage
  // Animated values
  const pulseAnim = useRef(new Animated.Value(0)).current
  const rotateAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // Pulse animation for border
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    ).start()

    // Rotation for spinner (only when not complete)
    if (!isComplete) {
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start()
    }
  }, [pulseAnim, rotateAnim, isComplete])

  const borderOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  })

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  // Confidence badge colors
  const getConfidenceStyle = () => {
    if (!confidence) return { bg: 'bg-success/20', text: 'text-success' }
    switch (confidence) {
      case 'HIGH':
        return { bg: 'bg-success/20', text: 'text-success' }
      case 'MEDIUM':
        return { bg: 'bg-warning/20', text: 'text-warning' }
      case 'LOW':
        return { bg: 'bg-destructive/20', text: 'text-destructive' }
    }
  }

  const confStyle = getConfidenceStyle()

  return (
    <Animated.View
      style={{
        opacity: borderOpacity,
      }}
    >
      <Pressable
        onPress={onPress}
        disabled={!isComplete}
        className="active:opacity-90 w-full"
      >
        <Card
          className={cn(
            'border bg-gradient-to-r from-background to-muted/10 w-full overflow-hidden',
            isComplete ? 'border-success/40' : colors.border,
            className
          )}
          testID="deep-research-loading-card"
          {...props}
        >
          <CardContent className="py-3 px-4">
            {/* Type badge row */}
            <View className="mb-2">
              <View className={cn('px-1.5 py-0.5 rounded self-start', colors.badge)}>
                <Text className={cn('text-[10px] font-bold tracking-wider', colors.text)}>
                  {colors.label}
                </Text>
              </View>
            </View>

            {/* Main row */}
            <View className="flex-row items-center gap-3">
              {/* Spinner or completion check */}
              {!isComplete ? (
                <Animated.View style={{ transform: [{ rotate: rotation }] }}>
                  <Loader2 size={16} className={colors.text} />
                </Animated.View>
              ) : (
                <View className="w-4 h-4 rounded-full bg-success items-center justify-center">
                  <Text className="text-background text-xs font-bold">✓</Text>
                </View>
              )}

              {/* Status message */}
              <Text
                className={cn(
                  'text-sm font-medium flex-1',
                  isComplete ? 'text-success' : colors.text
                )}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {isComplete ? 'Research Complete' : displayMessage}
              </Text>

              {/* Confidence badge (when complete) */}
              {isComplete && confidence && (
                <View className={cn('px-2 py-0.5 rounded-full', confStyle.bg)}>
                  <Text className={cn('text-xs font-semibold', confStyle.text)}>
                    {confidence}
                  </Text>
                </View>
              )}
            </View>

            {/* Query (subtle) */}
            <View className="mt-1.5 ml-7">
              <Text
                className="text-muted-foreground font-mono text-xs"
                numberOfLines={1}
                ellipsizeMode="tail"
                testID="deep-research-loading-query"
              >
                {query}
              </Text>
            </View>

            {/* Complete state: tap hint */}
            {isComplete && onPress && (
              <View className="mt-2 ml-7">
                <Text className="text-muted-foreground text-xs">
                  Tap to view full research →
                </Text>
              </View>
            )}
          </CardContent>
        </Card>
      </Pressable>
    </Animated.View>
  )
}
