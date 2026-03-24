/**
 * WhatsNewReportCard - AI news briefing display
 */

import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { Newspaper, Sparkles, TrendingUp, Package, MessageSquare, Calendar } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import type { WhatsNewReportCardData } from '@/lib/types/chat'

export interface WhatsNewReportCardProps {
  data: WhatsNewReportCardData
  testID?: string
  onPress?: () => void
}

/**
 * Format timestamp to date string
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function WhatsNewReportCard({
  data,
  testID = 'whats-new-report-card',
  onPress,
}: WhatsNewReportCardProps) {
  const { colors: themeColors } = useTheme()

  const {
    days,
    period_start,
    period_end,
    findings_count,
    discovery_count,
    release_count,
    trend_count,
    content,
    is_from_today,
  } = data

  return (
    <Card testID={testID} className="border-border bg-card overflow-hidden">
      {/* Top accent bar */}
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
          {is_from_today && (
            <View className="rounded-full bg-success/20 px-2 py-1">
              <Text className="text-xs font-medium text-success">
                Today
              </Text>
            </View>
          )}
        </View>

        {/* Period */}
        <View className="mb-3 flex-row items-center gap-2">
          <Calendar size={14} color={themeColors.mutedForeground} />
          <Text className="text-muted-foreground text-sm">
            {formatDate(period_start)} - {formatDate(period_end)} ({days} days)
          </Text>
        </View>

        {/* Stats Row */}
        <View className="mb-4 flex-row flex-wrap gap-3">
          {/* Total Findings */}
          <View className="flex-row items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5">
            <Sparkles size={14} color={themeColors.primary} />
            <Text className="text-foreground text-sm font-semibold">
              {findings_count}
            </Text>
            <Text className="text-muted-foreground text-sm">findings</Text>
          </View>

          {/* Discoveries */}
          {discovery_count > 0 && (
            <View className="flex-row items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5">
              <Sparkles size={14} color={themeColors.warning} />
              <Text className="text-foreground text-sm font-semibold">
                {discovery_count}
              </Text>
              <Text className="text-muted-foreground text-sm">discoveries</Text>
            </View>
          )}

          {/* Releases */}
          {release_count > 0 && (
            <View className="flex-row items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5">
              <Package size={14} color={themeColors.success} />
              <Text className="text-foreground text-sm font-semibold">
                {release_count}
              </Text>
              <Text className="text-muted-foreground text-sm">releases</Text>
            </View>
          )}

          {/* Trends */}
          {trend_count > 0 && (
            <View className="flex-row items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5">
              <TrendingUp size={14} color={themeColors.info} />
              <Text className="text-foreground text-sm font-semibold">
                {trend_count}
              </Text>
              <Text className="text-muted-foreground text-sm">trends</Text>
            </View>
          )}
        </View>

        {/* Content Preview */}
        {content && (
          <View className="rounded-lg bg-muted p-3">
            <Text
              className="text-foreground text-sm"
              numberOfLines={6}
            >
              {content.slice(0, 500)}
              {content.length > 500 ? '...' : ''}
            </Text>
          </View>
        )}

        {/* Note */}
        {!content && (
          <View className="flex-row items-center gap-2 rounded-lg bg-muted p-3">
            <MessageSquare size={14} color={themeColors.mutedForeground} />
            <Text className="text-muted-foreground flex-1 text-sm">
              Tap to view full briefing
            </Text>
          </View>
        )}
      </View>
    </Card>
  )
}
