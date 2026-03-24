import { Pressable } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { Mic, MicOff } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

export interface NarrationToggleButtonProps {
  isActive: boolean
  onPress: () => void
  testID?: string
}

/**
 * NarrationToggleButton renders a circular 40x40 Pressable that toggles
 * between microphone and muted-microphone states.
 *
 * - isActive=false: Mic icon, muted foreground color, plain circle
 * - isActive=true:  MicOff icon, primary color, primary/10 background tint
 *
 * A spring scale animation plays on every press for tactile feedback,
 * accompanied by a medium haptic impact.
 *
 * @example
 * ```tsx
 * <NarrationToggleButton
 *   isActive={narrationEnabled}
 *   onPress={() => setNarrationEnabled(v => !v)}
 * />
 * ```
 */
export function NarrationToggleButton({
  isActive,
  onPress,
  testID = 'narration-toggle-button',
}: NarrationToggleButtonProps) {
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(1.25, { damping: 10 }),
      withSpring(1.0, { damping: 14 })
    )
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onPress()
  }

  return (
    <Pressable
      onPress={handlePress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={isActive ? 'Exit narration mode' : 'Enter narration mode'}
    >
      <Animated.View
        style={animatedStyle}
        className={cn(
          'h-10 w-10 items-center justify-center rounded-full',
          isActive ? 'bg-primary/10' : 'active:bg-muted'
        )}
      >
        {isActive ? (
          <MicOff size={20} className="text-primary" />
        ) : (
          <Mic size={20} className="text-muted-foreground" />
        )}
      </Animated.View>
    </Pressable>
  )
}
