/**
 * ShopLoadingCard - Animated loading state for shop search
 *
 * Aesthetic: Pulsing radar/scanning animation with retailer progress
 * - Animated scanning effect
 * - Retailer icons cycling through
 * - Progress message updates
 */

import { View, StyleSheet } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { ShoppingCart, Search, Loader2 } from 'lucide-react-native'
import { useTheme } from '@/hooks/use-theme'
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  useSharedValue,
  withDelay,
  Easing,
} from 'react-native-reanimated'
import { useEffect } from 'react'

export interface ShopLoadingCardProps {
  sessionId: string
  query: string
  message?: string
  testID?: string
}

// Retailer names for the scanning animation
const RETAILERS = ['Amazon', 'eBay', 'Walmart', 'Target', 'Best Buy', 'Newegg']

export function ShopLoadingCard({
  sessionId,
  query,
  message = 'Searching for deals...',
  testID = 'shop-loading-card',
}: ShopLoadingCardProps) {
  const { colors: themeColors } = useTheme()

  // Animated values
  const rotation = useSharedValue(0)
  const pulse = useSharedValue(1)
  const scanLine = useSharedValue(0)

  useEffect(() => {
    // Continuous rotation for the loader
    rotation.value = withRepeat(
      withTiming(360, { duration: 1500, easing: Easing.linear }),
      -1,
      false
    )

    // Pulsing effect for the background
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    )

    // Scanning line animation
    scanLine.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.linear }),
      -1,
      false
    )
  }, [rotation, pulse, scanLine])

  const rotationStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }))

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 0.5 + (pulse.value - 1) * 5,
  }))

  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanLine.value * 60 }],
    opacity: 1 - scanLine.value * 0.5,
  }))

  return (
    <Card testID={testID} className="border-border bg-card overflow-hidden">
      {/* Animated top accent */}
      <View className="relative h-1 overflow-hidden" style={{ backgroundColor: themeColors.muted }}>
        <Animated.View
          style={[
            styles.scanBar,
            { backgroundColor: themeColors.primary },
            scanLineStyle,
          ]}
        />
      </View>

      <View className="p-4">
        {/* Header */}
        <View className="mb-4 flex-row items-center gap-3">
          {/* Animated icon container */}
          <View className="relative">
            <Animated.View style={pulseStyle}>
              <View
                className="absolute -inset-2 rounded-full"
                style={{ backgroundColor: `${themeColors.primary}20` }}
              />
            </Animated.View>
            <Animated.View style={rotationStyle}>
              <Search size={24} color={themeColors.primary} />
            </Animated.View>
          </View>

          <View className="flex-1">
            <Text className="text-foreground text-lg font-bold" numberOfLines={1}>
              {query}
            </Text>
            <Text className="text-muted-foreground text-sm">{message}</Text>
          </View>
        </View>

        {/* Retailer scanning visualization */}
        <View className="rounded-lg bg-muted/50 p-3">
          <Text className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wider">
            Scanning Retailers
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {RETAILERS.map((retailer, index) => (
              <RetailerPill
                key={retailer}
                name={retailer}
                delay={index * 200}
                themeColors={themeColors}
              />
            ))}
          </View>
        </View>

        {/* Progress indicator */}
        <View className="mt-3 flex-row items-center justify-center gap-2">
          <Animated.View style={rotationStyle}>
            <Loader2 size={14} color={themeColors.mutedForeground} />
          </Animated.View>
          <Text className="text-muted-foreground text-xs">
            Finding the best deals for you...
          </Text>
        </View>
      </View>
    </Card>
  )
}

/**
 * Animated retailer pill with staggered fade
 */
function RetailerPill({
  name,
  delay,
  themeColors,
}: {
  name: string
  delay: number
  themeColors: { secondary: string; [key: string]: string }
}) {
  const opacity = useSharedValue(0.4)

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.4, { duration: 500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    )
  }, [delay, opacity])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  return (
    <Animated.View
      style={[
        animatedStyle,
        { backgroundColor: themeColors.secondary },
      ]}
      className="rounded-full px-2.5 py-1"
    >
      <Text className="text-secondary-foreground text-xs font-medium">{name}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  scanBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
  },
})
