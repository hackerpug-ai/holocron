import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { Loader2, Sparkles } from 'lucide-react-native'
import type { ViewProps } from 'react-native'
import { View, Animated, Easing } from 'react-native'
import { useEffect, useRef } from 'react'

export interface DeepResearchLoadingCardProps extends Omit<ViewProps, 'children'> {
  /** The search query/topic being researched */
  query: string
  /** Optional loading message */
  message?: string
  /** Optional class name for custom styling */
  className?: string
}

/**
 * DeepResearchLoadingCard displays an animated loading state
 * while deep research is initializing or in progress.
 *
 * Design Concept: Kinetic Typography meets Terminal Aesthetic
 * - Monospace query text with subtle glow
 * - Pulsing gradient border animation
 * - Staggered dot animation for depth
 * - High contrast with distinctive cyan accent
 */
export function DeepResearchLoadingCard({
  query,
  message = 'Initializing research session...',
  className,
  ...props
}: DeepResearchLoadingCardProps) {
  // Animated values
  const pulseAnim = useRef(new Animated.Value(0)).current
  const glowAnim = useRef(new Animated.Value(0)).current
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

    // Glow animation for query text
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    ).start()

    // Rotation for spinner
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start()
  }, [pulseAnim, glowAnim, rotateAnim])

  const borderOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  })

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  })

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <Animated.View
      style={{
        opacity: borderOpacity,
      }}
    >
      <Card
        className={cn(
          'border-2 border-cyan-500/50 bg-gradient-to-br from-background to-muted/30',
          className
        )}
        testID="deep-research-loading-card"
        {...props}
      >
        <CardContent className="gap-4 py-4">
          {/* Header with animated spinner */}
          <View className="flex-row items-center gap-3">
            <Animated.View
              style={{
                transform: [{ rotate: rotation }],
              }}
            >
              <Loader2 size={20} className="text-cyan-500" />
            </Animated.View>
            <Text className="text-cyan-500 flex-1 text-sm font-semibold uppercase tracking-widest">
              {message}
            </Text>
            <Sparkles size={16} className="text-cyan-500/50" />
          </View>

          {/* Query display with terminal aesthetic */}
          <View className="bg-black/40 dark:bg-white/5 rounded-lg border border-cyan-500/20 px-4 py-3">
            <View className="flex-row items-center gap-2 mb-2">
              <View className="w-2 h-2 rounded-full bg-cyan-500" />
              <View className="w-2 h-2 rounded-full bg-cyan-500/60" />
              <View className="w-2 h-2 rounded-full bg-cyan-500/30" />
              <Text className="text-cyan-400/70 ml-auto text-xs font-mono">
                query.txt
              </Text>
            </View>

            <Animated.View style={{ opacity: glowOpacity }}>
              <Text
                className="text-cyan-300 dark:text-cyan-200 font-mono text-base leading-relaxed"
                numberOfLines={3}
                testID="deep-research-loading-query"
              >
                {query}
              </Text>
            </Animated.View>

            {/* Cursor blink simulation */}
            <View className="flex-row items-center gap-1 mt-2">
              <Text className="text-cyan-500/50 text-xs font-mono">$</Text>
              <AnimatedDots />
            </View>
          </View>

          {/* Progress indicator */}
          <View className="flex-row items-center gap-2">
            <View className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <Animated.View
                style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#06b6d4', // cyan-500
                  opacity: pulseAnim,
                }}
              />
            </View>
            <Text className="text-muted-foreground text-xs font-mono">
              INIT
            </Text>
          </View>
        </CardContent>
      </Card>
    </Animated.View>
  )
}

/**
 * AnimatedDots component - displays animated loading dots
 * with staggered fade-in/out for depth effect
 */
function AnimatedDots() {
  const dot1Anim = useRef(new Animated.Value(0)).current
  const dot2Anim = useRef(new Animated.Value(0)).current
  const dot3Anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const createDotAnimation = (animValue: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(animValue, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      )
    }

    Animated.parallel([
      createDotAnimation(dot1Anim, 0),
      createDotAnimation(dot2Anim, 200),
      createDotAnimation(dot3Anim, 400),
    ]).start()
  }, [dot1Anim, dot2Anim, dot3Anim])

  return (
    <View className="flex-row gap-1">
      <Animated.View style={{ opacity: dot1Anim }}>
        <Text className="text-cyan-500 font-mono">.</Text>
      </Animated.View>
      <Animated.View style={{ opacity: dot2Anim }}>
        <Text className="text-cyan-500 font-mono">.</Text>
      </Animated.View>
      <Animated.View style={{ opacity: dot3Anim }}>
        <Text className="text-cyan-500 font-mono">.</Text>
      </Animated.View>
    </View>
  )
}
