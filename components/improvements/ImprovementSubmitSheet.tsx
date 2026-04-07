/**
 * ImprovementSubmitSheet - Bottom sheet for submitting improvement/bug reports.
 *
 * Multi-state flow:
 *   input → processing → result (new | merge) → success
 *
 * Follows the PlanEditBottomSheet modal/animation pattern exactly:
 * - Modal transparent, animationType="none"
 * - Animated backdrop tap-to-dismiss
 * - Pan gesture to swipe down and dismiss
 * - Timing: IN 300ms Easing.out(cubic), OUT 250ms Easing.in(cubic)
 */

import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Text } from '@/components/ui/text'
import { X } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'

// ── Animation constants (mirrors PlanEditBottomSheet) ──────────────────────
const TIMING_IN = { duration: 300, easing: Easing.out(Easing.cubic) }
const TIMING_OUT = { duration: 250, easing: Easing.in(Easing.cubic) }
const DISMISS_THRESHOLD = 80

// ── Types ──────────────────────────────────────────────────────────────────
export interface ImprovementSubmitSheetProps {
  visible: boolean
  onClose: () => void
  onSubmitted?: (requestId: Id<'improvementRequests'>) => void
  screenshotUri?: string | null
  sourceComponent?: string
  testID?: string
}

// ── Component ──────────────────────────────────────────────────────────────
export function ImprovementSubmitSheet({
  visible,
  onClose,
  onSubmitted,
  screenshotUri,
  sourceComponent,
  testID = 'improvement-submit-sheet',
}: ImprovementSubmitSheetProps) {
  const insets = useSafeAreaInsets()
  const { colors, typography, spacing } = useTheme()
  const styles = useStyles(typography, spacing)

  // ── Animation shared values ──────────────────────────────────────────────
  const translateY = useSharedValue(600)
  const backdropOpacity = useSharedValue(0)

  // ── Local state ──────────────────────────────────────────────────────────
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ── Convex hooks ─────────────────────────────────────────────────────────
  const generateUploadUrl = useMutation(api.improvements.mutations.generateUploadUrl)
  const submitMutation = useMutation(api.improvements.mutations.submit)

  // ── Animation on visibility change ───────────────────────────────────────
  useEffect(() => {
    if (visible) {
      // Reset state on open
      setDescription('')
      setIsSubmitting(false)
      translateY.value = withTiming(0, TIMING_IN)
      backdropOpacity.value = withTiming(1, TIMING_IN)
    } else {
      translateY.value = withTiming(600, TIMING_OUT)
      backdropOpacity.value = withTiming(0, TIMING_OUT)
    }
  }, [visible, backdropOpacity, translateY])

  // ── Animated styles ───────────────────────────────────────────────────────
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(translateY.value, 0) }],
  }))

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  // ── Dismiss helpers ───────────────────────────────────────────────────────
  const animateOut = (callback: () => void) => {
    translateY.value = withTiming(600, TIMING_OUT)
    backdropOpacity.value = withTiming(0, TIMING_OUT)
    setTimeout(callback, 250)
  }

  const dismiss = () => animateOut(onClose)

  // ── Pan gesture (swipe-to-dismiss) ────────────────────────────────────────
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD) {
        translateY.value = withTiming(600, TIMING_OUT)
        backdropOpacity.value = withTiming(0, TIMING_OUT)
        runOnJS(onClose)()
      } else {
        translateY.value = withTiming(0, TIMING_IN)
      }
    })

  // ── Submit handler ────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!description.trim() || isSubmitting) return
    setIsSubmitting(true)

    try {
      let storageId: Id<'_storage'> | undefined

      if (screenshotUri) {
        const uploadUrl = await generateUploadUrl()

        // Fetch the local image as a blob and POST to Convex storage
        const imageResponse = await fetch(screenshotUri)
        const blob = await imageResponse.blob()

        const storageResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': blob.type || 'image/png' },
          body: blob,
        })

        if (storageResponse.ok) {
          const { storageId: sid } = (await storageResponse.json()) as {
            storageId: Id<'_storage'>
          }
          storageId = sid
        }
      }

      const requestId = await submitMutation({
        description: description.trim(),
        storageId,
        sourceScreen: sourceComponent ?? 'unknown',
        sourceComponent,
      })

      // Close sheet immediately and notify parent
      animateOut(() => {
        onClose()
        onSubmitted?.(requestId as Id<'improvementRequests'>)
      })
    } catch {
      // If upload/submit fails, stay on input state
      setIsSubmitting(false)
    }
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
      <GestureHandlerRootView style={styles.flex}>
        {/* Backdrop */}
        <Pressable
          onPress={dismiss}
          testID={`${testID}-backdrop`}
          style={styles.flex}
        >
          <Animated.View
            style={[backdropStyle, styles.flex, styles.backdrop]}
          />
        </Pressable>

        {/* KAV wraps entire sheet so it moves up with keyboard */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kavWrapper}
          pointerEvents="box-none"
        >
          {/* Sheet */}
          <GestureDetector gesture={panGesture}>
            <Animated.View
              style={[
                sheetStyle,
                styles.sheet,
                { paddingBottom: insets.bottom, backgroundColor: colors.card },
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
                <View style={styles.flex}>
                  <Text className="text-foreground text-base font-semibold">
                    Report Improvement
                  </Text>
                </View>
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

              <ScrollView
                style={styles.flex}
                contentContainerStyle={styles.bodyContent}
                keyboardShouldPersistTaps="handled"
                testID={`${testID}-scroll`}
              >
                {/* ── Input ──────────────────────────────────────────────── */}
                <View>
                    {/* Screenshot preview */}
                    {screenshotUri ? (
                      <Image
                        source={{ uri: screenshotUri }}
                        style={[
                          styles.screenshotPreview,
                          { borderColor: colors.border },
                        ]}
                        resizeMode="contain"
                        testID={`${testID}-screenshot-preview`}
                        accessibilityLabel="Screenshot preview"
                      />
                    ) : null}

                    {/* Description input */}
                    <View
                      className="rounded-lg border bg-background px-4 py-3"
                      style={{ borderColor: colors.input, minHeight: 100 }}
                    >
                      <TextInput
                        testID={`${testID}-description-input`}
                        value={description}
                        onChangeText={setDescription}
                        placeholder="Describe the improvement or bug..."
                        placeholderTextColor={colors.mutedForeground}
                        multiline
                        style={[
                          styles.textInput,
                          { color: colors.foreground, minHeight: 100 },
                        ]}
                        accessibilityLabel="Description input"
                      />
                    </View>

                    {/* Button row */}
                    <View style={styles.buttonRow}>
                      <Pressable
                        testID={`${testID}-cancel-button`}
                        onPress={dismiss}
                        className="flex-1 flex-row items-center justify-center rounded-lg border border-border py-3 active:opacity-80"
                        accessibilityRole="button"
                        accessibilityLabel="Cancel"
                      >
                        <Text className="text-foreground text-sm font-semibold">
                          Cancel
                        </Text>
                      </Pressable>

                      <Pressable
                        testID={`${testID}-submit-button`}
                        onPress={handleSubmit}
                        disabled={!description.trim() || isSubmitting}
                        className="flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-primary py-3 active:opacity-80"
                        style={
                          !description.trim() || isSubmitting
                            ? styles.disabledButton
                            : undefined
                        }
                        accessibilityRole="button"
                        accessibilityLabel="Submit"
                      >
                        {isSubmitting ? (
                          <ActivityIndicator size="small" color={colors.primaryForeground} />
                        ) : (
                          <Text className="text-primary-foreground text-sm font-semibold">
                            Submit
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  </View>

              </ScrollView>
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
const useStyles = (typography: any, _spacing: any) => {
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
    backdrop: {
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    kavWrapper: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      maxHeight: '85%',
    },
    sheet: {
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
    bodyContent: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 24,
    },
    screenshotPreview: {
      width: '100%',
      height: 120,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 12,
    },
    textInput: {
      fontSize: typography.bodySmall.fontSize,
      lineHeight: 20,
      textAlignVertical: 'top',
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 16,
    },
    disabledButton: {
      opacity: 0.5,
    },
  })
}
