import { useEffect, useRef } from 'react'
import { View, StyleSheet, Animated } from 'react-native'

export interface TypingIndicatorProps {
  testID?: string
}

export function TypingIndicator({ testID = 'typing-indicator' }: TypingIndicatorProps) {
  const dot1 = useRef(new Animated.Value(0)).current
  const dot2 = useRef(new Animated.Value(0)).current
  const dot3 = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ])
      ).start()
    }

    animate(dot1, 0)
    animate(dot2, 150)
    animate(dot3, 300)
  }, [dot1, dot2, dot3])

  const dotStyle = (animValue: Animated.Value) => ({
    opacity: animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 1],
    }),
  })

  return (
    <View className="my-1 px-4 items-start" testID={testID}>
      <View className="bg-card rounded-lg p-3 flex-row items-center gap-1">
        <Animated.View
          className="bg-primary/60 w-2 h-2 rounded-full"
          style={dotStyle(dot1)}
          testID="typing-dot-1"
        />
        <Animated.View
          className="bg-primary/60 w-2 h-2 rounded-full"
          style={dotStyle(dot2)}
          testID="typing-dot-2"
        />
        <Animated.View
          className="bg-primary/60 w-2 h-2 rounded-full"
          style={dotStyle(dot3)}
          testID="typing-dot-3"
        />
      </View>
    </View>
  )
}
