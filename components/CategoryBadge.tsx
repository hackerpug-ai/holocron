import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

export type CategoryType =
  | 'research'
  | 'deep-research'
  | 'factual'
  | 'academic'
  | 'entity'
  | 'url'
  | 'general'

interface CategoryBadgeProps extends Omit<BadgeProps, 'variant'> {
  /** The category type to display */
  category: CategoryType
  /** Optional custom label (defaults to formatted category name) */
  label?: string
  /** Size variant */
  size?: 'sm' | 'md'
}

const categoryConfig: Record<CategoryType, { label: string; variant: BadgeProps['variant'] }> = {
  research: { label: 'Research', variant: 'default' },
  'deep-research': { label: 'Deep Research', variant: 'secondary' },
  factual: { label: 'Factual', variant: 'outline' },
  academic: { label: 'Academic', variant: 'secondary' },
  entity: { label: 'Entity', variant: 'outline' },
  url: { label: 'URL', variant: 'outline' },
  general: { label: 'General', variant: 'outline' },
}

/**
 * CategoryBadge displays article or research categories with semantic colors.
 * Used throughout the app to indicate content type.
 */
export function CategoryBadge({
  category,
  label,
  size = 'md',
  className,
  ...props
}: CategoryBadgeProps) {
  const config = categoryConfig[category]

  // Return null for invalid categories
  if (!config) {
    return null
  }

  const displayLabel = label ?? config.label

  return (
    <Badge
      variant={config.variant}
      className={cn(size === 'sm' && 'px-1.5 py-0', className)}
      testID={`category-badge-${category}`}
      {...props}
    >
      <Text className={cn('text-xs', size === 'sm' && 'text-[10px]')}>{displayLabel}</Text>
    </Badge>
  )
}
