import { Modal, Pressable, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useEffect } from 'react'
import { Text } from '@/components/ui/text'
import { Globe, Megaphone, Share2 } from '@/components/ui/icons'
import * as Haptics from 'expo-haptics'

export interface DocumentActionsSheetProps {
  visible: boolean
  onClose: () => void
  onListenPress: () => void
  onSharePress: () => void
  isNarrationActive: boolean
  isPublic?: boolean
  testID?: string
}

const TIMING_CONFIG = {
  duration: 250,
  easing: Easing.out(Easing.cubic),
}

const TIMING_OUT_CONFIG = {
  duration: 200,
  easing: Easing.in(Easing.cubic),
}

/**
 * Bottom sheet with document actions: Listen (narration) and Share.
 * Slides up smoothly from bottom with backdrop overlay.
 */
export function DocumentActionsSheet({
  visible,
  onClose,
  onListenPress,
  onSharePress,
  isNarrationActive,
  isPublic = false,
  testID = 'document-actions-sheet',
}: DocumentActionsSheetProps) {
  const insets = useSafeAreaInsets()
  const translateY = useSharedValue(300)
  const backdropOpacity = useSharedValue(0)

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, TIMING_CONFIG)
      backdropOpacity.value = withTiming(1, TIMING_CONFIG)
    } else {
      translateY.value = withTiming(300, TIMING_OUT_CONFIG)
      backdropOpacity.value = withTiming(0, TIMING_OUT_CONFIG)
    }
  }, [visible])

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(translateY.value, 0) }],
  }))

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  const DISMISS_THRESHOLD = 80

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD) {
        translateY.value = withTiming(300, TIMING_OUT_CONFIG)
        backdropOpacity.value = withTiming(0, TIMING_OUT_CONFIG)
        runOnJS(onClose)()
      } else {
        translateY.value = withTiming(0, TIMING_CONFIG)
      }
    })

  const handleAction = (action: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onClose()
    setTimeout(action, 200)
  }

  if (!visible) return null

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      testID={testID}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* Backdrop */}
        <Pressable
          onPress={onClose}
          testID={`${testID}-backdrop`}
          style={{ flex: 1 }}
        >
          <Animated.View
            style={[backdropStyle, { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }]}
          />
        </Pressable>

        {/* Sheet */}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              sheetStyle,
              { paddingBottom: insets.bottom + 16 },
            ]}
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-border bg-card px-6 pt-4"
          >
            {/* Handle bar */}
            <View className="mb-4 items-center">
              <View className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </View>

            {/* Listen action */}
            <Pressable
              testID={`${testID}-listen`}
              onPress={() => handleAction(onListenPress)}
              className="flex-row items-center gap-4 rounded-xl px-4 py-3.5 active:bg-muted"
            >
              <View className={isNarrationActive ? 'rounded-full bg-primary/15 p-2' : 'rounded-full bg-muted p-2'}>
                <Megaphone size={20} className={isNarrationActive ? 'text-primary' : 'text-foreground'} />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-base font-medium">
                  {isNarrationActive ? 'Stop Listening' : 'Listen'}
                </Text>
                <Text className="text-muted-foreground text-sm">
                  {isNarrationActive ? 'Exit audio narration mode' : 'Have this document read aloud'}
                </Text>
              </View>
            </Pressable>

            {/* Share action */}
            <Pressable
              testID={`${testID}-share`}
              onPress={() => handleAction(onSharePress)}
              className="flex-row items-center gap-4 rounded-xl px-4 py-3.5 active:bg-muted"
            >
              <View className={isPublic ? 'rounded-full bg-primary/15 p-2' : 'rounded-full bg-muted p-2'}>
                {isPublic ? (
                  <Globe size={20} className="text-primary" />
                ) : (
                  <Share2 size={20} className="text-foreground" />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-base font-medium">
                  {isPublic ? 'Shared' : 'Share'}
                </Text>
                <Text className="text-muted-foreground text-sm">
                  {isPublic ? 'Manage or copy share link' : 'Publish and share this document'}
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  )
}
