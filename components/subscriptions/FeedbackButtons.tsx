/**
 * FeedbackButtons - Thumbs up/down feedback component for cards
 *
 * Provides subtle, accessible feedback controls for users to indicate
 * whether they like or dislike content. Features:
 * - Minimum 44x44 hitbox for accessibility
 * - Toggle behavior (tap to select, tap again to deselect)
 * - Only one selection active at a time
 * - Visual feedback theme-appropriate colors
 * - Full accessibility support
 */

import React from 'react'
import { View, Pressable } from 'react-native'
import { ThumbsUp, ThumbsDown } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'

export type FeedbackType = 'positive' | 'negative' | null

export interface FeedbackButtonsProps {
  /** Unique identifier for the content item this feedback applies to */
  findingId: string
  /** Current feedback state (null = none selected) */
  currentFeedback?: FeedbackType
  /** Callback when feedback state changes */
  onFeedback: (type: FeedbackType) => void
  /** Optional test ID prefix */
  testID?: string
  /** Optional custom className for the container */
  className?: string
}

/**
 * FeedbackButtons component
 *
 * @example
 * ```tsx
 * <FeedbackButtons
 *   findingId="finding-123"
 *   currentFeedback="positive"
 *   onFeedback={(type) => handleFeedback(findingId, type)}
 *   testID="card-feedback"
 * />
 * ```
 */
export function FeedbackButtons({
  findingId: _findingId,
  currentFeedback,
  onFeedback,
  testID = 'feedback-buttons',
  className = '',
}: FeedbackButtonsProps) {
  const { colors } = useTheme()
  const isPositive = currentFeedback === 'positive'
  const isNegative = currentFeedback === 'negative'

  const handleThumbsUp = () => {
    // Toggle: if already positive, deselect; otherwise select positive
    onFeedback(isPositive ? null : 'positive')
  }

  const handleThumbsDown = () => {
    // Toggle: if already negative, deselect; otherwise select negative
    onFeedback(isNegative ? null : 'negative')
  }

  return (
    <View
      className={`flex-row gap-2 ${className}`}
      testID={testID}
      accessible={false}
    >
      <Pressable
        testID={`${testID}-thumbs-up`}
        onPress={handleThumbsUp}
        accessibilityRole="button"
        accessibilityLabel={isPositive ? 'More like this (selected)' : 'More like this'}
        accessibilityHint={isPositive ? 'Tap to undo' : 'Tap to like'}
        accessibilityState={{ selected: isPositive }}
        className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full active:opacity-70"
        style={{
          backgroundColor: isPositive ? `${colors.primary}15` : 'transparent',
        }}
      >
        <ThumbsUp
          size={14}
          color={isPositive ? colors.primary : colors.mutedForeground}
          fill={isPositive ? colors.primary : undefined}
        />
      </Pressable>

      <Pressable
        testID={`${testID}-thumbs-down`}
        onPress={handleThumbsDown}
        accessibilityRole="button"
        accessibilityLabel={isNegative ? 'Less like this (selected)' : 'Less like this'}
        accessibilityHint={isNegative ? 'Tap to undo' : 'Tap to dislike'}
        accessibilityState={{ selected: isNegative }}
        className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full active:opacity-70"
        style={{
          backgroundColor: isNegative ? `${colors.danger}15` : 'transparent',
        }}
      >
        <ThumbsDown
          size={14}
          color={isNegative ? colors.danger : colors.mutedForeground}
          fill={isNegative ? colors.danger : undefined}
        />
      </Pressable>
    </View>
  )
}

/**
 * Memoized version for performance optimization in FlatList
 */
export const FeedbackButtonsMemo = React.memo(FeedbackButtons)