/**
 * SocialPostsGroupCard - Compact summary card that groups all social posts
 *
 * Displays a single card in the main feed representing all social posts
 * (Reddit, Bluesky, Lobsters). Shows platform breakdown, top post preview,
 * and total count. Tapping navigates to dedicated social posts subview.
 *
 * Design: Editorial/magazine aesthetic — tight typography, platform color
 * accents as left-border stripes, dense info layout.
 */

import { View, Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import {
  MessageSquare,
  ChevronRight,
  TrendingUp,
  Zap,
} from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'

interface SocialFinding {
  title: string
  url: string
  source: string
  category: string
  score?: number
  publishedAt?: string
  author?: string
  engagementVelocity?: number
  qualityScore?: number
  upvotes?: number
  commentCount?: number
}

export interface SocialPostsGroupCardProps {
  findings: SocialFinding[]
  onPress: () => void
  testID?: string
}

/**
 * Group findings by platform and compute stats
 */
function computePlatformStats(findings: SocialFinding[]) {
  const platforms = new Map<string, { count: number; topScore: number }>()

  for (const f of findings) {
    // Normalize source to platform name
    let platform = 'Other'
    if (f.source.startsWith('r/')) platform = 'Reddit'
    else if (f.source.includes('Bluesky')) platform = 'Bluesky'
    else if (f.source === 'Lobsters') platform = 'Lobsters'
    else if (f.source === 'Dev.to') platform = 'Dev.to'

    const existing = platforms.get(platform) ?? { count: 0, topScore: 0 }
    existing.count++
    existing.topScore = Math.max(existing.topScore, f.score ?? 0)
    platforms.set(platform, existing)
  }

  return platforms
}

const PLATFORM_COLORS: Record<string, string> = {
  Reddit: '#FF4500',
  Bluesky: '#0085FF',
  Lobsters: '#AC130D',
  'Dev.to': '#0A0A0A',
  Other: '#64748B',
}

export function SocialPostsGroupCard({
  findings,
  onPress,
  testID = 'social-posts-group',
}: SocialPostsGroupCardProps) {
  const { colors: themeColors, isDark } = useTheme()

  if (findings.length === 0) return null

  const platforms = computePlatformStats(findings)
  const topPost = [...findings].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
  const totalEngagement = findings.reduce((sum, f) => sum + (f.upvotes ?? f.score ?? 0), 0)

  return (
    <Pressable onPress={onPress} testID={testID}>
      <Card className="border-border bg-card mb-3 overflow-hidden">
        {/* Platform color stripe bar at top */}
        <View className="flex-row" style={{ height: 3 }}>
          {Array.from(platforms.entries()).map(([platform, stats]) => (
            <View
              key={platform}
              style={{
                flex: stats.count,
                backgroundColor: PLATFORM_COLORS[platform] ?? PLATFORM_COLORS.Other,
              }}
            />
          ))}
        </View>

        <View className="px-4 pb-4 pt-3 gap-3">
          {/* Header: Icon + title + count + chevron */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View className="bg-muted rounded-full p-1.5">
                <MessageSquare size={14} className="text-muted-foreground" />
              </View>
              <Text className="text-foreground text-base font-semibold">
                Community Pulse
              </Text>
              <View className="bg-primary/15 rounded-full px-2 py-0.5">
                <Text className="text-primary text-xs font-bold">
                  {findings.length}
                </Text>
              </View>
            </View>
            <ChevronRight size={18} className="text-muted-foreground" />
          </View>

          {/* Platform breakdown chips */}
          <View className="flex-row flex-wrap gap-1.5">
            {Array.from(platforms.entries()).map(([platform, stats]) => (
              <View
                key={platform}
                className="flex-row items-center gap-1 rounded-full px-2.5 py-1"
                style={{
                  backgroundColor: isDark
                    ? `${PLATFORM_COLORS[platform] ?? '#64748B'}20`
                    : `${PLATFORM_COLORS[platform] ?? '#64748B'}12`,
                }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: PLATFORM_COLORS[platform] ?? '#64748B',
                  }}
                />
                <Text
                  className="text-xs font-medium"
                  style={{ color: isDark ? themeColors.foreground : PLATFORM_COLORS[platform] ?? '#64748B' }}
                >
                  {platform}
                </Text>
                <Text className="text-xs text-muted-foreground">{stats.count}</Text>
              </View>
            ))}
          </View>

          {/* Top post preview */}
          {topPost && (
            <View className="bg-muted/50 rounded-lg px-3 py-2.5">
              <View className="flex-row items-start gap-2">
                <TrendingUp size={12} className="text-warning mt-0.5" />
                <View className="flex-1">
                  <Text
                    className="text-foreground text-sm font-medium leading-snug"
                    numberOfLines={2}
                  >
                    {topPost.title}
                  </Text>
                  <Text className="text-muted-foreground text-xs mt-1">
                    {topPost.source}
                    {topPost.upvotes ? ` · ${topPost.upvotes} pts` : ''}
                    {topPost.commentCount ? ` · ${topPost.commentCount} comments` : ''}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Footer stats */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              {totalEngagement > 0 && (
                <View className="flex-row items-center gap-1">
                  <Zap size={11} color={themeColors.warning} />
                  <Text className="text-xs text-muted-foreground">
                    {totalEngagement.toLocaleString()} total engagement
                  </Text>
                </View>
              )}
            </View>
            <Text className="text-xs text-primary font-medium">
              View all →
            </Text>
          </View>
        </View>
      </Card>
    </Pressable>
  )
}
