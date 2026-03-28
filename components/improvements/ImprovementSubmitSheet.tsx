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
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Text } from '@/components/ui/text'
import {
  Check,
  CheckCircle2,
  GitMerge,
  X,
} from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'

// ── Animation constants (mirrors PlanEditBottomSheet) ──────────────────────
const TIMING_IN = { duration: 300, easing: Easing.out(Easing.cubic) }
const TIMING_OUT = { duration: 250, easing: Easing.in(Easing.cubic) }
const DISMISS_THRESHOLD = 80

// ── Types ──────────────────────────────────────────────────────────────────
type SheetState = 'input' | 'processing' | 'result' | 'success'

export interface ImprovementSubmitSheetProps {
  visible: boolean
  onClose: () => void
  screenshotUri?: string | null
  sourceComponent?: string
  testID?: string
}

// ── Component ──────────────────────────────────────────────────────────────
export function ImprovementSubmitSheet({
  visible,
  onClose,
  screenshotUri,
  sourceComponent,
  testID = 'improvement-submit-sheet',
}: ImprovementSubmitSheetProps) {
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()

  // ── Animation shared values ──────────────────────────────────────────────
  const translateY = useSharedValue(600)
  const backdropOpacity = useSharedValue(0)

  // ── Local state ──────────────────────────────────────────────────────────
  const [sheetState, setSheetState] = useState<SheetState>('input')
  const [description, setDescription] = useState('')
  const [mergeRejectFeedback, setMergeRejectFeedback] = useState('')
  const [processingId, setProcessingId] = useState<Id<'improvementRequests'> | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Convex hooks ─────────────────────────────────────────────────────────
  const generateUploadUrl = useMutation(api.improvements.mutations.generateUploadUrl)
  const submitMutation = useMutation(api.improvements.mutations.submit)
  const approveMutation = useMutation(api.improvements.mutations.approve)
  const rejectMutation = useMutation(api.improvements.mutations.reject)
  const requestSeparateMutation = useMutation(api.improvements.mutations.requestSeparate)

  const requestData = useQuery(
    api.improvements.queries.get,
    processingId ? { id: processingId } : 'skip'
  )

  // ── Watch request status changes ─────────────────────────────────────────
  useEffect(() => {
    if (!processingId || sheetState !== 'processing') return
    if (requestData?.status === 'pending_review') {
      setSheetState('result')
    }
  }, [requestData?.status, processingId, sheetState])

  // ── Animation on visibility change ───────────────────────────────────────
  useEffect(() => {
    if (visible) {
      // Reset state on open
      setSheetState('input')
      setDescription('')
      setMergeRejectFeedback('')
      setProcessingId(null)
      setIsSubmitting(false)
      translateY.value = withTiming(0, TIMING_IN)
      backdropOpacity.value = withTiming(1, TIMING_IN)
    } else {
      translateY.value = withTiming(600, TIMING_OUT)
      backdropOpacity.value = withTiming(0, TIMING_OUT)
    }
  }, [visible, backdropOpacity, translateY])

  // ── Cleanup timer on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current)
    }
  }, [])

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

      setProcessingId(requestId as Id<'improvementRequests'>)
      setSheetState('processing')
    } catch {
      // If upload/submit fails, stay on input state
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Merge: approve ────────────────────────────────────────────────────────
  const handleApproveMerge = async () => {
    if (!processingId) return
    await approveMutation({ id: processingId })
    setSheetState('success')
    successTimerRef.current = setTimeout(() => animateOut(onClose), 1000)
  }

  // ── Merge: keep separate ──────────────────────────────────────────────────
  const handleKeepSeparate = async () => {
    if (!processingId) return
    await requestSeparateMutation({ id: processingId })
    setSheetState('success')
    successTimerRef.current = setTimeout(() => animateOut(onClose), 1000)
  }

  // ── Merge: reject with feedback → re-processing ───────────────────────────
  const handleSendFeedback = async () => {
    if (!processingId || !mergeRejectFeedback.trim()) return
    await rejectMutation({ id: processingId, userFeedback: mergeRejectFeedback.trim() })
    setMergeRejectFeedback('')
    setSheetState('processing')
  }

  if (!visible) return null

  const isMergeSuggested = requestData?.agentDecision?.action === 'merge'
  const agentTitle = requestData?.title ?? ''
  const agentSummary =
    requestData?.agentDecision?.action === 'create_new'
      ? (requestData?.description ?? '')
      : ''
  const mergeReasoning = requestData?.agentDecision?.reasoning ?? ''
  const mergeTargetTitle = '' // not directly available from query result type

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
                  {sheetState === 'input' && 'Report Improvement'}
                  {sheetState === 'processing' && 'Processing...'}
                  {sheetState === 'result' &&
                    (isMergeSuggested ? 'Similar Request Found' : 'Request Created')}
                  {sheetState === 'success' && 'Done!'}
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

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.flex}
            >
              <ScrollView
                style={styles.flex}
                contentContainerStyle={styles.bodyContent}
                keyboardShouldPersistTaps="handled"
                testID={`${testID}-scroll`}
              >
                {/* ── State 1: Input ──────────────────────────────────────── */}
                {sheetState === 'input' && (
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
                )}

                {/* ── State 2: Processing ─────────────────────────────────── */}
                {sheetState === 'processing' && (
                  <View style={styles.centeredContent}>
                    <ActivityIndicator
                      size="large"
                      color={colors.primary}
                      testID={`${testID}-activity-indicator`}
                    />
                    <Text className="text-foreground text-base font-semibold mt-4 text-center">
                      Analyzing your feedback...
                    </Text>
                    <Text className="text-muted-foreground text-sm mt-1 text-center">
                      Checking for similar requests
                    </Text>
                  </View>
                )}

                {/* ── State 3: Result — New Request ───────────────────────── */}
                {sheetState === 'result' && !isMergeSuggested && (
                  <View style={styles.centeredContent}>
                    <CheckCircle2
                      size={48}
                      className="text-green-500"
                      testID={`${testID}-check-circle-icon`}
                    />
                    <Text className="text-foreground text-base font-semibold mt-4 text-center">
                      New request created
                    </Text>
                    {agentTitle ? (
                      <Text className="text-foreground text-sm font-medium mt-2 text-center">
                        {agentTitle}
                      </Text>
                    ) : null}
                    {agentSummary ? (
                      <Text className="text-muted-foreground text-sm mt-1 text-center">
                        {agentSummary}
                      </Text>
                    ) : null}

                    <Pressable
                      testID={`${testID}-done-button`}
                      onPress={dismiss}
                      className="mt-6 w-full flex-row items-center justify-center rounded-lg bg-primary py-3 active:opacity-80"
                      accessibilityRole="button"
                      accessibilityLabel="Done"
                    >
                      <Text className="text-primary-foreground text-sm font-semibold">
                        Done
                      </Text>
                    </Pressable>
                  </View>
                )}

                {/* ── State 4: Result — Merge Suggested ──────────────────── */}
                {sheetState === 'result' && isMergeSuggested && (
                  <View>
                    <View style={styles.centeredContent}>
                      <GitMerge
                        size={48}
                        className="text-primary"
                        testID={`${testID}-git-merge-icon`}
                      />
                      <Text className="text-foreground text-base font-semibold mt-4 text-center">
                        Similar request found
                      </Text>
                      {agentTitle ? (
                        <Text className="text-foreground text-sm font-medium mt-2 text-center">
                          {agentTitle}
                        </Text>
                      ) : null}
                      {mergeTargetTitle ? (
                        <Text className="text-muted-foreground text-sm mt-1 text-center">
                          Existing: {mergeTargetTitle}
                        </Text>
                      ) : null}
                      {mergeReasoning ? (
                        <View
                          className="mt-3 rounded-lg bg-muted px-3 py-2"
                          style={styles.reasoningBox}
                        >
                          <Text className="text-muted-foreground text-xs text-center">
                            {mergeReasoning}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Merge action buttons */}
                    <View style={styles.mergeActions}>
                      <Pressable
                        testID={`${testID}-approve-merge-button`}
                        onPress={handleApproveMerge}
                        className="flex-row items-center justify-center gap-2 rounded-lg py-3 active:opacity-80"
                        style={[styles.approveButton, { backgroundColor: '#22c55e' }]}
                        accessibilityRole="button"
                        accessibilityLabel="Approve merge"
                      >
                        <Check size={16} color="#ffffff" />
                        <Text className="text-sm font-semibold" style={styles.whiteText}>
                          Approve Merge
                        </Text>
                      </Pressable>

                      <Pressable
                        testID={`${testID}-keep-separate-button`}
                        onPress={handleKeepSeparate}
                        className="flex-row items-center justify-center rounded-lg border border-border py-3 active:opacity-80"
                        accessibilityRole="button"
                        accessibilityLabel="Keep separate"
                      >
                        <Text className="text-foreground text-sm font-semibold">
                          Keep Separate
                        </Text>
                      </Pressable>
                    </View>

                    {/* Reject feedback row */}
                    <View style={styles.feedbackRow}>
                      <View
                        className="flex-1 rounded-lg border bg-background px-3 py-2"
                        style={{ borderColor: colors.input }}
                      >
                        <TextInput
                          testID={`${testID}-reject-feedback-input`}
                          value={mergeRejectFeedback}
                          onChangeText={setMergeRejectFeedback}
                          placeholder="Provide feedback..."
                          placeholderTextColor={colors.mutedForeground}
                          style={[styles.feedbackInput, { color: colors.foreground }]}
                          accessibilityLabel="Rejection feedback"
                        />
                      </View>
                      <Pressable
                        testID={`${testID}-send-feedback-button`}
                        onPress={handleSendFeedback}
                        disabled={!mergeRejectFeedback.trim()}
                        className="ml-2 flex-row items-center justify-center rounded-lg bg-primary px-4 py-2 active:opacity-80"
                        style={!mergeRejectFeedback.trim() ? styles.disabledButton : undefined}
                        accessibilityRole="button"
                        accessibilityLabel="Send feedback"
                      >
                        <Text className="text-primary-foreground text-sm font-semibold">
                          Send
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* ── State 5: Success ────────────────────────────────────── */}
                {sheetState === 'success' && (
                  <View style={styles.centeredContent}>
                    <CheckCircle2
                      size={48}
                      className="text-green-500"
                      testID={`${testID}-success-icon`}
                    />
                    <Text className="text-foreground text-base font-semibold mt-4 text-center">
                      Done!
                    </Text>
                  </View>
                )}
              </ScrollView>
            </KeyboardAvoidingView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    maxHeight: '85%',
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
    fontSize: 14,
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
  centeredContent: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  mergeActions: {
    gap: 10,
    marginTop: 16,
  },
  approveButton: {
    borderRadius: 8,
  },
  whiteText: {
    color: '#ffffff',
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  feedbackInput: {
    fontSize: 14,
    lineHeight: 20,
  },
  reasoningBox: {
    width: '100%',
  },
})
