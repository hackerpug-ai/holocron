/**
 * ImprovementActionMenu - Action menu for improvement items with edit and delete options.
 *
 * Following the pattern from ConversationActionMenu:
 * - Three-state flow: menu → edit → delete (confirmation)
 * - Positioned at right:0, top:0
 * - Fade in/out animations
 * - AlertDialog for delete confirmation
 */

import React, { useEffect, useState } from 'react'
import { Pressable, View, StyleSheet } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
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

// ── Types ──────────────────────────────────────────────────────────────────
type ViewState = 'menu' | 'delete'

export interface ImprovementActionMenuProps {
  open: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
  isDeleting?: boolean
  testID?: string
}

// ── Component ──────────────────────────────────────────────────────────────
export function ImprovementActionMenu({
  open,
  onClose,
  onEdit,
  onDelete,
  isDeleting = false,
  testID = 'improvement-action-menu',
}: ImprovementActionMenuProps) {
  // ── Animation shared values ──────────────────────────────────────────────
  const opacity = useSharedValue(0)
  const scale = useSharedValue(0.95)

  // ── Animate in/out on open change ────────────────────────────────────────
  useEffect(() => {
    if (open) {
      opacity.value = withTiming(1, { duration: 150 })
      scale.value = withTiming(1, { duration: 150 })
    } else {
      opacity.value = withTiming(0, { duration: 100 })
      scale.value = withTiming(0.95, { duration: 100 })
    }
  }, [open, opacity, scale])

  // ── Animated styles ───────────────────────────────────────────────────────
  const menuAnimatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }))

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleEdit = () => {
    onClose()
    onEdit()
  }

  const handleDelete = () => {
    setViewState('delete')
  }

  const confirmDelete = async () => {
    await onDelete()
    setViewState('menu')
    onClose()
  }

  const [viewState, setViewState] = useState<ViewState>('menu')

  // Reset state when menu closes
  useEffect(() => {
    if (!open) {
      setViewState('menu')
    }
  }, [open])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <Pressable
        onPress={onClose}
        style={styles.backdrop}
        testID={`${testID}-backdrop`}
        pointerEvents="box-none"
      >
        {/* Menu */}
        {viewState === 'menu' && (
          <View style={styles.menuContainer} pointerEvents="box-none">
            <Animated.View
              style={[menuAnimatedStyle, styles.menu]}
              className="right-0 top-0 w-56 rounded-md bg-card shadow-lg border border-border"
            >
              <Pressable
                onPress={handleEdit}
                className="flex-row items-center gap-3 px-4 py-3 active:bg-muted"
                testID={`${testID}-edit-button`}
                accessibilityRole="button"
                accessibilityLabel="Edit"
              >
                <Pencil size={16} className="text-foreground" />
                <Text className="text-foreground text-sm">Edit</Text>
              </Pressable>

              <Pressable
                onPress={handleDelete}
                className="flex-row items-center gap-3 px-4 py-3 active:bg-muted"
                testID={`${testID}-delete-button`}
                accessibilityRole="button"
                accessibilityLabel="Delete"
              >
                <Trash2 size={16} className="text-destructive" />
                <Text className="text-destructive text-sm">Delete</Text>
              </Pressable>
            </Animated.View>
          </View>
        )}
      </Pressable>

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
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  menuContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    bottom: 0,
    alignItems: 'flex-end',
    paddingTop: 8,
    paddingRight: 12,
  },
  menu: {
    overflow: 'hidden',
  },
})
