import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { Clock, History } from 'lucide-react-native'
import { Pressable, View, type ViewProps } from 'react-native'

export interface ResumeSession {
  /** Unique session identifier */
  id: string
  /** Research topic/title */
  topic: string
  /** Current iteration number */
  currentIteration: number
  /** Target iteration count (typically 5) */
  targetIterations: number
  /** Coverage score (1-5) from latest iteration */
  coverageScore: number
  /** ISO date string when session was started */
  dateStarted: string
}

interface ResumeSessionListProps extends ViewProps {
  /** Array of incomplete sessions to display */
  sessions: ResumeSession[]
  /** Callback when a session is selected */
  onSelect: (_sessionId: string) => void
  /** Optional title for the list */
  title?: string
  /** Optional empty state message */
  emptyMessage?: string
  /** Optional empty state description */
  emptyDescription?: string
}

/**
 * Format a date to relative time (e.g., "2 hours ago", "3 days ago")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Get color class for coverage score badge
 */
function getScoreColorClass(score: number): string {
  const colors = {
    1: 'bg-red-100 border-red-200',
    2: 'bg-orange-100 border-orange-200',
    3: 'bg-yellow-100 border-yellow-200',
    4: 'bg-green-100 border-green-200',
    5: 'bg-emerald-100 border-emerald-200',
  }
  return colors[score as keyof typeof colors] ?? colors[3]
}

/**
 * Get text color class for coverage score
 */
function getScoreTextColorClass(score: number): string {
  const colors = {
    1: 'text-red-700',
    2: 'text-orange-700',
    3: 'text-yellow-700',
    4: 'text-green-700',
    5: 'text-emerald-700',
  }
  return colors[score as keyof typeof colors] ?? colors[3]
}

/**
 * SessionCard displays a single resume session as a pressable card
 */
function SessionCard({ session, onPress }: { session: ResumeSession; onPress: () => void }) {
  const relativeTime = formatRelativeTime(session.dateStarted)
  const scoreColorClass = getScoreColorClass(session.coverageScore)
  const scoreTextClass = getScoreTextColorClass(session.coverageScore)

  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-80"
      testID={`resume-session-${session.id}`}
    >
      <Card className="border-border">
        <CardHeader className="pb-2">
          <View className="mb-2 flex-row items-center gap-2">
            <View className="bg-muted/50 rounded-full p-1">
              <History size={14} className="text-muted-foreground" />
            </View>
            <Text className="text-muted-foreground text-xs">
              Iteration {session.currentIteration}/{session.targetIterations}
            </Text>
          </View>
          <Text className="text-foreground text-base font-semibold" numberOfLines={2}>
            {session.topic}
          </Text>
        </CardHeader>

        <CardContent className="pt-0">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1">
              <Clock size={12} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-xs">{relativeTime}</Text>
            </View>

            <Badge
              className={cn('border', scoreColorClass)}
              testID={`coverage-score-${session.coverageScore}`}
            >
              <Text className={cn('text-xs font-semibold', scoreTextClass)}>
                {session.coverageScore}/5 coverage
              </Text>
            </Badge>
          </View>
        </CardContent>
      </Card>
    </Pressable>
  )
}

/**
 * EmptyState shown when no incomplete sessions exist
 */
function SessionListEmpty({
  title = 'No incomplete sessions',
  description = "You don't have any research sessions to resume. Start a new deep research session to begin.",
  className,
}: {
  title?: string
  description?: string
  className?: string
}) {
  return (
    <View
      className={cn('items-center justify-center py-12', className)}
      testID="resume-session-empty-state"
    >
      <View className="bg-muted mb-4 rounded-full p-4">
        <History size={32} className="text-muted-foreground" />
      </View>
      <Text className="text-foreground mb-1 text-center text-lg font-semibold">{title}</Text>
      <Text className="text-muted-foreground max-w-[280px] text-center text-sm">{description}</Text>
    </View>
  )
}

/**
 * ResumeSessionList displays a list of incomplete deep research sessions
 * that can be resumed when the user types `/resume`.
 */
export function ResumeSessionList({
  sessions,
  onSelect,
  title,
  emptyMessage,
  emptyDescription,
  className,
  ...props
}: ResumeSessionListProps) {
  if (sessions.length === 0) {
    return (
      <SessionListEmpty
        title={emptyMessage || title}
        description={emptyDescription}
        className={className}
        {...props}
      />
    )
  }

  return (
    <View className={cn('gap-3', className)} testID="resume-session-list" {...props}>
      {sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          onPress={() => onSelect(session.id)}
        />
      ))}
    </View>
  )
}
