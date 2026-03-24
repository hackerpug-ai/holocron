import { CategoryBadge } from '@/components/CategoryBadge'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { ExternalLink, Wrench } from '@/components/ui/icons'
import { Pressable, View, type ViewProps } from 'react-native'

export type ToolStatus = 'complete' | 'draft' | 'archived'
export type ToolCategory = 'libraries' | 'cli' | 'framework' | 'service' | 'database' | 'tool'
export type SourceType = 'github' | 'npm' | 'pypi' | 'website' | 'cargo' | 'go' | 'other'

export interface ToolCardProps extends Omit<ViewProps, 'children'> {
  /** Tool ID */
  id: string
  /** Tool title */
  title: string
  /** Optional description */
  description?: string
  /** Content snippet */
  content?: string
  /** Category for badge display */
  category: ToolCategory
  /** Source type */
  sourceType: SourceType
  /** Source URL */
  sourceUrl?: string
  /** Tool status */
  status?: ToolStatus
  /** Programming language */
  language?: string
  /** Tags */
  tags?: string[]
  /** Callback when card is pressed */
  onPress?: () => void
  /** Show compact variant */
  compact?: boolean
}

const statusColors: Record<ToolStatus, string> = {
  complete: 'bg-success',
  draft: 'bg-warning',
  archived: 'bg-muted-foreground',
}

const sourceTypeIcons: Record<SourceType, string> = {
  github: 'GitHub',
  npm: 'npm',
  pypi: 'PyPI',
  website: 'Web',
  cargo: 'Cargo',
  go: 'Go',
  other: 'Other',
}

/**
 * ToolCard displays toolbelt tool information with category badge,
 * status indicator, and metadata.
 */
export function ToolCard({
  id,
  title,
  description,
  content,
  category,
  sourceType,
  sourceUrl,
  status = 'complete',
  language,
  tags,
  onPress,
  compact = false,
  className,
  ...props
}: ToolCardProps) {
  const hasExternalLink = !!sourceUrl

  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'bg-card border-border rounded-lg border p-4 active:bg-muted/50',
        compact && 'p-3',
        className
      )}
      testID={`tool-card-${id}`}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${category} tool. Status: ${status}`}
      {...props}
    >
      {/* Header: Title + Status + External Link */}
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 flex-row items-center gap-2">
          <Wrench size={16} className="text-primary shrink-0" />
          <Text
            className={cn('flex-1 font-semibold text-foreground', compact ? 'text-sm' : 'text-base')}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          {/* Status indicator */}
          <View
            className={cn('h-2 w-2 rounded-full', statusColors[status])}
            testID={`tool-status-${status}`}
          />
          {/* External link indicator */}
          {hasExternalLink && (
            <ExternalLink size={14} className="text-muted-foreground" />
          )}
        </View>
      </View>

      {/* Description or content snippet */}
      {(description || content) && !compact && (
        <Text className="text-muted-foreground mt-2 text-sm" numberOfLines={2}>
          {description || content?.slice(0, 150) + (content && content.length > 150 ? '...' : '')}
        </Text>
      )}

      {/* Footer: Category + Source Type + Language */}
      <View className="mt-3 flex-row flex-wrap items-center gap-2">
        <CategoryBadge category="toolbelt" size="sm" />

        {/* Source type */}
        <View className="bg-muted rounded px-1.5 py-0.5">
          <Text className="text-muted-foreground text-xs">
            {sourceTypeIcons[sourceType]}
          </Text>
        </View>

        {/* Language badge */}
        {language && (
          <View className="rounded bg-info/20 px-1.5 py-0.5">
            <Text className="text-xs text-info">{language}</Text>
          </View>
        )}
      </View>

      {/* Tags (non-compact only) */}
      {tags && tags.length > 0 && !compact && (
        <View className="mt-2 flex-row flex-wrap gap-1">
          {tags.slice(0, 4).map((tag, index) => (
            <View key={index} className="bg-muted/50 rounded px-1.5 py-0.5">
              <Text className="text-muted-foreground text-xs">{tag}</Text>
            </View>
          ))}
          {tags.length > 4 && (
            <Text className="text-muted-foreground text-xs">+{tags.length - 4}</Text>
          )}
        </View>
      )}
    </Pressable>
  )
}
