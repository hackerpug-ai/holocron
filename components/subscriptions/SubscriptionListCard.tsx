/**
 * SubscriptionListCard - List view for subscriptions
 */

import { View, useColorScheme, Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { Bell, Rss, Calendar, Trash2 } from 'lucide-react-native'
import { colors } from '@/lib/theme'
import type { SubscriptionListCardData } from '@/lib/types/chat'

export interface SubscriptionListCardProps {
  data: SubscriptionListCardData
  testID?: string
  onDeletePress?: (subscriptionId: string) => void
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

/**
 * Format timestamp to relative date
 */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  return date.toLocaleDateString()
}

export function SubscriptionListCard({
  data,
  testID = 'subscription-list-card',
  onDeletePress,
}: SubscriptionListCardProps) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const themeColors = isDark ? colors.dark : colors.light

  const { subscriptions, filter_type } = data

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
            <Bell size={20} color={themeColors.primary} />
            <Text className="text-foreground flex-1 text-lg font-bold">
              {filter_type ? `${filter_type} Subscriptions` : 'All Subscriptions'}
            </Text>
            <View className="rounded-full bg-muted px-2 py-1">
              <Text className="text-muted-foreground text-xs font-medium">
                {subscriptions.length} total
              </Text>
            </View>
          </View>
        </View>
      </Card>

      {/* Subscription Items */}
      {subscriptions.map((sub, index) => (
        <Card
          key={sub.id}
          testID={`${testID}-item-${index}`}
          className="border-border bg-card"
        >
          <View className="flex-row items-center p-3">
            {/* Icon */}
            <Text className="mr-3 text-2xl">{getTypeIcon(sub.source_type)}</Text>

            {/* Details */}
            <View className="flex-1">
              <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                {sub.name}
              </Text>
              <View className="mt-1 flex-row items-center gap-2">
                <Rss size={12} color={themeColors.mutedForeground} />
                <Text className="text-muted-foreground text-xs">
                  {sub.source_type}
                </Text>
                <Text className="text-muted-foreground text-xs">•</Text>
                <Calendar size={12} color={themeColors.mutedForeground} />
                <Text className="text-muted-foreground text-xs">
                  {formatDate(sub.created_at)}
                </Text>
              </View>
            </View>

            {/* Auto-research badge */}
            {sub.auto_research && (
              <View className="mr-2 rounded-full bg-emerald-500/20 px-2 py-1">
                <Text className="text-xs font-medium text-emerald-500">
                  Auto
                </Text>
              </View>
            )}

            {/* Delete button */}
            {onDeletePress && (
              <Pressable
                onPress={() => onDeletePress(sub.id)}
                className="rounded-full p-2 active:bg-muted"
              >
                <Trash2 size={16} color={themeColors.mutedForeground} />
              </Pressable>
            )}
          </View>
        </Card>
      ))}

      {/* Empty state */}
      {subscriptions.length === 0 && (
        <Card className="border-border bg-card p-6">
          <View className="items-center gap-2">
            <Bell size={32} color={themeColors.mutedForeground} />
            <Text className="text-muted-foreground text-center text-sm">
              No subscriptions found
            </Text>
            <Text className="text-muted-foreground text-center text-xs">
              Use /subscribe to add one
            </Text>
          </View>
        </Card>
      )}
    </View>
  )
}
