/**
 * ImprovementCardWithActions - Wrapper for ImprovementRequestCard with long-press actions.
 *
 * Following the pattern from ConversationRow:
 * - Long press (400ms) triggers haptic + scale pulse
 * - Delete button fades in from right side as overlaid pill
 * - Auto-dismiss after 4 seconds
 * - Tap anywhere else to dismiss
 */

import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useEffect, useRef } from 'react'
import * as Haptics from 'expo-haptics'
import { Text } from '@/components/ui/text'
import { Trash2 } from '@/components/ui/icons'
import { ImprovementRequestCard, type ImprovementRequestCardProps } from './ImprovementRequestCard'
import { useTheme } from '@/hooks/use-theme'

// ── Types ──────────────────────────────────────────────────────────────────
export interface ImprovementCardWithActionsProps extends ImprovementRequestCardProps {
  onDelete?: () => void
  onEdit?: () => void
}

// ── Component ──────────────────────────────────────────────────────────────
export function ImprovementCardWithActions({
  onDelete,
  onEdit,
  testID,
  ...cardProps
}: ImprovementCardWithActionsProps) {
  const { colors } = useTheme()

  // ── Animation shared values ──────────────────────────────────────────────
  const rowScale = useSharedValue(1)
  const deleteOpacity = useSharedValue(0)
  const deleteScale = useSharedValue(0.8)

  // ── Local state ──────────────────────────────────────────────────────────
  const isDeleteVisibleRef = useRef(false)
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Clear auto-dismiss timer on unmount ───────────────────────────────────
  useEffect(() => {
    return () => {
      if (autoDismissTimerRef.current) {
        clearTimeout(autoDismissTimerRef.current)
      }
    }
  }, [])

  // ── Show delete button ────────────────────────────────────────────────────
  const showDeleteButton = () => {
    isDeleteVisibleRef.current = true

    // Scale pulse animation
    rowScale.value = withSequence(
      withTiming(0.97, { duration: 100 }),
      withSpring(1, { damping: 15, stiffness: 200 })
    )

    // Fade in delete button
    deleteOpacity.value = withSpring(1, { damping: 12, stiffness: 180 })
    deleteScale.value = withSpring(1, { damping: 10, stiffness: 200 })

    // Auto-dismiss after 4 seconds
    autoDismissTimerRef.current = setTimeout(() => {
      hideDeleteButton()
    }, 4000)
  }

  // ── Hide delete button ────────────────────────────────────────────────────
  const hideDeleteButton = () => {
    isDeleteVisibleRef.current = false

    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current)
      autoDismissTimerRef.current = null
    }

    deleteOpacity.value = withTiming(0, { duration: 150 })
    deleteScale.value = withTiming(0.8, { duration: 150 })
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleLongPress = () => {
    if (isDeleteVisibleRef.current) return

    // Haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

    runOnJS(showDeleteButton)()
  }

  const handleDeletePress = () => {
    // Haptic feedback
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

    hideDeleteButton()
    onDelete?.()
  }

  const handleCardPress = () => {
    if (isDeleteVisibleRef.current) {
      hideDeleteButton()
      return
    }

    cardProps.onPress?.()
  }

  // ── Animated styles ───────────────────────────────────────────────────────
  const rowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: rowScale.value }],
  }))

  const deleteButtonAnimatedStyle = useAnimatedStyle(() => ({
    opacity: deleteOpacity.value,
    transform: [{ scale: deleteScale.value }],
  }))

  return (
    <View style={styles.container}>
      <Pressable
        onPress={handleCardPress}
        onLongPress={handleLongPress}
        delayLongPress={400}
        testID={testID ?? 'improvement-card-with-actions'}
      >
        <Animated.View style={rowAnimatedStyle}>
          <ImprovementRequestCard {...cardProps} testID={undefined} />
        </Animated.View>
      </Pressable>

      {/* Delete button overlay */}
      {isDeleteVisibleRef.current && (
        <Animated.View
          style={[deleteButtonAnimatedStyle, styles.deleteButtonOverlay]}
        >
          <Pressable
            onPress={handleDeletePress}
            className="flex-row items-center gap-2 px-3 py-2 rounded-full"
            style={{ backgroundColor: colors.destructive }}
            testID={`${testID ?? 'improvement-card-with-actions'}-delete-button`}
          >
            <Trash2 size={14} color="#fff" />
            <Text style={styles.deleteButtonText}>Delete</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
  },
  deleteButtonOverlay: {
    position: 'absolute',
    right: 12,
    top: '50%',
    marginTop: -16, // Half of button height (approximate)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  deleteButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
})
