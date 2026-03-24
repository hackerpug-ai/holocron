/**
 * ToolSearchResultsCard - Display toolbelt search results
 */

import { View, Pressable, Linking } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { Wrench, Search, ExternalLink, Tag, Code } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import type { ToolSearchResultsCardData } from '@/lib/types/chat'

export interface ToolSearchResultsCardProps {
  data: ToolSearchResultsCardData
  testID?: string
}

/**
 * Get icon for source type
 */
function getSourceIcon(sourceType: string) {
  switch (sourceType) {
    case 'documentation':
      return '📚'
    case 'library':
      return '📦'
    case 'framework':
      return '🏗️'
    case 'tool':
      return '🔧'
    case 'api':
      return '🔌'
    case 'tutorial':
      return '📖'
    default:
      return '🛠️'
  }
}

export function ToolSearchResultsCard({
  data,
  testID = 'tool-search-results-card',
}: ToolSearchResultsCardProps) {
  const { colors: themeColors } = useTheme()

  const { query, results } = data

  return (
    <View testID={testID} className="gap-2">
      {/* Header */}
      <Card className="border-border bg-card overflow-hidden">
        <View
          className="h-1"
          style={{ backgroundColor: themeColors.primary }}
        />
        <View className="p-4">
          <View className="flex-row items-center gap-2">
            <Wrench size={20} color={themeColors.primary} />
            <Text className="text-foreground flex-1 text-lg font-bold">
              Toolbelt Search
            </Text>
            <View className="rounded-full bg-muted px-2 py-1">
              <Text className="text-muted-foreground text-xs font-medium">
                {results.length} results
              </Text>
            </View>
          </View>
          <View className="mt-2 flex-row items-center gap-2">
            <Search size={14} color={themeColors.mutedForeground} />
            <Text className="text-muted-foreground text-sm">
              "{query}"
            </Text>
          </View>
        </View>
      </Card>

      {/* Result Items */}
      {results.map((tool, index) => (
        <Card
          key={tool.id}
          testID={`${testID}-item-${index}`}
          className="border-border bg-card"
        >
          <View className="p-3">
            {/* Title Row */}
            <View className="flex-row items-center gap-2">
              <Text className="text-xl">{getSourceIcon(tool.source_type)}</Text>
              <Text className="text-foreground flex-1 text-sm font-semibold" numberOfLines={1}>
                {tool.title}
              </Text>
              {/* Relevance score */}
              <View className="rounded-full bg-success/20 px-2 py-0.5">
                <Text className="text-xs font-medium text-success">
                  {Math.round(tool.score * 100)}%
                </Text>
              </View>
            </View>

            {/* Description */}
            {tool.description && (
              <Text
                className="text-muted-foreground mt-2 text-sm"
                numberOfLines={2}
              >
                {tool.description}
              </Text>
            )}

            {/* Metadata Row */}
            <View className="mt-2 flex-row flex-wrap items-center gap-2">
              {/* Category */}
              <View className="flex-row items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                <Tag size={10} color={themeColors.mutedForeground} />
                <Text className="text-muted-foreground text-xs">
                  {tool.category}
                </Text>
              </View>

              {/* Language */}
              {tool.language && (
                <View className="flex-row items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                  <Code size={10} color={themeColors.mutedForeground} />
                  <Text className="text-muted-foreground text-xs">
                    {tool.language}
                  </Text>
                </View>
              )}

              {/* Tags */}
              {tool.tags?.slice(0, 2).map((tag) => (
                <View
                  key={tag}
                  className="rounded-full bg-muted px-2 py-0.5"
                >
                  <Text className="text-muted-foreground text-xs">
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </Card>
      ))}

      {/* Empty state */}
      {results.length === 0 && (
        <Card className="border-border bg-card p-6">
          <View className="items-center gap-2">
            <Search size={32} color={themeColors.mutedForeground} />
            <Text className="text-muted-foreground text-center text-sm">
              No tools found for "{query}"
            </Text>
            <Text className="text-muted-foreground text-center text-xs">
              Try a different search or add a tool with /toolbelt [url]
            </Text>
          </View>
        </Card>
      )}
    </View>
  )
}
