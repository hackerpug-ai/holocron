/**
 * SocialPostsListScreen - Dedicated subview for all social/community posts
 *
 * Shows all Reddit, Bluesky, Lobsters posts from the latest What's New report.
 * Grouped by platform with sort options. Each post opens in WebViewSheet.
 */

import React, { useState, useMemo } from 'react'
import { View, FlatList, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Text } from '@/components/ui/text'
import { Badge } from '@/components/ui/badge'
import { WhatsNewFindingCard } from '@/components/whats-new/WhatsNewFindingCard'
import { WebViewSheet } from '@/components/webview/WebViewSheet'
import { NavigationTooltip } from '@/components/NavigationTooltip'
import { useWhatsNewFeed } from '@/hooks/use-whats-new-feed'
import { useWebView } from '@/hooks/useWebView'
import { useTheme } from '@/hooks/use-theme'
import {
  ArrowLeft,
  MessageSquare,
} from '@/components/ui/icons'

export interface SocialPostsListScreenProps {
  testID?: string
}

/** Check if a finding is from a social/community source */
function isSocialSource(source: string): boolean {
  return (
    source.startsWith('r/') ||
    source.includes('Bluesky') ||
    source === 'Lobsters' ||
    source === 'Dev.to' ||
    source === 'Twitter/X'
  )
}

/** Extract platform name from source */
function getPlatform(source: string): string {
  if (source.startsWith('r/')) return 'Reddit'
  if (source.includes('Bluesky')) return 'Bluesky'
  if (source === 'Lobsters') return 'Lobsters'
  if (source === 'Dev.to') return 'Dev.to'
  if (source === 'Twitter/X') return 'Twitter/X'
  return 'Other'
}

type SortMode = 'score' | 'recent' | 'velocity'

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: 'score', label: 'Top' },
  { key: 'recent', label: 'Recent' },
  { key: 'velocity', label: 'Trending' },
]

// Platform brand colors for distinctive badges
// NOTE: These are official platform brand colors and should remain as hardcoded values
const PLATFORM_COLORS: Record<string, string> = {
  Reddit: '#FF4500',
  Bluesky: '#0085FF',
  Lobsters: '#AC130D',
  'Dev.to': '#0A0A0A',
  'Twitter/X': '#1DA1F2',
  All: '#64748B',
}

export function SocialPostsListScreen({
  testID = 'social-posts-list',
}: SocialPostsListScreenProps) {
  const router = useRouter()
  const { colors: themeColors, isDark, spacing } = useTheme()
  const { webViewState, openUrl, closeWebView } = useWebView()
  const { findings } = useWhatsNewFeed({})

  // Navigation tooltip state
  const hasSeenNavTooltip = useQuery(api.notifications.queries.getHasSeenNavTooltip) ?? false
  const markNavTooltipSeen = useMutation(api.notifications.mutations.markNavTooltipSeen)
  const [showTooltip, setShowTooltip] = useState(false)

  // Show tooltip on first visit
  React.useEffect(() => {
    if (!hasSeenNavTooltip) {
      // Small delay to let screen render first
      const timer = setTimeout(() => {
        setShowTooltip(true)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [hasSeenNavTooltip])

  const handleDismissTooltip = () => {
    setShowTooltip(false)
    markNavTooltipSeen().catch((err) => {
      console.error('Failed to mark tooltip as seen:', err)
    })
  }

  const [sortMode, setSortMode] = useState<SortMode>('score')
  const [platformFilter, setPlatformFilter] = useState<string>('All')

  // Filter to social-only findings
  const socialFindings = useMemo(() => {
    let filtered = findings.filter((f: any) => isSocialSource(f.source))

    if (platformFilter !== 'All') {
      filtered = filtered.filter((f: any) => getPlatform(f.source) === platformFilter)
    }

    // Sort
    switch (sortMode) {
      case 'score':
        filtered.sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))
        break
      case 'recent':
        filtered.sort((a: any, b: any) => {
          const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
          const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
          return dateB - dateA
        })
        break
      case 'velocity':
        filtered.sort(
          (a: any, b: any) => (b.engagementVelocity ?? 0) - (a.engagementVelocity ?? 0)
        )
        break
    }

    return filtered
  }, [findings, sortMode, platformFilter])

  // Compute platform counts for filter chips
  const platformCounts = useMemo(() => {
    const counts = new Map<string, number>()
    counts.set('All', 0)
    for (const f of findings) {
      if (!isSocialSource(f.source)) continue
      const p = getPlatform(f.source)
      counts.set(p, (counts.get(p) ?? 0) + 1)
      counts.set('All', (counts.get('All') ?? 0) + 1)
    }
    return counts
  }, [findings])

  return (
    <View className="flex-1 bg-background" testID={testID}>
      {/* Header */}
      <View className="border-b border-border px-4 pt-3 pb-3">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="p-1"
            testID={`${testID}-back`}
          >
            <ArrowLeft size={22} className="text-foreground" />
          </Pressable>
          <View className="flex-row items-center gap-2 flex-1">
            <MessageSquare size={18} className="text-muted-foreground" />
            <Text className="text-foreground text-lg font-semibold">
              Community Pulse
            </Text>
            <View className="bg-primary/15 rounded-full px-2 py-0.5">
              <Text className="text-primary text-xs font-bold">
                {platformCounts.get('All') ?? 0}
              </Text>
            </View>
          </View>
        </View>

        {/* Platform filter chips */}
        <View className="flex-row flex-wrap gap-1.5 mt-3">
          {Array.from(platformCounts.entries())
            .filter(([, count]) => count > 0)
            .map(([platform, count]) => {
              const isActive = platformFilter === platform
              const color = PLATFORM_COLORS[platform] ?? '#64748B'
              return (
                <Pressable
                  key={platform}
                  onPress={() => setPlatformFilter(platform)}
                  testID={`${testID}-filter-${platform.toLowerCase()}`}
                >
                  <View
                    className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
                    style={{
                      backgroundColor: isActive
                        ? `${color}25`
                        : isDark
                          ? themeColors.muted
                          : `${color}08`,
                      borderWidth: isActive ? 1 : 0,
                      borderColor: isActive ? `${color}50` : 'transparent',
                    }}
                  >
                    {platform !== 'All' && (
                      <View
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 4,
                          backgroundColor: color,
                        }}
                      />
                    )}
                    <Text
                      className="text-xs font-medium"
                      style={{
                        color: isActive
                          ? isDark
                            ? themeColors.foreground
                            : color
                          : themeColors.mutedForeground,
                      }}
                    >
                      {platform}
                    </Text>
                    <Text className="text-xs text-muted-foreground">{count}</Text>
                  </View>
                </Pressable>
              )
            })}
        </View>

        {/* Sort options */}
        <View className="flex-row gap-2 mt-2.5">
          {SORT_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => setSortMode(opt.key)}
              testID={`${testID}-sort-${opt.key}`}
            >
              <Badge
                variant={sortMode === opt.key ? 'default' : 'outline'}
                className={sortMode === opt.key ? 'bg-primary' : 'border-border'}
              >
                <Text
                  className={`text-xs ${sortMode === opt.key ? 'text-primary-foreground font-medium' : 'text-muted-foreground'}`}
                >
                  {opt.label}
                </Text>
              </Badge>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Posts list */}
      <FlatList
        data={socialFindings}
        keyExtractor={(item, index) => `${item.url}-${index}`}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        renderItem={({ item, index }) => (
          <WhatsNewFindingCard
            title={item.title}
            url={item.url}
            source={item.source}
            category={item.category}
            score={item.score}
            summary={item.summary}
            publishedAt={item.publishedAt}
            author={item.author}
            engagementVelocity={item.engagementVelocity}
            tags={item.tags}
            testID={`${testID}-card-${index}`}
            onPress={() => openUrl(item.url)}
          />
        )}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-16">
            <MessageSquare size={32} className="text-muted-foreground mb-3" />
            <Text className="text-muted-foreground text-base">
              No community posts found
            </Text>
          </View>
        }
      />

      {/* WebView for opening posts */}
      <WebViewSheet
        url={webViewState.url}
        visible={webViewState.visible}
        onClose={closeWebView}
      />

      {/* Navigation change tooltip */}
      <NavigationTooltip
        visible={showTooltip}
        onDismiss={handleDismissTooltip}
        testID={`${testID}-nav-tooltip`}
      />
    </View>
  )
}
