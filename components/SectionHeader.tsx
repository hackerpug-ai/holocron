import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { ChevronRight } from '@/components/ui/icons'
import { Pressable, View, type ViewProps } from 'react-native'

interface SectionHeaderProps extends ViewProps {
  /** Section title text */
  title: string
  /** Optional action button label */
  actionLabel?: string
  /** Callback when action button is pressed */
  onActionPress?: () => void
  /** Whether to show chevron icon with action */
  showChevron?: boolean
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
}

/**
 * SectionHeader displays a section title with an optional action button.
 * Used to introduce content sections throughout the app.
 */
export function SectionHeader({
  title,
  actionLabel,
  onActionPress,
  showChevron = true,
  size = 'md',
  className,
  ...props
}: SectionHeaderProps) {
  const titleVariant = {
    sm: 'text-sm font-medium',
    md: 'text-base font-semibold',
    lg: 'text-lg font-semibold',
  }[size]

  return (
    <View
      className={cn('flex-row items-center justify-between py-2', className)}
      testID="section-header"
      {...props}
    >
      <Text className={cn('text-foreground', titleVariant)}>{title}</Text>
      {actionLabel && onActionPress && (
        <Pressable
          onPress={onActionPress}
          className="flex-row items-center gap-0.5 active:opacity-70"
          testID="section-header-action"
        >
          <Text className="text-primary text-sm">{actionLabel}</Text>
          {showChevron && <ChevronRight size={16} className="text-primary" />}
        </Pressable>
      )}
    </View>
  )
}
