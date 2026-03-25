import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import {
  Code,
  Database,
  ExternalLink,
  Globe,
  Package,
  Terminal,
  Wrench,
} from '@/components/ui/icons'
import type { LucideIcon } from '@/components/ui/icons'
import { Pressable, View, type ViewProps } from 'react-native'

export type ToolStatus = 'complete' | 'draft' | 'archived'
export type ToolCategory = 'libraries' | 'cli' | 'framework' | 'service' | 'database' | 'tool'
export type SourceType = 'github' | 'npm' | 'pypi' | 'website' | 'cargo' | 'go' | 'other'

export interface ToolCardProps extends Omit<ViewProps, 'children'> {
  id: string
  title: string
  description?: string
  content?: string
  category: ToolCategory
  sourceType: SourceType
  sourceUrl?: string
  status?: ToolStatus
  language?: string
  tags?: string[]
  onPress?: () => void
  compact?: boolean
}

const categoryMeta: Record<ToolCategory, { label: string; icon: LucideIcon; accent: string }> = {
  libraries: { label: 'Library', icon: Package, accent: 'text-blue-400' },
  cli: { label: 'CLI', icon: Terminal, accent: 'text-green-400' },
  framework: { label: 'Framework', icon: Code, accent: 'text-purple-400' },
  service: { label: 'Service', icon: Globe, accent: 'text-amber-400' },
  database: { label: 'Database', icon: Database, accent: 'text-rose-400' },
  tool: { label: 'Tool', icon: Wrench, accent: 'text-cyan-400' },
}

const sourceLabels: Record<SourceType, string> = {
  github: 'GitHub',
  npm: 'npm',
  pypi: 'PyPI',
  website: 'Web',
  cargo: 'Cargo',
  go: 'Go',
  other: 'Other',
}

const statusIndicator: Record<ToolStatus, { color: string; label: string }> = {
  complete: { color: 'bg-emerald-500', label: 'Complete' },
  draft: { color: 'bg-amber-500', label: 'Draft' },
  archived: { color: 'bg-muted-foreground', label: 'Archived' },
}

/**
 * ToolCard - distinctive card for toolbelt items with category-colored
 * icon accent and clear source/language metadata.
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
  const meta = categoryMeta[category]
  const CategoryIcon = meta.icon
  const statusMeta = statusIndicator[status]

  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'rounded-xl border border-border bg-card active:bg-muted/60',
        compact ? 'p-3' : 'p-4',
        className
      )}
      testID={`tool-card-${id}`}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${meta.label}. Status: ${statusMeta.label}`}
      {...props}
    >
      {/* Top row: Category icon + Title + Status/Link */}
      <View className="flex-row items-start gap-3">
        {/* Category icon with colored background */}
        <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-lg bg-muted">
          <CategoryIcon size={18} className={meta.accent} />
        </View>

        {/* Title + source line */}
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text
              className={cn('flex-1 font-semibold text-foreground', compact ? 'text-sm' : 'text-base')}
              numberOfLines={1}
            >
              {title}
            </Text>
            {/* Status dot */}
            <View className={cn('h-2 w-2 rounded-full', statusMeta.color)} />
            {sourceUrl && (
              <ExternalLink size={13} className="text-muted-foreground" />
            )}
          </View>

          {/* Source + language inline */}
          <View className="mt-0.5 flex-row items-center gap-1.5">
            <Text className="text-xs text-muted-foreground">
              {sourceLabels[sourceType]}
            </Text>
            {language && (
              <>
                <Text className="text-xs text-muted-foreground/40">{'/'}</Text>
                <Text className="text-xs text-primary">{language}</Text>
              </>
            )}
          </View>
        </View>
      </View>

      {/* Description */}
      {(description || content) && !compact && (
        <Text className="mt-2.5 pl-12 text-sm leading-5 text-muted-foreground" numberOfLines={2}>
          {description || (content ? content.slice(0, 150) + (content.length > 150 ? '...' : '') : '')}
        </Text>
      )}

      {/* Tags */}
      {tags && tags.length > 0 && !compact && (
        <View className="mt-2.5 flex-row flex-wrap gap-1.5 pl-12">
          {tags.slice(0, 5).map((tag, index) => (
            <View key={index} className="rounded-md bg-muted px-2 py-0.5">
              <Text className="text-[11px] text-muted-foreground">{tag}</Text>
            </View>
          ))}
          {tags.length > 5 && (
            <View className="rounded-md bg-muted/50 px-2 py-0.5">
              <Text className="text-[11px] text-muted-foreground">+{tags.length - 5}</Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  )
}
