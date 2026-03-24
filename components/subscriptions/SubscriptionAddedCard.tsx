/**
 * SubscriptionAddedCard - Confirmation after adding a subscription
 */

import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { Bell, Check, Rss } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import type { SubscriptionAddedCardData } from '@/lib/types/chat'

export interface SubscriptionAddedCardProps {
  data: SubscriptionAddedCardData
  testID?: string
}

/**
 * Get icon for subscription type
 */
function getTypeIcon(sourceType: string) {
  switch (sourceType) {
    case 'youtube':
      return '📺'
    case 'reddit':
      return '🔴'
    case 'newsletter':
      return '📧'
    case 'changelog':
      return '📋'
    case 'ebay':
      return '🛒'
    case 'whats-new':
      return '🆕'
    case 'creator':
      return '👤'
    default:
      return '📡'
  }
}

export function SubscriptionAddedCard({
  data,
  testID = 'subscription-added-card',
}: SubscriptionAddedCardProps) {
  const { colors: themeColors } = useTheme()

  return (
    <Card testID={testID} className="border-border bg-card overflow-hidden">
      {/* Success accent bar */}
      <View className="h-1 bg-success" />

      <View className="p-4">
        {/* Header */}
        <View className="mb-3 flex-row items-center gap-2">
          <View className="rounded-full bg-success/20 p-2">
            <Check size={16} color={themeColors.success} />
          </View>
          <Text className="text-foreground flex-1 text-base font-semibold">
            Subscription Added
          </Text>
          <Text className="text-2xl">{getTypeIcon(data.source_type)}</Text>
        </View>

        {/* Details */}
        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <Bell size={14} color={themeColors.mutedForeground} />
            <Text className="text-foreground text-sm font-medium">
              {data.name}
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            <Rss size={14} color={themeColors.mutedForeground} />
            <Text className="text-muted-foreground text-sm">
              {data.source_type} • {data.identifier}
            </Text>
          </View>
        </View>

        {/* Auto-research note */}
        <View className="mt-3 rounded-lg bg-muted p-2">
          <Text className="text-muted-foreground text-xs">
            New content will be automatically researched and added to your knowledge base.
          </Text>
        </View>
      </View>
    </Card>
  )
}
