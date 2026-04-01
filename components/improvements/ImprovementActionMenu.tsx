/**
 * ImprovementActionBottomSheet - Bottom sheet action menu for improvement items.
 *
 * Replaces the dropdown menu with a bottom sheet pattern consistent with other sheets:
 * - Three-state flow: menu → delete (confirmation)
 * - Slides up from bottom with grow-upward animation
 * - Pan gesture to dismiss
 * - Backdrop tap to dismiss
 * - AlertDialog for delete confirmation
 *
 * Follows the animation pattern from ImprovementEditSheet:
 * - Modal transparent, animationType="none"
 * - Animated backdrop tap-to-dismiss
 * - Timing: IN 300ms Easing.out(cubic), OUT 250ms Easing.in(cubic)
 */

import React, { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
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
import { Text } from '@/components/ui/text'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Pencil, Trash2 } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'

// ── Animation constants (mirrors ImprovementEditSheet) ──────────────────────
const TIMING_IN = { duration: 300, easing: Easing.out(Easing.cubic) }
const TIMING_OUT = { duration: 250, easing: Easing.in(Easing.cubic) }
const DISMISS_THRESHOLD = 80

// ── Types ──────────────────────────────────────────────────────────────────
type ViewState = 'menu' | 'delete'

export interface ImprovementActionBottomSheetProps {
  open: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
  isDeleting?: boolean
  testID?: string
}

// ── Component ──────────────────────────────────────────────────────────────
export function ImprovementActionBottomSheet({
  open,
  onClose,
  onEdit,
  onDelete,
  isDeleting = false,
  testID = 'improvement-action-bottom-sheet',
}: ImprovementActionBottomSheetProps) {
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()

  // ── Animation shared values ──────────────────────────────────────────────
  const translateY = useSharedValue(400)
  const backdropOpacity = useSharedValue(0)

  // ── Local state ──────────────────────────────────────────────────────────
  const [viewState, setViewState] = useState<ViewState>('menu')

  // ── Reset state when menu closes ───────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setViewState('menu')
    }
  }, [open])

  // ── Animation on visibility change ───────────────────────────────────────
  useEffect(() => {
    if (open) {
      translateY.value = withTiming(0, TIMING_IN)
      backdropOpacity.value = withTiming(1, TIMING_IN)
    } else {
      translateY.value = withTiming(400, TIMING_OUT)
      backdropOpacity.value = withTiming(0, TIMING_OUT)
    }
  }, [open, backdropOpacity, translateY])

  // ── Animated styles ───────────────────────────────────────────────────────
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(translateY.value, 0) }],
  }))

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  // ── Dismiss helpers ───────────────────────────────────────────────────────
  const animateOut = (callback: () => void) => {
    translateY.value = withTiming(400, TIMING_OUT)
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
        translateY.value = withTiming(400, TIMING_OUT)
        backdropOpacity.value = withTiming(0, TIMING_OUT)
        runOnJS(onClose)()
      } else {
        translateY.value = withTiming(0, TIMING_IN)
      }
    })

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleEdit = () => {
    animateOut(() => {
      onClose()
      onEdit()
    })
  }

  const handleDelete = () => {
    setViewState('delete')
  }

  const confirmDelete = async () => {
    await onDelete()
    setViewState('menu')
    animateOut(onClose)
  }

  if (!open) return null

  return (
    <>
      <Modal
        transparent
        visible={open}
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

              {/* Menu options */}
              <View style={styles.content}>
                <Pressable
                  onPress={handleEdit}
                  className="flex-row items-center gap-3 px-4 py-3 active:bg-muted border-b border-border"
                  testID={`${testID}-edit-button`}
                  accessibilityRole="button"
                  accessibilityLabel="Edit"
                >
                  <Pencil size={20} className="text-foreground" />
                  <Text className="text-foreground text-base">Edit</Text>
                </Pressable>

                <Pressable
                  onPress={handleDelete}
                  className="flex-row items-center gap-3 px-4 py-3 active:bg-muted"
                  testID={`${testID}-delete-button`}
                  accessibilityRole="button"
                  accessibilityLabel="Delete"
                >
                  <Trash2 size={20} className="text-destructive" />
                  <Text className="text-destructive text-base">Delete</Text>
                </Pressable>
              </View>
            </Animated.View>
          </GestureDetector>
        </GestureHandlerRootView>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={viewState === 'delete'} onOpenChange={(open) => !open && setViewState('menu')}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete improvement?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. The improvement will be permanently removed.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel
              onPress={() => setViewState('menu')}
              testID={`${testID}-cancel-delete`}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive"
              onPress={confirmDelete}
              testID={`${testID}-confirm-delete`}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
  content: {
    paddingTop: 8,
    paddingBottom: 8,
  },
})

// ── Backward-compatible export ──────────────────────────────────────────────
// Export as ImprovementActionMenu for backward compatibility
export { ImprovementActionBottomSheet as ImprovementActionMenu }

