import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { FileQuestion, Inbox, Search, type LucideIcon } from '@/components/ui/icons'
import { View, type ViewProps } from 'react-native'

type EmptyStateType = 'no-results' | 'no-data' | 'error' | 'custom'

interface EmptyStateProps extends ViewProps {
  /** Type of empty state to display */
  type?: EmptyStateType
  /** Custom icon to display (overrides type default) */
  icon?: LucideIcon
  /** Main title text */
  title: string
  /** Description text */
  description?: string
  /** Action button label */
  actionLabel?: string
  /** Callback when action button is pressed */
  onActionPress?: () => void
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
}

const defaultIcons: Record<EmptyStateType, LucideIcon> = {
  'no-results': Search,
  'no-data': Inbox,
  error: FileQuestion,
  custom: Inbox,
}

const iconSizes = {
  sm: 32,
  md: 48,
  lg: 64,
}

/**
 * EmptyState displays a placeholder when no content is available.
 * Supports different types with appropriate icons and optional actions.
 */
export function EmptyState({
  type = 'no-data',
  icon,
  title,
  description,
  actionLabel,
  onActionPress,
  size = 'md',
  className,
  ...props
}: EmptyStateProps) {
  const IconComponent = icon ?? defaultIcons[type]
  const iconSize = iconSizes[size]

  const paddingClass = {
    sm: 'py-6',
    md: 'py-10',
    lg: 'py-16',
  }[size]

  return (
    <View
      className={cn('items-center justify-center', paddingClass, className)}
      testID="empty-state"
      {...props}
    >
      <View className="bg-muted mb-4 rounded-full p-4">
        <IconComponent size={iconSize} className="text-muted-foreground" />
      </View>
      <Text
        className={cn(
          'text-foreground mb-1 text-center font-semibold',
          size === 'sm' && 'text-base',
          size === 'md' && 'text-lg',
          size === 'lg' && 'text-xl'
        )}
      >
        {title}
      </Text>
      {description && (
        <Text className="text-muted-foreground mb-4 max-w-[280px] text-center text-sm">
          {description}
        </Text>
      )}
      {actionLabel && onActionPress && (
        <Button variant="outline" size="sm" onPress={onActionPress} testID="empty-state-action">
          <Text>{actionLabel}</Text>
        </Button>
      )}
    </View>
  )
}
