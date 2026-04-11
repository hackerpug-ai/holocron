import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { View } from 'react-native'
import { ExternalLink } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

export interface Source {
  title: string
  url: string
  snippet: string
}

export interface AnswerWithSourcesCardData {
  card_type: 'answer_with_sources'
  sources: Source[]
  durationMs?: number
}

interface AnswerWithSourcesCardProps {
  /** Card data containing sources and metadata */
  cardData: AnswerWithSourcesCardData
  /** Optional className for custom styling */
  className?: string
}

/**
 * AnswerWithSourcesCard displays research sources with metadata
 * for answer_question tool results.
 *
 * Shows:
 * - Number of sources found
 * - Research duration
 * - Source list with titles and snippets
 */
export function AnswerWithSourcesCard({ cardData, className }: AnswerWithSourcesCardProps) {
  const { sources, durationMs } = cardData

  const content = (
    <Card className={cn('border-border/50', className)}>
      <CardContent className="p-3 gap-2">
        {/* Metadata header */}
        <View className="flex-row items-center gap-2">
          <Text className="text-xs text-muted-foreground">
            {sources.length} source{sources.length !== 1 ? 's' : ''} found
          </Text>
          {durationMs && (
            <>
              <View className="h-1 w-1 rounded-full bg-muted-foreground/50" />
              <Text className="text-xs text-muted-foreground">
                {Math.round(durationMs / 1000)}s
              </Text>
            </>
          )}
        </View>

        {/* Sources list */}
        <View className="gap-2">
          {sources.map((source, index) => (
            <View
              key={index}
              className="border-l-2 border-primary/50 pl-2 py-1 gap-0.5"
            >
              <Text className="text-sm font-medium text-primary leading-tight">
                [{index + 1}] {source.title}
              </Text>
              <Text
                className="text-xs text-muted-foreground leading-tight"
                numberOfLines={2}
              >
                {source.snippet}
              </Text>
            </View>
          ))}
        </View>
      </CardContent>
    </Card>
  )

  return content
}
