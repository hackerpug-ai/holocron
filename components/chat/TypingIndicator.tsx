import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated'

export interface TypingIndicatorProps {
  testID?: string
}

export function TypingIndicator({ testID = 'typing-indicator' }: TypingIndicatorProps) {
  return (
    <View className="my-1 px-4 items-start" testID={testID}>
      <View className="bg-card rounded-lg p-3 flex-row items-center gap-1">
        <AnimatedDot delay={0} testID="typing-dot-1" />
        <AnimatedDot delay={150} testID="typing-dot-2" />
        <AnimatedDot delay={300} testID="typing-dot-3" />
      </View>
    </View>
  )
}

interface AnimatedDotProps {
  delay: number
  testID?: string
}

function AnimatedDot({ delay, testID }: AnimatedDotProps) {
  const opacity = useSharedValue(0.3)

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 })
        ),
        -1,
        false
      )
    )
  }, [delay, opacity])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  return (
    <Animated.View
      style={animatedStyle}
      className="w-2 h-2 rounded-full bg-primary/60"
      testID={testID}
    />
  )
}
