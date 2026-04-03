import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import type { DocumentCategory } from '@/convex/lib/categories'

// Re-export for backward compatibility
export type CategoryType = DocumentCategory

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
  'deep-research': { label: 'Deep Research', variant: 'default' },
  factual: { label: 'Factual', variant: 'secondary' },
  academic: { label: 'Academic', variant: 'secondary' },
  entity: { label: 'Entity', variant: 'outline' },
  url: { label: 'URL', variant: 'outline' },
  general: { label: 'General', variant: 'outline' },
  patterns: { label: 'Patterns', variant: 'secondary' },
  business: { label: 'Business', variant: 'secondary' },
  'technical-analysis': { label: 'Technical', variant: 'outline' },
  platforms: { label: 'Platforms', variant: 'outline' },
  libraries: { label: 'Libraries', variant: 'outline' },
  'claude-code-configuration': { label: 'Claude Config', variant: 'outline' },
  toolbelt: { label: 'Toolbelt', variant: 'default' },
  'revenue-validation': { label: 'Revenue', variant: 'secondary' },
  'competitive-analysis': { label: 'Competitive', variant: 'secondary' },
  'ai-roi': { label: 'AI ROI', variant: 'default' },
  flights: { label: 'Flights', variant: 'outline' },
  'creator-analysis': { label: 'Creator', variant: 'secondary' },
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
