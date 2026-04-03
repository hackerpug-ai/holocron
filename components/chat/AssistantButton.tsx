import { Pressable } from 'react-native'
import { WandSparkles } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { useTheme } from '@/hooks/use-theme'

export interface AssistantButtonProps {
  /** Whether the button is currently active/pressed */
  isActive?: boolean
  /** Whether the button is disabled */
  disabled?: boolean
  /** Callback when button is pressed */
  onPress: () => void
  /** testID for testing */
  testID?: string
}

/**
 * Assistant button for opening the command panel/assistant menu.
 * Positioned inside the chat input field on the right side.
 */
export function AssistantButton({
  isActive = false,
  disabled = false,
  onPress,
  testID = 'assistant-button',
}: AssistantButtonProps) {
  const { colors: themeColors } = useTheme()

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      className={cn(
        'h-8 w-8 items-center justify-center rounded-full',
        isActive ? 'bg-primary' : 'bg-muted'
      )}
    >
      <WandSparkles
        size={18}
        color={isActive ? themeColors.primaryForeground : themeColors.foreground}
      />
    </Pressable>
  )
}
