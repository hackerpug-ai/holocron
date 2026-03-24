import { ArticleCard } from '@/components/ArticleCard'
import { CategoryBadge, type CategoryType } from '@/components/CategoryBadge'
import { IterationCard } from '@/components/IterationCard'
import { SectionHeader } from '@/components/SectionHeader'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { BookmarkPlus, Calendar, Clock, Share2 } from '@/components/ui/icons'
import { Pressable, ScrollView, View, type ViewProps } from 'react-native'

interface Iteration {
  iterationNumber: number
  coverageScore: number
  feedback?: string
  refinedQueries?: string[]
  isComplete: boolean
}

interface RelatedArticle {
  id: string
  title: string
  category: CategoryType
  date: string
  snippet?: string
}

interface ResearchResultScreenProps extends Omit<ViewProps, 'children'> {
  /** Research query/title */
  title: string
  /** Research category */
  category: CategoryType
  /** Completion date */
  date: string | Date
  /** Research findings/summary */
  summary: string
  /** Total elapsed time in seconds */
  elapsedTime: number
  /** Research iterations (for deep research) */
  iterations?: Iteration[]
  /** Sources used */
  sources?: string[]
  /** Related articles in the knowledge base */
  relatedArticles?: RelatedArticle[]
  /** Callback when save button is pressed */
  onSavePress?: () => void
  /** Callback when share button is pressed */
  onSharePress?: () => void
  /** Callback when a related article is pressed */
  onRelatedArticlePress?: (_article: RelatedArticle) => void
  /** Callback when start new research is pressed */
  onNewResearchPress?: () => void
}

function formatElapsedTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins === 0) return `${secs} seconds`
  if (mins === 1) return `1 minute ${secs} seconds`
  return `${mins} minutes ${secs} seconds`
}

/**
 * ResearchResultScreen displays completed research findings with iterations and related content.
 * Composes ArticleCard, SectionHeader, IterationCard, and CategoryBadge atoms.
 */
export function ResearchResultScreen({
  title,
  category,
  date,
  summary,
  elapsedTime,
  iterations = [],
  sources = [],
  relatedArticles = [],
  onSavePress,
  onSharePress,
  onRelatedArticlePress,
  onNewResearchPress,
  className,
  ...props
}: ResearchResultScreenProps) {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const formattedTime = dateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  const finalScore = iterations.length > 0
    ? iterations[iterations.length - 1].coverageScore
    : undefined

  return (
    <ScrollView
      className={cn('flex-1 bg-background', className)}
      contentContainerClassName="pb-8"
      testID="research-result-screen"
      {...props}
    >
      {/* Header */}
      <View className="border-b border-border px-4 pb-4 pt-4">
        <View className="mb-3 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <CategoryBadge category={category} />
            {iterations.length > 0 && (
              <Text className="text-muted-foreground text-xs">
                {iterations.length} iterations
              </Text>
            )}
            {finalScore !== undefined && (
              <View className="rounded-full bg-success/10 px-2 py-0.5">
                <Text className="text-xs font-semibold text-success">
                  Score: {finalScore}/5
                </Text>
              </View>
            )}
          </View>
          <View className="flex-row gap-2">
            {onSavePress && (
              <Pressable
                onPress={onSavePress}
                className="rounded-full p-2 active:bg-muted"
                testID="save-result-button"
              >
                <BookmarkPlus size={20} className="text-muted-foreground" />
              </Pressable>
            )}
            {onSharePress && (
              <Pressable
                onPress={onSharePress}
                className="rounded-full p-2 active:bg-muted"
                testID="share-result-button"
              >
                <Share2 size={20} className="text-muted-foreground" />
              </Pressable>
            )}
          </View>
        </View>

        <Text className="text-foreground mb-3 text-2xl font-bold">{title}</Text>

        <View className="flex-row flex-wrap items-center gap-4">
          <View className="flex-row items-center gap-1">
            <Calendar size={14} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-sm">
              {formattedDate} at {formattedTime}
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Clock size={14} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-sm">
              {formatElapsedTime(elapsedTime)}
            </Text>
          </View>
        </View>
      </View>

      {/* Summary */}
      <View className="px-4 pt-4">
        <SectionHeader title="Summary" size="md" className="mb-3" />
        <Text className="text-foreground text-base leading-7">{summary}</Text>
      </View>

      {/* Iterations */}
      {iterations.length > 0 && (
        <View className="px-4 pt-6">
          <SectionHeader title="Research Iterations" size="md" className="mb-3" />
          <View className="gap-3">
            {iterations.map((iteration, index) => (
              <IterationCard
                key={iteration.iterationNumber}
                iterationNumber={iteration.iterationNumber}
                coverageScore={iteration.coverageScore}
                feedback={iteration.feedback}
                refinedQueries={iteration.refinedQueries}
                isComplete={iteration.isComplete}
                defaultExpanded={index === iterations.length - 1}
              />
            ))}
          </View>
        </View>
      )}

      {/* Sources */}
      {sources.length > 0 && (
        <View className="px-4 pt-6">
          <SectionHeader title={`Sources (${sources.length})`} size="md" className="mb-3" />
          <View className="flex-row flex-wrap gap-2">
            {sources.map((source, index) => (
              <View
                key={index}
                className="rounded-full bg-muted px-3 py-1.5"
              >
                <Text className="text-foreground text-sm">{source}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Related Articles */}
      {relatedArticles.length > 0 && (
        <View className="px-4 pt-6">
          <SectionHeader title="Related in Knowledge Base" size="md" className="mb-3" />
          <View className="gap-3">
            {relatedArticles.map((article) => (
              <ArticleCard
                key={article.id}
                title={article.title}
                category={article.category}
                date={article.date}
                snippet={article.snippet}
                compact
                onPress={() => onRelatedArticlePress?.(article)}
              />
            ))}
          </View>
        </View>
      )}

      {/* Actions */}
      <View className="mt-6 px-4">
        <Button onPress={onNewResearchPress} variant="outline" testID="new-research-button">
          <Text>Start New Research</Text>
        </Button>
      </View>
    </ScrollView>
  )
}
