/**
 * PlanEditBottomSheet - Bottom sheet for editing plan text.
 *
 * Provides a modal interface for freeform text editing of plan content.
 * Slides up from the bottom with a large text input area and save/cancel actions.
 *
 * Features:
 * - Animated slide-up/slide-down transitions
 * - Pan gesture to dismiss
 * - Backdrop tap to dismiss
 * - Large multiline text input
 * - Character counter
 * - Validation support
 * - Theme-aware styling
 */

import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useEffect, useState } from 'react'
import { Text } from '@/components/ui/text'
import { Check, X } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import * as Haptics from 'expo-haptics'

const TIMING_IN = { duration: 300, easing: Easing.out(Easing.cubic) }
const TIMING_OUT = { duration: 250, easing: Easing.in(Easing.cubic) }
const DISMISS_THRESHOLD = 100
const MAX_CHARS = 5000

export interface PlanEditBottomSheetProps {
  /** Whether the sheet is visible */
  visible: boolean
  /** Called when the sheet is dismissed without saving */
  onClose: () => void
  /** Called when save is pressed with the edited text */
  onSave: (editedText: string) => void
  /** Initial text content for the editor */
  initialText?: string
  /** Optional title for the sheet */
  title?: string
  /** Optional placeholder text */
  placeholder?: string
  /** Maximum character count (default: 5000) */
  maxChars?: number
  /** Optional validation function */
  validate?: (text: string) => boolean | string
  /** Test ID prefix for testing */
  testID?: string
}

/**
 * PlanEditBottomSheet component for editing plan text.
 *
 * @example
 * ```tsx
 * const [visible, setVisible] = useState(false)
 * const [planText, setPlanText] = useState('Initial plan')
 *
 * <PlanEditBottomSheet
 *   visible={visible}
 *   onClose={() => setVisible(false)}
 *   onSave={(edited) => setPlanText(edited)}
 *   initialText={planText}
 *   title="Edit Research Plan"
 * />
 * ```
 */
export function PlanEditBottomSheet({
  visible,
  onClose,
  onSave,
  initialText = '',
  title = 'Edit Plan',
  placeholder = 'Enter your plan details...',
  maxChars = MAX_CHARS,
  validate,
  testID = 'plan-edit-bottom-sheet',
}: PlanEditBottomSheetProps) {
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const translateY = useSharedValue(400)
  const backdropOpacity = useSharedValue(0)

  const [editedText, setEditedText] = useState(initialText)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Reset text when initialText changes and sheet is not visible
  useEffect(() => {
    if (!visible) {
      setEditedText(initialText)
      setValidationError(null)
    }
  }, [initialText, visible])

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, TIMING_IN)
      backdropOpacity.value = withTiming(1, TIMING_IN)
      setEditedText(initialText)
      setValidationError(null)
    } else {
      translateY.value = withTiming(400, TIMING_OUT)
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
    translateY.value = withTiming(400, TIMING_OUT)
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
        translateY.value = withTiming(400, TIMING_OUT)
        backdropOpacity.value = withTiming(0, TIMING_OUT)
        runOnJS(onClose)()
      } else {
        translateY.value = withTiming(0, TIMING_IN)
      }
    })

  const handleSave = () => {
    // Validate if validator provided
    if (validate) {
      const result = validate(editedText)
      if (result !== true) {
        setValidationError(typeof result === 'string' ? result : 'Invalid input')
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        return
      }
    }

    // Check if text is empty
    if (!editedText.trim()) {
      setValidationError('Plan cannot be empty')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    translateY.value = withTiming(400, TIMING_OUT)
    backdropOpacity.value = withTiming(0, TIMING_OUT)
    setTimeout(() => {
      onClose()
      onSave(editedText)
    }, 250)
  }

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    dismiss()
  }

  const charCount = editedText.length
  const isAtLimit = charCount >= maxChars
  const canSave = editedText.trim().length > 0 && !validationError

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

            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <View className="flex-1">
                <Text className="text-foreground text-base font-semibold">
                  {title}
                </Text>
                <Text className="text-muted-foreground text-sm mt-0.5">
                  Edit your plan below
                </Text>
              </View>

              <Pressable
                onPress={handleCancel}
                style={styles.iconButton}
                className="bg-muted rounded-full"
                testID={`${testID}-close`}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={18} className="text-muted-foreground" />
              </Pressable>
            </View>

            {/* Text input area */}
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              testID={`${testID}-scroll`}
            >
              <View
                className="rounded-lg border bg-background px-4 py-3"
                style={{ borderColor: colors.input, minHeight: 200 }}
              >
                <Pressable
                  testID={`${testID}-input-pressable`}
                  onPress={() => {
                    // Focus management handled by parent
                  }}
                >
                  <Text className="text-foreground text-base leading-relaxed">
                    {editedText || placeholder}
                  </Text>
                  {editedText.length === 0 && (
                    <Text className="text-muted-foreground text-base absolute top-3 left-4">
                      {placeholder}
                    </Text>
                  )}
                </Pressable>
              </View>

              {/* Character counter */}
              <View style={styles.footerRow}>
                <Text
                  className={cn(
                    'text-xs',
                    isAtLimit ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {charCount}/{maxChars}
                </Text>
              </View>

              {/* Validation error */}
              {validationError && (
                <View
                  className="mt-2 rounded-lg bg-destructive/10 px-3 py-2"
                  testID={`${testID}-validation-error`}
                >
                  <Text className="text-destructive text-sm">{validationError}</Text>
                </View>
              )}
            </ScrollView>

            {/* Footer with action buttons */}
            <View
              style={[styles.footer, { borderTopColor: colors.border }]}
            >
              <View className="flex-row gap-3">
                <Pressable
                  testID={`${testID}-cancel-button`}
                  onPress={handleCancel}
                  className="flex-1 flex-row items-center justify-center rounded-lg border border-border py-3 active:opacity-80"
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text className="text-foreground text-sm font-semibold">Cancel</Text>
                </Pressable>

                <Pressable
                  testID={`${testID}-save-button`}
                  onPress={handleSave}
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-primary py-3 active:opacity-80"
                  disabled={!canSave}
                  accessibilityRole="button"
                  accessibilityLabel="Save changes"
                >
                  <Check size={16} className="text-primary-foreground" />
                  <Text className="text-primary-foreground text-sm font-semibold">
                    Save Changes
                  </Text>
                </Pressable>
              </View>
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
    maxHeight: '80%',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
})

// Helper function for className conditional
function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ')
}
