/**
 * ToolAddedCard - Confirmation after adding tool from URL
 */

import { View, Pressable, Linking } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { Wrench, Check, ExternalLink, Tag } from 'lucide-react-native'
import { useTheme } from '@/hooks/use-theme'
import type { ToolAddedCardData } from '@/lib/types/chat'

export interface ToolAddedCardProps {
  data: ToolAddedCardData
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

export function ToolAddedCard({
  data,
  testID = 'tool-added-card',
}: ToolAddedCardProps) {
  const { colors: themeColors } = useTheme()

  const handleOpenUrl = () => {
    Linking.openURL(data.url)
  }

  return (
    <Card testID={testID} className="border-border bg-card overflow-hidden">
      {/* Success accent bar */}
      <View className="h-1 bg-emerald-500" />

      <View className="p-4">
        {/* Header with success indicator */}
        <View className="mb-3 flex-row items-center gap-2">
          <View className="rounded-full bg-emerald-500/20 p-1">
            <Check size={16} color="#10B981" />
          </View>
          <Text className="text-foreground flex-1 text-lg font-bold">
            Tool Added
          </Text>
          <Text className="text-2xl">{getSourceIcon(data.source_type)}</Text>
        </View>

        {/* Tool info */}
        <View className="gap-2">
          {/* Title */}
          <Text className="text-foreground text-base font-semibold">
            {data.title}
          </Text>

          {/* Description */}
          {data.description && (
            <Text
              className="text-muted-foreground text-sm"
              numberOfLines={3}
            >
              {data.description}
            </Text>
          )}

          {/* Metadata row */}
          <View className="mt-2 flex-row items-center gap-2">
            <View className="flex-row items-center gap-1 rounded-full bg-muted px-2.5 py-1">
              <Tag size={12} color={themeColors.mutedForeground} />
              <Text className="text-muted-foreground text-xs font-medium">
                {data.category}
              </Text>
            </View>
            <View className="rounded-full bg-muted px-2.5 py-1">
              <Text className="text-muted-foreground text-xs font-medium">
                {data.source_type}
              </Text>
            </View>
          </View>

          {/* URL with open action */}
          <Pressable
            onPress={handleOpenUrl}
            className="mt-2 flex-row items-center gap-2 rounded-lg bg-muted p-3 active:opacity-70"
          >
            <ExternalLink size={14} color={themeColors.primary} />
            <Text
              className="flex-1 text-sm"
              style={{ color: themeColors.primary }}
              numberOfLines={1}
            >
              {data.url}
            </Text>
          </Pressable>
        </View>
      </View>
    </Card>
  )
}
