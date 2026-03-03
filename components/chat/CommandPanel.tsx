import { View, Pressable, StyleSheet } from 'react-native'
import { SlashCommandMenu, type SlashCommand } from '@/components/SlashCommandMenu'

export interface CommandPanelProps {
  /** Whether the panel is visible */
  visible: boolean
  /** Filter string to narrow down commands (text after /) */
  filter?: string
  /** Callback when a command is selected */
  onSelect: (command: SlashCommand) => void
  /** Callback when user taps outside to dismiss */
  onDismiss?: () => void
}

/**
 * CommandPanel wraps SlashCommandMenu with positioning for chat input integration.
 * Appears as a floating panel above the input bar with dismiss backdrop.
 *
 * @see US-020 - Design CommandPanel component
 * @see US-023 - Implement real-time filtering and dismiss
 */
export function CommandPanel({
  visible,
  filter = '',
  onSelect,
  onDismiss,
}: CommandPanelProps) {
  if (!visible) return null

  return (
    <View testID="command-panel" className="z-10">
      {/* Backdrop - captures taps outside the menu to dismiss */}
      <Pressable
        testID="command-panel-backdrop"
        style={styles.backdrop}
        onPress={onDismiss}
      />
      {/* Menu content positioned above backdrop */}
      <SlashCommandMenu
        visible={true}
        filter={filter}
        onSelect={onSelect}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: 0,
  },
})

// Re-export SlashCommand type for convenience
export type { SlashCommand } from '@/components/SlashCommandMenu'
