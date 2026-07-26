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

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createImprovement } from '@/app/zero/improvements';
import { ImageUploadStatus } from '@/components/improvements/ImageUploadStatus';
import { ImprovementPreviewThumbnail } from '@/components/improvements/ImprovementPreviewThumbnail';
import { X } from '@/components/ui/icons';
import { Text } from '@/components/ui/text';
import { useFileObjectByContentHash } from '@/hooks/use-file-object-by-content-hash';
import {
  type ImageUploadMachineState,
  type ImageUploadPhase,
  initialImageUploadState,
  reduceImageUpload,
  uploadImprovementImage,
} from '@/hooks/use-image-upload';
import { useTheme } from '@/hooks/use-theme';
import { resolveAttachImageUriAsync } from '@/lib/e2e/fixture-uri';

// ── Animation constants (mirrors PlanEditBottomSheet) ──────────────────────
const TIMING_IN = { duration: 300, easing: Easing.out(Easing.cubic) };
const TIMING_OUT = { duration: 250, easing: Easing.in(Easing.cubic) };
const DISMISS_THRESHOLD = 80;

// ── Types ──────────────────────────────────────────────────────────────────
export interface ImprovementSubmitSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmitted?: (requestId: string) => void;
  screenshotUri?: string | null;
  sourceComponent?: string;
  testID?: string;
  /**
   * Optional seed for the image-upload state machine (tests / long-press pre-attach).
   * When provided on open, takes precedence over screenshotUri-only preview seed.
   */
  imageUploadSeed?: Partial<ImageUploadMachineState>;
}

// ── Component ──────────────────────────────────────────────────────────────
export function ImprovementSubmitSheet({
  visible,
  onClose,
  onSubmitted,
  screenshotUri,
  sourceComponent,
  testID = 'improvement-submit-sheet',
  imageUploadSeed,
}: ImprovementSubmitSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors, typography, spacing } = useTheme();
  const styles = useStyles(typography, spacing);

  // ── Animation shared values ──────────────────────────────────────────────
  const translateY = useSharedValue(600);
  const backdropOpacity = useSharedValue(0);

  // ── Local state ──────────────────────────────────────────────────────────
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Text-only submit succeeded (no image) — never claims upload-success / CAS. */
  const [textSubmitSucceeded, setTextSubmitSucceeded] = useState(false);
  /** ONE image upload state machine (idle → preview → uploading → success|error). */
  const [imageUpload, setImageUpload] = useState(() =>
    initialImageUploadState(
      imageUploadSeed ?? (screenshotUri ? { phase: 'preview', imageUri: screenshotUri } : undefined)
    )
  );
  const submittedRequestIdRef = useRef<string | null>(null);
  const didNotifySubmittedRef = useRef(false);

  const imageUri = imageUpload.imageUri;
  const imageState: ImageUploadPhase = imageUpload.phase;
  const imageError = imageUpload.error;
  const imageDimensions = imageUpload.dimensions;
  const finalizedContentHash = imageUpload.result?.contentHash ?? null;

  // Post-finalize Zero observation — content_hash CAS row via builder query.
  const { row: zeroFileObject } = useFileObjectByContentHash(
    imageState === 'success' ? finalizedContentHash : null
  );

  // ── Animation on visibility change ───────────────────────────────────────
  useEffect(() => {
    if (visible) {
      // Reset state on open
      setDescription('');
      setIsSubmitting(false);
      setTextSubmitSucceeded(false);
      setImageUpload(
        initialImageUploadState(
          imageUploadSeed ??
            (screenshotUri ? { phase: 'preview', imageUri: screenshotUri } : undefined)
        )
      );
      submittedRequestIdRef.current = null;
      didNotifySubmittedRef.current = false;
      translateY.value = withTiming(0, TIMING_IN);
      backdropOpacity.value = withTiming(1, TIMING_IN);
    } else {
      translateY.value = withTiming(600, TIMING_OUT);
      backdropOpacity.value = withTiming(0, TIMING_OUT);
    }
  }, [screenshotUri, imageUploadSeed, visible, backdropOpacity, translateY]);

  useEffect(() => {
    // Do not re-attach during upload/error/success — attach would clobber those phases.
    if (!imageUri || imageDimensions) return;
    if (imageState === 'uploading' || imageState === 'error' || imageState === 'success') return;
    Image.getSize(
      imageUri,
      (width, height) =>
        setImageUpload((prev) =>
          reduceImageUpload(prev, { type: 'attach', uri: imageUri, dimensions: { width, height } })
        ),
      () => {
        /* keep preview without dimensions if getSize fails */
      }
    );
  }, [imageUri, imageDimensions, imageState]);

  // ── Animated styles ───────────────────────────────────────────────────────
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(translateY.value, 0) }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  // ── Dismiss helpers ───────────────────────────────────────────────────────
  const animateOut = (callback: () => void) => {
    translateY.value = withTiming(600, TIMING_OUT);
    backdropOpacity.value = withTiming(0, TIMING_OUT);
    setTimeout(callback, 250);
  };

  const dismiss = () => animateOut(onClose);

  // ── Pan gesture (swipe-to-dismiss) ────────────────────────────────────────
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD) {
        translateY.value = withTiming(600, TIMING_OUT);
        backdropOpacity.value = withTiming(0, TIMING_OUT);
        runOnJS(onClose)();
      } else {
        translateY.value = withTiming(0, TIMING_IN);
      }
    });

  // ── Submit handler ────────────────────────────────────────────────────────
  const handleAttach = () => {
    // Prefer explicit seed (long-press capture), else deterministic e2e fixture
    // resolved via expo-asset localUri so fetch/blob upload can read bytes.
    void (async () => {
      const uri = await resolveAttachImageUriAsync(screenshotUri);
      if (!uri) {
        setImageUpload((prev) =>
          reduceImageUpload(prev, {
            type: 'fail',
            error: 'No image is available to attach yet.',
          })
        );
        return;
      }
      setTextSubmitSucceeded(false);
      setImageUpload((prev) =>
        reduceImageUpload(prev, {
          type: 'attach',
          uri,
          dimensions: { width: 800, height: 600 },
        })
      );
    })();
  };

  const handleSubmit = async () => {
    if (!description.trim() || isSubmitting || imageState === 'success') return;
    Keyboard.dismiss();
    setIsSubmitting(true);
    setTextSubmitSucceeded(false);
    if (imageUri) {
      setImageUpload((prev) => reduceImageUpload(prev, { type: 'start_upload' }));
    }

    try {
      const title =
        description.trim().length > 60
          ? `${description.trim().slice(0, 57)}...`
          : description.trim();

      const requestId =
        submittedRequestIdRef.current ??
        (await createImprovement({
          description: description.trim(),
          title,
          sourceScreen: sourceComponent ?? 'unknown',
          sourceComponent: sourceComponent ?? null,
        }));
      submittedRequestIdRef.current = requestId;

      if (imageUri) {
        const imageResponse = await fetch(imageUri);
        if (!imageResponse.ok && imageResponse.status !== 0) {
          throw new Error(`image read failed: ${imageResponse.status}`);
        }
        const blob = await imageResponse.blob();
        // Success only after finalize (uploadImprovementImage → uploadBlobThroughLifecycle).
        const result = await uploadImprovementImage({
          targetId: requestId,
          idempotencyKey: `improvement-image-${requestId}`,
          blob,
          mimeType: blob.type || 'image/jpeg',
          originalName: 'improvement-image.jpg',
        });
        // ANTI-STUB: never claim upload-success without a 64-hex content hash.
        if (!result.contentHash || !/^[0-9a-f]{64}$/i.test(result.contentHash)) {
          throw new Error('upload finalize returned no content-addressed hash');
        }
        setImageUpload((prev) => reduceImageUpload(prev, { type: 'finalize_success', result }));
      } else {
        // Text-only improvement submit — MUST NOT set image phase success / upload-success.
        setTextSubmitSucceeded(true);
      }

      setIsSubmitting(false);
      if (!didNotifySubmittedRef.current) {
        didNotifySubmittedRef.current = true;
        onSubmitted?.(requestId);
      }
    } catch (error) {
      setIsSubmitting(false);
      setImageUpload((prev) =>
        reduceImageUpload(prev, {
          type: 'fail',
          error: error instanceof Error ? error.message : 'Image upload failed.',
        })
      );
    }
  };

  const finish = () => animateOut(onClose);

  if (!visible) return null;

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
        <Pressable onPress={dismiss} testID={`${testID}-backdrop`} style={styles.flex}>
          <Animated.View style={[backdropStyle, styles.flex, styles.backdrop]} />
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
                <View style={[styles.handle, { backgroundColor: `${colors.mutedForeground}4D` }]} />
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
                keyboardDismissMode="on-drag"
                testID={`${testID}-scroll`}
              >
                {/* ── Input ──────────────────────────────────────────────── */}
                <View>
                  <Pressable
                    testID="attach-button"
                    onPress={handleAttach}
                    accessibilityRole="button"
                    accessibilityLabel={imageUri ? 'Change image attachment' : 'Attach image'}
                    className="mb-3 flex-row items-center justify-center rounded-lg border border-border py-3 active:opacity-80"
                  >
                    <Text className="text-foreground text-sm font-semibold">
                      {imageUri ? 'Change image' : 'Attach image'}
                    </Text>
                  </Pressable>

                  {/* Screenshot/image preview — real fixture dimensions when known */}
                  {imageUri ? (
                    <ImprovementPreviewThumbnail
                      uri={imageUri}
                      width={imageDimensions?.width ?? 1}
                      height={imageDimensions?.height ?? 1}
                    />
                  ) : null}

                  <ImageUploadStatus
                    phase={imageState}
                    error={imageError}
                    canRetry={Boolean(imageUri)}
                    onRetry={handleSubmit}
                    zeroContentHash={finalizedContentHash}
                    zeroSynced={Boolean(zeroFileObject?.content_hash)}
                  />

                  {/* Text-only submit ack — distinct from CAS upload-success (anti-stub). */}
                  {textSubmitSucceeded && imageState !== 'success' ? (
                    <View testID="text-submit-success" className="mb-3">
                      <Text className="text-success text-sm font-semibold">
                        Improvement submitted
                      </Text>
                    </View>
                  ) : null}

                  {/* Description input */}
                  <View
                    className="rounded-lg border bg-background px-4 py-3"
                    style={{ borderColor: colors.input, minHeight: 80 }}
                  >
                    <TextInput
                      testID={`${testID}-description-input`}
                      value={description}
                      onChangeText={setDescription}
                      placeholder="Describe the improvement or bug..."
                      placeholderTextColor={colors.mutedForeground}
                      multiline
                      blurOnSubmit
                      returnKeyType="done"
                      onSubmitEditing={() => Keyboard.dismiss()}
                      style={[styles.textInput, { color: colors.foreground, minHeight: 64 }]}
                      accessibilityLabel="Description input"
                    />
                  </View>
                </View>
              </ScrollView>

              {/* Fixed footer so Submit stays above keyboard (Maestro + real UX). */}
              <View
                style={[styles.footer, { borderTopColor: colors.border }]}
                testID={`${testID}-footer`}
              >
                <View style={styles.buttonRow}>
                  <Pressable
                    testID={`${testID}-cancel-button`}
                    onPress={dismiss}
                    className="flex-1 flex-row items-center justify-center rounded-lg border border-border py-3 active:opacity-80"
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                  >
                    <Text className="text-foreground text-sm font-semibold">Cancel</Text>
                  </Pressable>

                  <Pressable
                    testID={`${testID}-submit-button`}
                    onPress={handleSubmit}
                    disabled={!description.trim() || isSubmitting || imageState === 'success'}
                    className="flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-primary py-3 active:opacity-80"
                    style={
                      !description.trim() || isSubmitting || imageState === 'success'
                        ? styles.disabledButton
                        : undefined
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Submit"
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color={colors.primaryForeground} />
                    ) : (
                      <Text className="text-primary-foreground text-sm font-semibold">Submit</Text>
                    )}
                  </Pressable>

                  {imageState === 'success' ? (
                    <Pressable
                      testID="upload-done"
                      onPress={finish}
                      className="flex-1 flex-row items-center justify-center rounded-lg border border-border py-3 active:opacity-80"
                      accessibilityRole="button"
                      accessibilityLabel="Done"
                    >
                      <Text className="text-foreground text-sm font-semibold">Done</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const useStyles = (
  typography: { bodySmall: { fontSize: number } },
  _spacing: Record<string, number>
) => {
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
      paddingBottom: 12,
    },
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
    },
    textInput: {
      fontSize: typography.bodySmall.fontSize,
      lineHeight: 20,
      textAlignVertical: 'top',
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 12,
    },
    disabledButton: {
      opacity: 0.5,
    },
  });
};
