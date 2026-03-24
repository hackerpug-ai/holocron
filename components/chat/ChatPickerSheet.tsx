/**
 * ChatPickerSheet - Bottom sheet to select a conversation to add document context to.
 * Shows "New Chat" at top, then recent conversations.
 */

import { Modal, Pressable, View, FlatList } from 'react-native'
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
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Text } from '@/components/ui/text'
import { Plus, MessageSquare } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import * as Haptics from 'expo-haptics'

export interface ChatPickerSheetProps {
  visible: boolean
  onClose: () => void
  /** Called with conversationId (or 'new' for new chat) */
  onSelect: (conversationId: string) => void
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

export function ChatPickerSheet({
  visible,
  onClose,
  onSelect,
  testID = 'chat-picker-sheet',
}: ChatPickerSheetProps) {
  const insets = useSafeAreaInsets()
  const { colors: themeColors } = useTheme()
  const translateY = useSharedValue(500)
  const backdropOpacity = useSharedValue(0)

  const conversations = useQuery(api.conversations.index.list, { limit: 20 }) ?? []

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, TIMING_CONFIG)
      backdropOpacity.value = withTiming(1, TIMING_CONFIG)
    } else {
      translateY.value = withTiming(500, TIMING_OUT_CONFIG)
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
        translateY.value = withTiming(500, TIMING_OUT_CONFIG)
        backdropOpacity.value = withTiming(0, TIMING_OUT_CONFIG)
        runOnJS(onClose)()
      } else {
        translateY.value = withTiming(0, TIMING_CONFIG)
      }
    })

  const handleSelect = (conversationId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onClose()
    setTimeout(() => onSelect(conversationId), 200)
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
              { paddingBottom: insets.bottom + 16, maxHeight: '60%' },
            ]}
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-border bg-card px-6 pt-4"
          >
            {/* Handle bar */}
            <View className="mb-4 items-center">
              <View className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </View>

            {/* Title */}
            <Text className="text-foreground text-lg font-semibold mb-4">
              Add to Chat
            </Text>

            {/* New Chat option */}
            <Pressable
              testID={`${testID}-new-chat`}
              onPress={() => handleSelect('new')}
              className="flex-row items-center gap-4 rounded-xl px-4 py-3.5 active:bg-muted mb-2"
            >
              <View className="rounded-full bg-primary/15 p-2">
                <Plus size={20} color={themeColors.primary} />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-base font-medium">
                  New Chat
                </Text>
                <Text className="text-muted-foreground text-sm">
                  Start a fresh conversation
                </Text>
              </View>
            </Pressable>

            {/* Separator */}
            {conversations.length > 0 && (
              <View className="mx-4 border-b border-border mb-2" />
            )}

            {/* Conversations list */}
            <FlatList
              data={conversations}
              keyExtractor={(item) => item._id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable
                  testID={`${testID}-conversation-${item._id}`}
                  onPress={() => handleSelect(item._id)}
                  className="flex-row items-center gap-4 rounded-xl px-4 py-3 active:bg-muted"
                >
                  <View className="rounded-full bg-muted p-2">
                    <MessageSquare size={18} className="text-foreground" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-foreground text-base" numberOfLines={1}>
                      {item.title || 'Untitled Chat'}
                    </Text>
                    {item.lastMessagePreview && (
                      <Text className="text-muted-foreground text-sm" numberOfLines={1}>
                        {item.lastMessagePreview}
                      </Text>
                    )}
                  </View>
                </Pressable>
              )}
            />
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  )
}
