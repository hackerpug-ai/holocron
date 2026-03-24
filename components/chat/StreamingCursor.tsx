import { useEffect } from 'react'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { Text } from '@/components/ui/text'

/**
 * StreamingCursor renders a blinking "|" character to indicate that an
 * agent message is still being streamed. Intended for inline use at the
 * end of a message bubble's text content.
 */
export function StreamingCursor() {
  const opacity = useSharedValue(1)

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0, { duration: 530, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    )
  }, [])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  return (
    <Animated.View style={animatedStyle} testID="streaming-cursor">
      <Text className="text-foreground">|</Text>
    </Animated.View>
  )
}
