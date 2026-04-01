/**
 * ImprovementCardWithActions - Wrapper for ImprovementRequestCard with menu button.
 *
 * Provides a 3-dot menu button that opens the action bottom sheet.
 * The card itself is pressable for navigation.
 */

import { ImprovementRequestCard, type ImprovementRequestCardProps } from './ImprovementRequestCard'

// ── Types ──────────────────────────────────────────────────────────────────
export interface ImprovementCardWithActionsProps extends ImprovementRequestCardProps {
  onMenuPress?: () => void
}

// ── Component ──────────────────────────────────────────────────────────────
export function ImprovementCardWithActions({
  onMenuPress,
  testID,
  ...cardProps
}: ImprovementCardWithActionsProps) {
  return (
    <ImprovementRequestCard
      {...cardProps}
      onMenuPress={onMenuPress}
      testID={testID}
    />
  )
}
