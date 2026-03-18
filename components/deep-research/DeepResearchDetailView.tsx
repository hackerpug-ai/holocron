import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { ArrowLeft, BookOpen, CheckCircle2, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react-native'
import * as React from 'react'
import { ScrollView, View, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MarkdownView } from '../markdown/MarkdownView'

/**
 * Citation represents a source reference from deep research
 */
export interface Citation {
  /** Citation number */
  id: number
  /** Source title or URL */
  title: string
  /** Optional URL for direct access */
  url?: string
}

/**
 * ResearchIteration represents a single iteration in the deep research process
 * (kept for backward compatibility but hidden from UI)
 */
export interface ResearchIteration {
  /** Iteration number (1-indexed) */
  iterationNumber: number
  /** Coverage score (1-5) */
  coverageScore: number
  /** Reviewer feedback identifying gaps */
  feedback?: string
  /** Refined queries for next iteration */
  refinedQueries?: string[]
  /** Whether this iteration is currently active */
  isActive?: boolean
  /** Whether the iteration is complete */
  isComplete?: boolean
  /** Key findings from this iteration */
  findings?: string[]
}

/**
 * DeepResearchSession represents a completed deep research session
 */
export interface DeepResearchSession {
  /** Unique session identifier */
  id: string
  /** Original research query */
  query: string
  /** Synthesized markdown report */
  report: string
  /** All iterations in the research process (hidden from UI) */
  iterations: ResearchIteration[]
  /** All citations from the research */
  citations: Citation[]
  /** Timestamp when research was completed */
  completedAt?: Date
  /** Whether saved to Holocron */
  savedToHolocron?: boolean
  /** Overall confidence level */
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW'
  /** Number of sources read */
  sourcesCount?: number
}

export interface DeepResearchDetailViewProps {
  /** The research session to display */
  session: DeepResearchSession
  /** Callback when back button is pressed */
  onBack?: () => void
  /** Callback when a citation URL is pressed */
  onCitationPress?: (url: string) => void
  /** Optional test ID */
  testID?: string
  /** Optional class name */
  className?: string
}

/**
 * ConfidenceBadge displays the confidence level with appropriate colors
 */
function ConfidenceBadge({ level }: { level: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  const config = {
    HIGH: {
      bg: 'bg-emerald-100 dark:bg-emerald-900/30',
      text: 'text-emerald-700 dark:text-emerald-400',
      label: 'High Confidence',
    },
    MEDIUM: {
      bg: 'bg-amber-100 dark:bg-amber-900/30',
      text: 'text-amber-700 dark:text-amber-400',
      label: 'Medium Confidence',
    },
    LOW: {
      bg: 'bg-red-100 dark:bg-red-900/30',
      text: 'text-red-700 dark:text-red-400',
      label: 'Low Confidence',
    },
  }

  const { bg, text, label } = config[level]

  return (
    <View className={cn('px-3 py-1 rounded-full', bg)}>
      <Text className={cn('text-sm font-medium', text)}>{label}</Text>
    </View>
  )
}

/**
 * CitationRow displays a single citation with optional link
 */
function CitationRow({
  citation,
  testID,
  onPress,
}: {
  citation: Citation
  testID?: string
  onPress?: (url: string) => void
}) {
  const content = (
    <View
      testID={testID}
      className="flex-row gap-3 border-b border-border py-3"
    >
      <View className="bg-muted flex h-6 w-6 items-center justify-center rounded-full">
        <Text className="text-xs font-semibold text-muted-foreground">
          {citation.id}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-sm text-foreground">
          {citation.title}
        </Text>
        {citation.url && (
          <View className="flex-row items-center gap-1 mt-0.5">
            <ExternalLink size={10} className="text-primary" />
            <Text className="text-xs text-primary" numberOfLines={1}>
              {citation.url}
            </Text>
          </View>
        )}
      </View>
    </View>
  )

  if (citation.url && onPress) {
    return (
      <Pressable
        onPress={() => onPress(citation.url!)}
        className="active:opacity-80"
        testID={`${testID}-pressable`}
      >
        {content}
      </Pressable>
    )
  }

  return content
}

/**
 * CollapsibleSources displays the sources in a collapsible section
 */
function CollapsibleSources({
  citations,
  onCitationPress,
}: {
  citations: Citation[]
  onCitationPress?: (url: string) => void
}) {
  const [isExpanded, setIsExpanded] = React.useState(false)

  if (citations.length === 0) return null

  return (
    <Card className="mb-4">
      <Pressable onPress={() => setIsExpanded(!isExpanded)}>
        <CardHeader>
          <View className="flex-row items-center justify-between">
            <CardTitle>Sources ({citations.length})</CardTitle>
            {isExpanded ? (
              <ChevronUp size={20} className="text-muted-foreground" />
            ) : (
              <ChevronDown size={20} className="text-muted-foreground" />
            )}
          </View>
        </CardHeader>
      </Pressable>

      {isExpanded && (
        <CardContent className="p-0">
          <View className="px-6">
            {citations.map((citation) => (
              <CitationRow
                key={citation.id}
                citation={citation}
                onPress={onCitationPress}
                testID={`citation-${citation.id}`}
              />
            ))}
          </View>
        </CardContent>
      )}
    </Card>
  )
}

/**
 * Extract report content from potentially JSON-wrapped report
 * Handles cases where the report is stored as JSON with { report, summary, confidence }
 */
function extractReportContent(report: string): string {
  // Check if report looks like JSON
  const trimmed = report.trim()
  if (trimmed.startsWith('{') && trimmed.includes('"report"')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed.report && typeof parsed.report === 'string') {
        return parsed.report
      }
    } catch {
      // Try extracting report field via regex if JSON parse fails
      const match = trimmed.match(/"report"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"(?:summary|confidence)"|"\s*})/);
      if (match) {
        // Unescape JSON string content
        return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      }
    }
  }
  return report
}

/**
 * DeepResearchDetailView displays the full results of a completed deep research session.
 *
 * Simplified single-pass view showing:
 * - Confidence badge
 * - Synthesized markdown report
 * - Collapsible sources section
 * - Holocron save confirmation
 */
export function DeepResearchDetailView({
  session,
  onBack,
  onCitationPress,
  testID = 'deep-research-detail-view',
  className,
}: DeepResearchDetailViewProps) {
  // Extract actual markdown content from potentially JSON-wrapped report
  const reportContent = React.useMemo(
    () => extractReportContent(session.report),
    [session.report]
  )

  // Determine confidence from session or infer from iterations
  const confidence = session.confidence ?? (
    session.iterations.length > 0
      ? (session.iterations[session.iterations.length - 1].coverageScore >= 4 ? 'HIGH' :
         session.iterations[session.iterations.length - 1].coverageScore >= 3 ? 'MEDIUM' : 'LOW')
      : 'MEDIUM'
  )

  return (
    <SafeAreaView testID={testID} className={cn('flex-1 bg-background', className)} edges={['top', 'left', 'right']}>
      {/* Header with back button */}
      <View className="border-border border-b bg-card px-4 py-3">
        <Pressable onPress={onBack} className="flex-row items-center gap-3">
          <ArrowLeft size={20} className="text-foreground" />
          <View className="flex-1">
            <Text className="text-foreground font-semibold" variant="h3" numberOfLines={1}>
              {session.query}
            </Text>
          </View>
        </Pressable>
      </View>

      <ScrollView
        testID={`${testID}-scroll`}
        className="flex-1"
        contentContainerClassName="p-4"
        showsVerticalScrollIndicator={true}
      >
        {/* Confidence Badge and Stats */}
        <View className="flex-row items-center justify-between mb-4">
          <ConfidenceBadge level={confidence} />
          {session.sourcesCount !== undefined && (
            <Text className="text-muted-foreground text-sm">
              {session.sourcesCount} sources analyzed
            </Text>
          )}
        </View>

        {/* Synthesized Report Section */}
        <Card className="mb-4">
          <CardHeader>
            <View className="flex-row items-center gap-2">
              <BookOpen size={18} className="text-primary" />
              <CardTitle>Research Report</CardTitle>
            </View>
          </CardHeader>
          <CardContent>
            <MarkdownView
              content={reportContent}
              variant="full"
              contentOnly
              className="text-foreground"
            />
          </CardContent>
        </Card>

        {/* Collapsible Sources Section */}
        <CollapsibleSources
          citations={session.citations}
          onCitationPress={onCitationPress}
        />

        {/* Holocron Save Confirmation */}
        {session.savedToHolocron && (
          <Card className="bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800">
            <CardContent className="flex-row items-center gap-3 py-4">
              <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" />
              <View className="flex-1">
                <Text className="text-emerald-900 dark:text-emerald-100 font-semibold">
                  Saved to Holocron
                </Text>
                <Text className="text-emerald-700 dark:text-emerald-300 text-sm">
                  This research report has been added to your knowledge base
                </Text>
              </View>
            </CardContent>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
