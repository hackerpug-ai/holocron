import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { Bot } from '@/components/ui/icons'
import { useEffect, useRef } from 'react'
import { Animated, Easing, View, type ViewProps } from 'react-native'

interface TypingIndicatorProps extends Omit<ViewProps, 'children'> {
  /** Whether the indicator is visible */
  visible?: boolean
}

/**
 * TypingIndicator shows an elegant pulsing animation to indicate the agent is processing.
 * Features a breathing glow effect and subtle dot wave.
 */
export function TypingIndicator({
  visible = true,
  className,
  ...props
}: TypingIndicatorProps) {
  const dot1 = useRef(new Animated.Value(0)).current
  const dot2 = useRef(new Animated.Value(0)).current
  const dot3 = useRef(new Animated.Value(0)).current
  const containerFade = useRef(new Animated.Value(0)).current
  const pulseAnim = useRef(new Animated.Value(0.6)).current

  useEffect(() => {
    if (!visible) return

    // Fade in container
    Animated.timing(containerFade, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start()

    // Subtle pulse for the avatar
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    )
    pulseLoop.start()

    // Dot wave animation - smoother, more organic
    const createDotAnimation = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 400,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
        ])
      )
    }

    const animation1 = createDotAnimation(dot1, 0)
    const animation2 = createDotAnimation(dot2, 200)
    const animation3 = createDotAnimation(dot3, 400)

    animation1.start()
    animation2.start()
    animation3.start()

    return () => {
      pulseLoop.stop()
      animation1.stop()
      animation2.stop()
      animation3.stop()
    }
  }, [visible, dot1, dot2, dot3, containerFade, pulseAnim])

  if (!visible) return null

  const dotStyle = (animatedValue: Animated.Value) => ({
    opacity: animatedValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0.4, 1],
    }),
    transform: [
      {
        scale: animatedValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0.85, 1.1],
        }),
      },
    ],
  })

  return (
    <Animated.View
      className={cn('flex-row items-start gap-3 self-start', className)}
      style={{ opacity: containerFade }}
      testID="typing-indicator"
      {...props}
    >
      {/* Avatar with pulse */}
      <Animated.View
        className="bg-secondary border-border/50 h-7 w-7 items-center justify-center rounded-full border"
        style={{ opacity: pulseAnim }}
      >
        <Bot size={14} className="text-muted-foreground" strokeWidth={2.5} />
      </Animated.View>

      {/* Message bubble with dots */}
      <View className="gap-1.5">
        <View className="bg-card border-border/40 flex-row items-center gap-1.5 rounded-2xl rounded-tl-sm border px-4 py-3">
          <Animated.View
            className="bg-primary/60 h-1.5 w-1.5 rounded-full"
            style={dotStyle(dot1)}
            testID="typing-dot-1"
          />
          <Animated.View
            className="bg-primary/60 h-1.5 w-1.5 rounded-full"
            style={dotStyle(dot2)}
            testID="typing-dot-2"
          />
          <Animated.View
            className="bg-primary/60 h-1.5 w-1.5 rounded-full"
            style={dotStyle(dot3)}
            testID="typing-dot-3"
          />
        </View>

        <Text className="text-muted-foreground/50 pl-1 text-[11px] tracking-wide">
          Thinking...
        </Text>
      </View>
    </Animated.View>
  )
}
