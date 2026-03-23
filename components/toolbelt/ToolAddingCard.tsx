/**
 * ToolAddingCard - Loading state while adding tool from URL
 */

import { View, ActivityIndicator } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { Wrench, Link } from 'lucide-react-native'
import { useTheme } from '@/hooks/use-theme'
import type { ToolAddingCardData } from '@/lib/types/chat'

export interface ToolAddingCardProps {
  data: ToolAddingCardData
  testID?: string
}

export function ToolAddingCard({
  data,
  testID = 'tool-adding-card',
}: ToolAddingCardProps) {
  const { colors: themeColors } = useTheme()

  return (
    <Card testID={testID} className="border-border bg-card overflow-hidden">
      {/* Animated accent bar */}
      <View
        className="h-1"
        style={{ backgroundColor: themeColors.primary }}
      />

      <View className="p-4">
        {/* Header */}
        <View className="mb-3 flex-row items-center gap-2">
          <Wrench size={20} color={themeColors.primary} />
          <Text className="text-foreground flex-1 text-lg font-bold">
            Adding Tool
          </Text>
        </View>

        {/* URL display */}
        <View className="mb-4 flex-row items-center gap-2 rounded-lg bg-muted p-3">
          <Link size={14} color={themeColors.mutedForeground} />
          <Text
            className="text-foreground flex-1 text-sm"
            numberOfLines={1}
          >
            {data.url}
          </Text>
        </View>

        {/* Loading state */}
        <View className="items-center gap-3 py-4">
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text className="text-muted-foreground text-sm">
            {data.message || 'Fetching metadata...'}
          </Text>
          <Text className="text-muted-foreground text-xs">
            Extracting title, description, and category
          </Text>
        </View>
      </View>
    </Card>
  )
}
