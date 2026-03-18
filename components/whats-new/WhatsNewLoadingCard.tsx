/**
 * WhatsNewLoadingCard - Loading state while generating briefing
 */

import { View, useColorScheme, ActivityIndicator } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { Newspaper } from 'lucide-react-native'
import { colors } from '@/lib/theme'
import type { WhatsNewLoadingCardData } from '@/lib/types/chat'

export interface WhatsNewLoadingCardProps {
  data: WhatsNewLoadingCardData
  testID?: string
}

export function WhatsNewLoadingCard({
  data,
  testID = 'whats-new-loading-card',
}: WhatsNewLoadingCardProps) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const themeColors = isDark ? colors.dark : colors.light

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
          <Newspaper size={20} color={themeColors.primary} />
          <Text className="text-foreground flex-1 text-lg font-bold">
            What's New in AI
          </Text>
        </View>

        {/* Loading state */}
        <View className="items-center gap-3 py-6">
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text className="text-muted-foreground text-sm">
            {data.message || 'Generating briefing...'}
          </Text>
          <Text className="text-muted-foreground text-xs">
            Fetching from Reddit, Hacker News, GitHub, Dev.to, Lobsters...
          </Text>
        </View>
      </View>
    </Card>
  )
}
