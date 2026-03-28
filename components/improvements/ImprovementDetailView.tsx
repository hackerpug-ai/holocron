import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import {
  Bot,
  CheckCircle2,
  Circle,
  GitFork,
  Sparkles,
  Check,
  X,
} from '@/components/ui/icons'
import * as React from 'react'
import {
  Image,
  ScrollView,
  TextInput,
  View,
  Pressable,
} from 'react-native'

// ── Types ─────────────────────────────────────────────────────────────────

export interface ImprovementDetailViewProps {
  request: {
    _id: string
    title?: string
    description: string
    summary?: string
    status: 'submitted' | 'processing' | 'pending_review' | 'approved' | 'done' | 'merged'
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
    createdAt: number
    processedAt?: number
  }
  images: Array<{ url: string | null; caption?: string; createdAt: number }>
  onApprove?: () => void
  onReject?: (feedback?: string) => void
  onRequestSeparate?: () => void
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

type ImprovementStatus =
  | 'submitted'
  | 'processing'
  | 'pending_review'
  | 'approved'
  | 'done'
  | 'merged'

const STATUS_CONFIG: Record<
  ImprovementStatus,
  { bg: string; text: string; label: string }
> = {
  submitted: {
    bg: 'bg-blue-500/10 dark:bg-blue-500/15',
    text: 'text-blue-600 dark:text-blue-400',
    label: 'Submitted',
  },
  processing: {
    bg: 'bg-amber-500/10 dark:bg-amber-500/15',
    text: 'text-amber-600 dark:text-amber-400',
    label: 'Processing',
  },
  pending_review: {
    bg: 'bg-violet-500/10 dark:bg-violet-500/15',
    text: 'text-violet-600 dark:text-violet-400',
    label: 'Pending Review',
  },
  approved: {
    bg: 'bg-success/10 dark:bg-success/15',
    text: 'text-success',
    label: 'Approved',
  },
  done: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    label: 'Done',
  },
  merged: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    label: 'Merged',
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

interface TimelineStepProps {
  label: string
  isCompleted: boolean
  isCurrent: boolean
  isLast?: boolean
}

function TimelineStep({ label, isCompleted, isCurrent, isLast }: TimelineStepProps) {
  const iconClass = isCompleted
    ? 'text-success'
    : isCurrent
      ? 'text-primary'
      : 'text-muted-foreground/40'

  const labelClass = isCompleted || isCurrent
    ? 'text-foreground'
    : 'text-muted-foreground/40'

  return (
    <View className="flex-row items-stretch gap-3">
      {/* Dot + connector column */}
      <View className="items-center" style={{ width: 20 }}>
        {isCompleted ? (
          <CheckCircle2 size={16} className={iconClass} />
        ) : (
          <Circle size={16} className={iconClass} />
        )}
        {!isLast && (
          <View className="flex-1 w-px bg-border mt-1" style={{ minHeight: 16 }} />
        )}
      </View>

      {/* Label */}
      <View className="pb-4 flex-1 justify-center" style={{ minHeight: 20 }}>
        <Text className={cn('text-sm', labelClass)}>{label}</Text>
      </View>
    </View>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export function ImprovementDetailView({
  request,
  images,
  onApprove,
  onReject,
  onRequestSeparate,
  testID = 'improvement-detail-view',
}: ImprovementDetailViewProps) {
  const [feedbackText, setFeedbackText] = React.useState('')

  const {
    title,
    description,
    summary,
    status,
    sourceScreen,
    sourceComponent,
    agentDecision,
    mergedFromIds,
    createdAt,
    processedAt,
  } = request

  const displayTitle = title ?? null
  const relativeDate = formatRelativeDate(createdAt)

  // ── Timeline steps ────────────────────────────────────────────────────

  const TIMELINE_STEPS: Array<{ key: ImprovementStatus | 'processing'; label: string }> = [
    { key: 'submitted', label: 'Submitted' },
    { key: 'processing', label: 'Processing' },
    { key: 'pending_review', label: 'Pending Review' },
    { key: 'approved', label: 'Approved' },
    { key: 'done', label: 'Done' },
  ]

  const STATUS_ORDER: ImprovementStatus[] = [
    'submitted',
    'processing',
    'pending_review',
    'approved',
    'done',
    'merged',
  ]

  const currentIndex = STATUS_ORDER.indexOf(status)

  // Filter visible steps: always show submitted + processing if processedAt exists
  const visibleSteps = TIMELINE_STEPS.filter((step) => {
    if (step.key === 'processing' && !processedAt) return false
    // For merged status, replace 'done' step label
    return true
  }).map((step) => {
    if (step.key === 'done' && status === 'merged') {
      return { ...step, label: 'Merged' }
    }
    return step
  })

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

      {/* ── 6. Agent Decision ─────────────────────────────────────────── */}
      {agentDecision && status === 'pending_review' && (
        <Card>
          <CardHeader>
            <View className="flex-row items-center gap-2">
              <Sparkles size={18} className="text-primary" />
              <CardTitle>
                {agentDecision.action === 'merge'
                  ? 'Similar to Existing Request'
                  : 'New Request'}
              </CardTitle>
            </View>
          </CardHeader>
          <CardContent className="gap-4">
            {/* Reasoning */}
            <Text className="text-sm text-foreground/80 leading-relaxed">
              {agentDecision.reasoning}
            </Text>

            {/* Merge target info */}
            {agentDecision.action === 'merge' &&
              agentDecision.similarRequests.length > 0 && (
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
              )}

            {/* Action buttons */}
            {agentDecision.action === 'merge' ? (
              <View className="gap-3">
                {/* Approve merge */}
                <Pressable
                  onPress={onApprove}
                  testID={`${testID}-approve-button`}
                  className="bg-success rounded-lg px-4 py-3 items-center active:opacity-80"
                >
                  <View className="flex-row items-center gap-2">
                    <Check size={16} className="text-white" />
                    <Text className="text-white font-semibold text-sm">Approve</Text>
                  </View>
                </Pressable>

                {/* Keep separate */}
                <Pressable
                  onPress={onRequestSeparate}
                  testID={`${testID}-keep-separate-button`}
                  className="border border-border rounded-lg px-4 py-3 items-center active:opacity-80"
                >
                  <Text className="text-foreground font-medium text-sm">Keep Separate</Text>
                </Pressable>

                {/* Reject with feedback */}
                <View className="gap-2">
                  <TextInput
                    value={feedbackText}
                    onChangeText={setFeedbackText}
                    placeholder="Optional feedback for rejection..."
                    placeholderTextColor="#9ca3af"
                    multiline
                    numberOfLines={2}
                    testID={`${testID}-feedback-input`}
                    className="border border-border rounded-lg px-3 py-2 text-sm text-foreground bg-background"
                    style={{ minHeight: 64, textAlignVertical: 'top' }}
                  />
                  <Pressable
                    onPress={() => onReject?.(feedbackText || undefined)}
                    testID={`${testID}-reject-button`}
                    className="border border-destructive rounded-lg px-4 py-3 items-center active:opacity-80"
                  >
                    <View className="flex-row items-center gap-2">
                      <X size={16} className="text-destructive" />
                      <Text className="text-destructive font-medium text-sm">Reject</Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            ) : (
              /* create_new: just approve */
              <Pressable
                onPress={onApprove}
                testID={`${testID}-approve-button`}
                className="bg-success rounded-lg px-4 py-3 items-center active:opacity-80"
              >
                <View className="flex-row items-center gap-2">
                  <Check size={16} className="text-white" />
                  <Text className="text-white font-semibold text-sm">Approve New Request</Text>
                </View>
              </Pressable>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 7. Status Timeline ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {visibleSteps.map((step, index) => {
            const stepIndex = STATUS_ORDER.indexOf(step.key as ImprovementStatus)
            // Handle 'merged' status mapping to 'done' step
            const effectiveStepIndex =
              step.key === 'done' && status === 'merged'
                ? STATUS_ORDER.indexOf('merged')
                : stepIndex

            const isCompleted = effectiveStepIndex < currentIndex
            const isCurrent = effectiveStepIndex === currentIndex
            const isLast = index === visibleSteps.length - 1

            return (
              <TimelineStep
                key={step.key}
                label={step.label}
                isCompleted={isCompleted}
                isCurrent={isCurrent}
                isLast={isLast}
              />
            )
          })}
        </CardContent>
      </Card>

      {/* ── 8. Merged Requests ────────────────────────────────────────── */}
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
