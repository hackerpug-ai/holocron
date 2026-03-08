import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { ArrowLeft, BookOpen, CheckCircle2 } from 'lucide-react-native'
import * as React from 'react'
import { ScrollView, View, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { IterationCard } from '../IterationCard'
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
  /** All iterations in the research process */
  iterations: ResearchIteration[]
  /** All citations from the research */
  citations: Citation[]
  /** Timestamp when research was completed */
  completedAt?: Date
  /** Whether saved to Holocron */
  savedToHolocron?: boolean
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
 * ScoreProgression displays the score progression across iterations
 */
function ScoreProgression({ iterations }: { iterations: ResearchIteration[] }) {
  const sortedIterations = [...iterations].sort(
    (a, b) => a.iterationNumber - b.iterationNumber
  )

  const getScoreColor = (score: number) => {
    const colors = {
      1: 'bg-red-500',
      2: 'bg-orange-500',
      3: 'bg-yellow-500',
      4: 'bg-green-500',
      5: 'bg-emerald-500',
    }
    return colors[score as keyof typeof colors] || 'bg-gray-500'
  }

  return (
    <View className="mb-4 flex-row items-center gap-2">
      {sortedIterations.map((iteration, index) => (
        <View key={iteration.iterationNumber} className="flex-1 flex-row items-center">
          <View
            className={cn(
              'h-2 rounded-full',
              getScoreColor(iteration.coverageScore)
            )}
            style={{ flex: 1 }}
          />
          {index < sortedIterations.length - 1 && (
            <View className="w-2 h-0.5 bg-border" />
          )}
        </View>
      ))}
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
          <Text className="text-xs text-primary mt-0.5">
            {citation.url}
          </Text>
        )}
      </View>
    </View>
  )

  // Make pressable if URL exists and onPress is provided
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
 * DeepResearchDetailView displays the full results of a completed deep research session.
 *
 * Shows:
 * - Synthesized markdown report
 * - Iteration timeline with score progression
 * - Expandable iteration cards with findings and feedback
 * - Complete citations list
 * - Holocron save confirmation
 */
export function DeepResearchDetailView({
  session,
  onBack,
  onCitationPress,
  testID = 'deep-research-detail-view',
  className,
}: DeepResearchDetailViewProps) {
  const [expandedIterations, setExpandedIterations] = React.useState<Set<number>>(
    new Set()
  )

  const toggleIteration = (iterationNumber: number) => {
    setExpandedIterations((prev) => {
      const next = new Set(prev)
      if (next.has(iterationNumber)) {
        next.delete(iterationNumber)
      } else {
        next.add(iterationNumber)
      }
      return next
    })
  }

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
        {/* Synthesized Report Section */}
        <Card className="mb-4">
          <CardHeader>
            <View className="flex-row items-center gap-2">
              <BookOpen size={18} className="text-primary" />
              <CardTitle>Synthesized Report</CardTitle>
            </View>
          </CardHeader>
          <CardContent>
            <MarkdownView
              content={session.report}
              variant="full"
              contentOnly
              className="text-foreground"
            />
          </CardContent>
        </Card>

        {/* Iteration Timeline Section */}
        <Card className="mb-4">
          <CardHeader>
            <View className="flex-row items-center justify-between">
              <CardTitle>Research Journey</CardTitle>
              <Text className="text-muted-foreground text-sm">
                {session.iterations.length} {session.iterations.length === 1 ? 'iteration' : 'iterations'}
              </Text>
            </View>
          </CardHeader>
          <CardContent>
            {/* Score Progression Visualization */}
            <View className="mb-4">
              <Text className="text-muted-foreground mb-2 text-xs uppercase tracking-wide">
                Coverage Progression
              </Text>
              <ScoreProgression iterations={session.iterations} />
            </View>

            {/* Iteration Cards */}
            <View className="gap-3">
              {session.iterations.map((iteration) => (
                <IterationCard
                  key={iteration.iterationNumber}
                  {...iteration}
                  defaultExpanded={expandedIterations.has(iteration.iterationNumber)}
                  onPress={() => toggleIteration(iteration.iterationNumber)}
                  testID={`iteration-${iteration.iterationNumber}`}
                />
              ))}
            </View>
          </CardContent>
        </Card>

        {/* Citations Section */}
        {session.citations.length > 0 && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Citations ({session.citations.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <View className="px-6">
                {session.citations.map((citation) => (
                  <CitationRow
                    key={citation.id}
                    citation={citation}
                    onPress={onCitationPress}
                    testID={`citation-${citation.id}`}
                  />
                ))}
              </View>
            </CardContent>
          </Card>
        )}

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
