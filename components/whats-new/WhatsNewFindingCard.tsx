/**
 * WhatsNewFindingCard - Individual finding card for the What's New feed
 */

import React from 'react'
import { View, Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles,
  Package,
  TrendingUp,
  MessageSquare,
  ExternalLink,
  Zap,
} from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'

export interface WhatsNewFindingCardProps {
  title: string
  url: string
  source: string
  category: 'discovery' | 'release' | 'trend' | 'discussion'
  score?: number
  summary?: string
  publishedAt?: string
  author?: string
  engagementVelocity?: number
  tags?: string[]
  testID?: string
  onPress?: () => void
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const CATEGORY_CONFIG = {
  discovery: {
    label: 'Discovery',
    pillClass: 'bg-warning/20',
    textClass: 'text-warning',
    Icon: Sparkles,
  },
  release: {
    label: 'Release',
    pillClass: 'bg-success/20',
    textClass: 'text-success',
    Icon: Package,
  },
  trend: {
    label: 'Trend',
    pillClass: 'bg-info/20',
    textClass: 'text-info',
    Icon: TrendingUp,
  },
  discussion: {
    label: 'Discussion',
    pillClass: 'bg-muted',
    textClass: 'text-muted-foreground',
    Icon: MessageSquare,
  },
} as const

function WhatsNewFindingCardComponent({
  title,
  source,
  category,
  score,
  summary,
  publishedAt,
  author,
  engagementVelocity,
  testID = 'whats-new-finding-card',
  onPress,
}: WhatsNewFindingCardProps) {
  const { colors: themeColors } = useTheme()
  const config = CATEGORY_CONFIG[category]
  const { Icon } = config

  // Build comprehensive accessibility label for screen readers
  const accessibilityLabel = `${config.label}. ${title}${summary ? `. ${summary}` : ''}. Source: ${source}${author ? `. Author: ${author}` : ''}${publishedAt ? `. ${formatRelativeTime(publishedAt)}` : ''}`

  return (
    <Card testID={testID} className="border-border bg-card mb-3 overflow-hidden">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={`Opens ${config.label.toLowerCase()} in browser`}
        accessibilityState={{ disabled: !onPress }}
        testID={`${testID}-pressable`}
      >
        <View
          className="px-4 pb-4 pt-3 gap-2"
          accessible={true}
          accessibilityRole="none"
        >
        {/* Top row: category pill + relative time */}
        <View className="flex-row items-center justify-between">
          <View
            className={`flex-row items-center gap-1 rounded-full px-2 py-1 ${config.pillClass}`}
            accessible={true}
            accessibilityRole="text"
            accessibilityLabel={`${config.label} category`}
          >
            <Icon size={12} className={config.textClass} />
            <Text className={`text-xs font-medium ${config.textClass}`}>
              {config.label}
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            {score !== undefined && (
              <View
                className="flex-row items-center gap-1 rounded-full bg-muted px-2 py-0.5"
                accessible={true}
                accessibilityRole="text"
                accessibilityLabel={`Score ${score}`}
              >
                <Zap size={10} color={themeColors.warning} />
                <Text className="text-xs text-muted-foreground">{score}</Text>
              </View>
            )}
            {publishedAt && (
              <Text
                className="text-xs text-muted-foreground"
                testID={`${testID}-time`}
                accessible={true}
                accessibilityRole="text"
              >
                {formatRelativeTime(publishedAt)}
              </Text>
            )}
          </View>
        </View>

        {/* Title */}
        <View
          testID={`${testID}-title-container`}
          accessible={true}
          accessibilityRole="text"
          accessibilityLabel={`Title: ${title}`}
        >
          <Text
            className="text-foreground text-base font-bold leading-snug"
            numberOfLines={2}
            testID={`${testID}-title`}
          >
            {title}
          </Text>
        </View>

        {/* Summary */}
        {summary && (
          <Text
            className="text-muted-foreground text-sm leading-relaxed"
            numberOfLines={3}
            testID={`${testID}-summary`}
            accessible={true}
            accessibilityRole="text"
          >
            {summary}
          </Text>
        )}

        {/* Bottom row: source badge + author + external link */}
        <View
          className="flex-row items-center gap-2 flex-wrap"
          accessible={true}
          accessibilityRole="text"
          accessibilityLabel={`Source: ${source}${author ? `. Author: ${author}` : ''}${engagementVelocity ? `. Engagement: ${engagementVelocity}` : ''}`}
        >
          <Badge variant="outline" className="border-border" testID={`${testID}-source-badge`}>
            <Text className="text-muted-foreground text-xs">{source}</Text>
          </Badge>

          {author && (
            <Text
              className="text-muted-foreground text-xs flex-1"
              numberOfLines={1}
              testID={`${testID}-author`}
            >
              {author}
            </Text>
          )}

          {engagementVelocity !== undefined && engagementVelocity > 0 && (
            <View className="flex-row items-center gap-0.5">
              <Zap size={10} color={themeColors.warning} />
              <Text className="text-xs text-muted-foreground" testID={`${testID}-velocity`}>
                {engagementVelocity}
              </Text>
            </View>
          )}

          <ExternalLink
            size={14}
            className="text-muted-foreground"
            testID={`${testID}-external-link`}
          />
        </View>
      </View>
      </Pressable>
    </Card>
  )
}

export const WhatsNewFindingCard = React.memo(WhatsNewFindingCardComponent)
