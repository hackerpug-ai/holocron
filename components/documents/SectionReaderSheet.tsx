/**
 * SectionReaderSheet - Full-screen-ish bottom sheet for reading a document section.
 *
 * Evolves from ExcerptReaderSheet with two key changes:
 * 1. Header gains a Trash2 "delete from chat" button alongside the X close button.
 * 2. Body renders markdown content via <MarkdownText> instead of a plain <Text>.
 *
 * Header layout: [CategoryBadge + title] ... [Trash2 button] [X button]
 * Footer: "View in Document" button — identical to ExcerptReaderSheet.
 */

import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
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
import { CategoryBadge, type CategoryType } from '@/components/CategoryBadge'
import { BookOpen, ChevronRight, Trash2, X } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import { MarkdownText } from '@/components/markdown'
import * as Haptics from 'expo-haptics'

const SCREEN_HEIGHT = Dimensions.get('window').height
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.75

const TIMING_IN = { duration: 300, easing: Easing.out(Easing.cubic) }
const TIMING_OUT = { duration: 250, easing: Easing.in(Easing.cubic) }
const DISMISS_THRESHOLD = 100

export interface SectionReaderSheetProps {
  visible: boolean
  onClose: () => void
  title: string
  content: string
  category?: CategoryType
  onViewInDocument?: () => void
  onDeleteFromChat?: () => void
  testID?: string
}

export function SectionReaderSheet({
  visible,
  onClose,
  title,
  content,
  category,
  onViewInDocument,
  onDeleteFromChat,
  testID = 'section-reader-sheet',
}: SectionReaderSheetProps) {
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const translateY = useSharedValue(SHEET_HEIGHT)
  const backdropOpacity = useSharedValue(0)

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, TIMING_IN)
      backdropOpacity.value = withTiming(1, TIMING_IN)
    } else {
      translateY.value = withTiming(SHEET_HEIGHT, TIMING_OUT)
      backdropOpacity.value = withTiming(0, TIMING_OUT)
    }
  }, [visible])

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(translateY.value, 0) }],
  }))

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  const dismiss = () => {
    translateY.value = withTiming(SHEET_HEIGHT, TIMING_OUT)
    backdropOpacity.value = withTiming(0, TIMING_OUT)
    setTimeout(onClose, 250)
  }

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD) {
        translateY.value = withTiming(SHEET_HEIGHT, TIMING_OUT)
        backdropOpacity.value = withTiming(0, TIMING_OUT)
        runOnJS(onClose)()
      } else {
        translateY.value = withTiming(0, TIMING_IN)
      }
    })

  const handleViewInDocument = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onViewInDocument?.()
  }

  // dismiss-then-fire pattern: close the sheet first, then call the callback
  // after the closing animation completes so the sheet is gone before any
  // downstream UI changes (e.g. message removal) happen.
  const handleDeleteFromChat = () => {
    translateY.value = withTiming(SHEET_HEIGHT, TIMING_OUT)
    backdropOpacity.value = withTiming(0, TIMING_OUT)
    setTimeout(() => {
      onClose()
      onDeleteFromChat?.()
    }, 250)
  }

  if (!visible) return null

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={dismiss}
      testID={testID}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* Backdrop */}
        <Pressable
          onPress={dismiss}
          testID={`${testID}-backdrop`}
          style={{ flex: 1 }}
        >
          <Animated.View
            style={[backdropStyle, { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }]}
          />
        </Pressable>

        {/* Sheet */}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              sheetStyle,
              styles.sheet,
              {
                height: SHEET_HEIGHT,
                paddingBottom: insets.bottom,
                backgroundColor: colors.card,
              },
            ]}
          >
            {/* Drag handle */}
            <View style={styles.handleRow}>
              <View
                style={[styles.handle, { backgroundColor: colors.mutedForeground + '4D' }]}
              />
            </View>

            {/* Header: category + title, then delete + close buttons */}
            <View
              style={[styles.header, { borderBottomColor: colors.border }]}
            >
              <View className="flex-1 gap-1.5 pr-4">
                {category && (
                  <View className="flex-row">
                    <CategoryBadge category={category} size="sm" />
                  </View>
                )}
                <Text className="text-foreground text-base font-semibold" numberOfLines={2}>
                  {title}
                </Text>
              </View>

              {/* Action buttons row */}
              <View style={styles.actionButtons}>
                {onDeleteFromChat && (
                  <Pressable
                    onPress={handleDeleteFromChat}
                    style={styles.iconButton}
                    className="bg-destructive/10 rounded-full"
                    testID={`${testID}-delete`}
                    accessibilityRole="button"
                    accessibilityLabel="Delete from chat"
                  >
                    <Trash2 size={18} className="text-destructive" />
                  </Pressable>
                )}
                <Pressable
                  onPress={dismiss}
                  style={styles.iconButton}
                  className="bg-muted rounded-full"
                  testID={`${testID}-close`}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <X size={18} className="text-muted-foreground" />
                </Pressable>
              </View>
            </View>

            {/* Scrollable markdown body */}
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={true}
              testID={`${testID}-scroll`}
            >
              {/* Decorative BookOpen divider */}
              <View className="mb-4 flex-row items-center gap-2">
                <View className="h-px flex-1 bg-border" />
                <BookOpen size={16} className="text-muted-foreground/50" />
                <View className="h-px flex-1 bg-border" />
              </View>

              <MarkdownText content={content} />

              {/* Bottom decorative line */}
              <View className="mt-6 h-px bg-border" />
            </ScrollView>

            {/* Footer: View in Document button */}
            <View
              style={[styles.footer, { borderTopColor: colors.border }]}
            >
              <Pressable
                onPress={handleViewInDocument}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary py-3.5 active:opacity-80"
                testID={`${testID}-view-in-doc`}
                accessibilityRole="button"
                accessibilityLabel="View in document"
              >
                <BookOpen size={18} className="text-primary-foreground" />
                <Text className="text-primary-foreground text-base font-semibold">
                  View in Document
                </Text>
                <ChevronRight size={16} className="text-primary-foreground/60" />
              </Pressable>
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
})
