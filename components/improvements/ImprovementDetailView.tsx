import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import {
  Bot,
  GitFork,
  Sparkles,
  CheckCircle2,
  Circle,
} from '@/components/ui/icons'
import * as React from 'react'
import { Image, ScrollView, View, Pressable } from 'react-native'

// ── Types ─────────────────────────────────────────────────────────────────

export type ImprovementStatus = 'open' | 'closed'

export interface ImprovementDetailViewProps {
  request: {
    _id: string
    title?: string
    description: string
    summary?: string
    status: ImprovementStatus
    sourceScreen: string
    sourceComponent?: string
    agentDecision?: {
      action: 'create_new' | 'merge'
      mergeTargetId?: string
      confidence: number
      reasoning: string
      similarRequests: Array<{ id: string; title: string; similarity: number }>
    }
    mergedFromIds?: string[]
    closureReason?: string
    closureEvidence?: string[]
    closedAt?: number
    createdAt: number
    processedAt?: number
  }
  images: Array<{ url: string | null; caption?: string; createdAt: number }>
  onToggleStatus?: () => void
  testID?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatRelativeDate(timestamp: number): string {
  const now = Date.now()
  const diffMs = now - timestamp
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHrs = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHrs / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHrs < 24) return `${diffHrs}h ago`
  if (diffDays < 30) return `${diffDays}d ago`
  const diffWeeks = Math.floor(diffDays / 7)
  if (diffWeeks < 5) return `${diffWeeks}w ago`
  const diffMonths = Math.floor(diffDays / 30)
  return `${diffMonths}mo ago`
}

// ── Sub-components ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ImprovementStatus,
  { bg: string; text: string; label: string }
> = {
  open: {
    bg: 'bg-blue-500/10 dark:bg-blue-500/15',
    text: 'text-blue-600 dark:text-blue-400',
    label: 'Open',
  },
  closed: {
    bg: 'bg-success/10 dark:bg-success/15',
    text: 'text-success',
    label: 'Closed',
  },
}

function StatusBadge({ status }: { status: ImprovementStatus }) {
  const { bg, text, label } = STATUS_CONFIG[status]
  return (
    <View className={cn('px-3 py-1 rounded-full', bg)}>
      <Text className={cn('text-xs font-semibold', text)}>{label}</Text>
    </View>
  )
}

function ConfidenceBadge({ value }: { value: number }) {
  const isHigh = value > 0.8
  const isMedium = value >= 0.5 && value <= 0.8

  const bg = isHigh
    ? 'bg-success/10 dark:bg-success/15'
    : isMedium
      ? 'bg-amber-500/10 dark:bg-amber-500/15'
      : 'bg-destructive/10 dark:bg-destructive/15'

  const text = isHigh
    ? 'text-success'
    : isMedium
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-destructive'

  const label = isHigh ? 'High' : isMedium ? 'Medium' : 'Low'

  return (
    <View className={cn('px-2 py-0.5 rounded-full', bg)}>
      <Text className={cn('text-xs font-medium', text)}>{label}</Text>
    </View>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export function ImprovementDetailView({
  request,
  images,
  onToggleStatus,
  testID = 'improvement-detail-view',
}: ImprovementDetailViewProps) {
  const {
    title,
    description,
    summary,
    status,
    sourceScreen,
    sourceComponent,
    agentDecision,
    mergedFromIds,
    closureReason,
    closureEvidence,
    closedAt,
    createdAt,
  } = request

  const displayTitle = title ?? null
  const relativeDate = formatRelativeDate(createdAt)

  return (
    <ScrollView
      testID={testID}
      className="flex-1 bg-background"
      contentContainerClassName="p-4 gap-4"
      showsVerticalScrollIndicator
    >
      {/* ── 1. Header ─────────────────────────────────────────────────── */}
      <View className="flex-row items-center justify-between flex-wrap gap-2">
        <View className="flex-row items-center gap-2 flex-wrap">
          <StatusBadge status={status} />
          <Text className="text-xs text-muted-foreground">{relativeDate}</Text>
        </View>
        <View
          className="bg-muted px-2 py-1 rounded-md"
          testID={`${testID}-source-badge`}
        >
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {sourceComponent ? `${sourceScreen} / ${sourceComponent}` : sourceScreen}
          </Text>
        </View>
      </View>

      {/* ── 2. Title ──────────────────────────────────────────────────── */}
      {displayTitle ? (
        <Text className="text-xl font-bold text-foreground">{displayTitle}</Text>
      ) : (
        <Text className="text-xl font-bold text-foreground/60 italic" numberOfLines={3}>
          {description.slice(0, 80)}
        </Text>
      )}

      {/* ── 3. Description ────────────────────────────────────────────── */}
      <Text className="text-base text-foreground/80 leading-relaxed">{description}</Text>

      {/* ── 4. Agent Summary ──────────────────────────────────────────── */}
      {summary && (
        <Card>
          <CardHeader>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Bot size={18} className="text-primary" />
                <CardTitle>Agent Summary</CardTitle>
              </View>
              {agentDecision && (
                <ConfidenceBadge value={agentDecision.confidence} />
              )}
            </View>
          </CardHeader>
          <CardContent>
            <Text className="text-sm text-foreground/80 leading-relaxed">{summary}</Text>
          </CardContent>
        </Card>
      )}

      {/* ── 5. Screenshots ────────────────────────────────────────────── */}
      {images.length > 0 && (
        <View className="gap-3">
          <Text className="text-sm font-semibold text-foreground">
            Screenshots ({images.length})
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-3"
            testID={`${testID}-screenshots`}
          >
            {images.map((img, index) => (
              <View key={index} className="gap-1">
                {img.url ? (
                  <Image
                    source={{ uri: img.url }}
                    className="rounded-lg"
                    style={{ width: 192, height: 144 }}
                    resizeMode="cover"
                    testID={`${testID}-screenshot-${index}`}
                  />
                ) : (
                  <View
                    className="rounded-lg bg-muted items-center justify-center"
                    style={{ width: 192, height: 144 }}
                    testID={`${testID}-screenshot-placeholder-${index}`}
                  >
                    <Text className="text-xs text-muted-foreground">No image</Text>
                  </View>
                )}
                {img.caption && (
                  <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                    {img.caption}
                  </Text>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── 6. Closure Metadata (only when closed) ────────────────────── */}
      {status === 'closed' && (closureReason || (closureEvidence && closureEvidence.length > 0)) && (
        <Card>
          <CardHeader>
            <View className="flex-row items-center gap-2">
              <CheckCircle2 size={18} className="text-success" />
              <CardTitle>Closure</CardTitle>
            </View>
          </CardHeader>
          <CardContent className="gap-2">
            {closureReason && (
              <Text className="text-sm text-foreground/80 leading-relaxed">
                {closureReason}
              </Text>
            )}
            {closureEvidence && closureEvidence.length > 0 && (
              <View className="gap-1 mt-1">
                <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Evidence
                </Text>
                {closureEvidence.map((item, i) => (
                  <Text
                    key={i}
                    className="text-xs text-foreground/70 font-mono"
                    testID={`${testID}-closure-evidence-${i}`}
                  >
                    {item}
                  </Text>
                ))}
              </View>
            )}
            {closedAt && (
              <Text className="text-xs text-muted-foreground mt-1">
                Closed {formatRelativeDate(closedAt)}
              </Text>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 7. Agent Decision (informational, no approval) ────────────── */}
      {agentDecision && agentDecision.action === 'merge' && agentDecision.similarRequests.length > 0 && (
        <Card>
          <CardHeader>
            <View className="flex-row items-center gap-2">
              <Sparkles size={18} className="text-primary" />
              <CardTitle>Similar Request</CardTitle>
            </View>
          </CardHeader>
          <CardContent className="gap-3">
            <Text className="text-sm text-foreground/80 leading-relaxed">
              {agentDecision.reasoning}
            </Text>
            <View className="bg-muted rounded-lg p-3 gap-1">
              <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Merge target
              </Text>
              <Text className="text-sm text-foreground font-medium">
                {agentDecision.similarRequests[0].title}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {Math.round(agentDecision.similarRequests[0].similarity * 100)}% similarity
              </Text>
            </View>
          </CardContent>
        </Card>
      )}

      {/* ── 8. Toggle status button ───────────────────────────────────── */}
      {onToggleStatus && (
        <Pressable
          onPress={onToggleStatus}
          testID={`${testID}-toggle-status-button`}
          className={cn(
            'rounded-lg px-4 py-3 items-center active:opacity-80 flex-row justify-center gap-2',
            status === 'open' ? 'bg-success' : 'bg-muted border border-border',
          )}
        >
          {status === 'open' ? (
            <>
              <CheckCircle2 size={16} className="text-white" />
              <Text className="text-white font-semibold text-sm">Mark Closed</Text>
            </>
          ) : (
            <>
              <Circle size={16} className="text-foreground" />
              <Text className="text-foreground font-semibold text-sm">Reopen</Text>
            </>
          )}
        </Pressable>
      )}

      {/* ── 9. Merged Requests ────────────────────────────────────────── */}
      {mergedFromIds && mergedFromIds.length > 0 && (
        <Card>
          <CardContent className="flex-row items-center gap-3 py-4">
            <GitFork size={18} className="text-muted-foreground" />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-foreground">
                {mergedFromIds.length} request{mergedFromIds.length === 1 ? '' : 's'} merged
              </Text>
              <Text className="text-xs text-muted-foreground">
                This request consolidates similar improvement requests
              </Text>
            </View>
          </CardContent>
        </Card>
      )}

      {/* Bottom padding */}
      <View style={{ height: 16 }} />
    </ScrollView>
  )
}
