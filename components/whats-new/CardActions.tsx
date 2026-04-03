/**
 * CardActions - Action buttons for What's New cards
 *
 * Provides settings and other action buttons for news cards.
 * Features:
 * - Settings button to open subscription preferences
 * - Minimum 44x44 hitbox for accessibility
 * - Full accessibility support
 */

import React from 'react'
import { Pressable } from 'react-native'
import { Settings } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'

export interface CardActionsProps {
  /** Callback when settings button is pressed */
  onPress: () => void
  /** Optional test ID prefix */
  testID?: string
  /** Optional custom className for the container */
  className?: string
}

/**
 * CardActions component
 *
 * @example
 * ```tsx
 * <CardActions
 *   onPress={() => router.push('/settings/subscriptions')}
 *   testID="card-actions"
 * />
 * ```
 */
export function CardActions({
  onPress,
  testID = 'card-actions',
  className = '',
}: CardActionsProps) {
  const { colors } = useTheme()

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Settings"
      accessibilityHint="Open subscription preferences"
      className={`min-h-[44px] min-w-[44px] items-center justify-center rounded-full active:opacity-70 ${className}`}
    >
      <Settings
        size={16}
        color={colors.mutedForeground}
      />
    </Pressable>
  )
}

/**
 * Memoized version for performance optimization in FlatList
 */
export const CardActionsMemo = React.memo(CardActions)
