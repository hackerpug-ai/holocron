import { View, Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import type { MessageRole, MessageType } from '@/lib/types/conversations'
import { formatTimestamp } from '@/lib/formatTimestamp'
import { ResultCard, type ResultCardData, type CardType } from '@/components/ui/result-card'
import { DeepResearchLoadingCard } from '@/components/deep-research/DeepResearchLoadingCard'
import { DeepResearchConfirmationCard } from '@/components/deep-research/DeepResearchConfirmationCard'
import { Card } from '@/components/ui/card'
import { ResumeSessionList } from '@/components/deep-research/ResumeSessionList'

export interface MessageBubbleProps {
  role: MessageRole
  content: string
  message_type?: MessageType
  card_data?: Record<string, unknown> | null
  createdAt?: Date
  showTimestamp?: boolean
  testID?: string
  onCardPress?: (documentId: number) => void
  onSessionSelect?: (sessionId: string) => void
  onFinalResultPress?: (sessionId: string) => void
  loadingCardId?: number | null
  cardError?: string | null
}

export function MessageBubble({
  role,
  content,
  message_type,
  card_data,
  createdAt,
  showTimestamp = true,
  testID = 'message-bubble',
  onCardPress,
  onSessionSelect,
  onFinalResultPress,
  loadingCardId,
  cardError,
}: MessageBubbleProps) {
  const isUser = role === 'user'
  const isSystem = role === 'system'

  // Handle result_card messages - render ResultCard instead of text
  if (message_type === 'result_card' && card_data && !isUser) {
    return (
      <View
        className={cn('my-1 px-4', 'items-start')}
        testID={testID}
      >
        {renderResultCard(card_data, testID, onCardPress, onSessionSelect, onFinalResultPress, loadingCardId, cardError)}
        {showTimestamp && createdAt && (
          <Text
            variant="small"
            className="text-muted-foreground mt-0.5 text-xs self-start"
            testID={`${testID}-timestamp`}
          >
            {formatTimestamp(createdAt)}
          </Text>
        )}
      </View>
    )
  }

  return (
    <View
      className={cn(
        'my-1 px-4',
        isUser && 'items-end',
        isSystem && 'items-center',
        !isUser && !isSystem && 'items-start'
      )}
      testID={testID}
    >
      <View
        className={cn(
          'rounded-lg p-3',
          isUser && 'bg-primary max-w-[75%]',
          isSystem && 'bg-muted max-w-[80%]',
          !isUser && !isSystem && 'bg-muted max-w-[75%]'
        )}
      >
        <Text
          variant={isSystem ? 'small' : 'default'}
          className={cn(
            isUser && 'text-primary-foreground',
            isSystem && 'text-muted-foreground',
            !isUser && !isSystem && 'text-foreground'
          )}
        >
          {content}
        </Text>
      </View>
      {showTimestamp && createdAt && (
        <Text
          variant="small"
          className={cn(
            'text-muted-foreground mt-0.5 text-xs',
            isUser && 'self-end',
            isSystem && 'self-center',
            !isUser && !isSystem && 'self-start'
          )}
          testID={`${testID}-timestamp`}
        >
          {formatTimestamp(createdAt)}
        </Text>
      )}
    </View>
  )
}

/**
 * Transform backend card_data to ResultCard props and render
 * Handles both single cards and arrays of cards (for search results)
 */
function renderResultCard(
  card_data: Record<string, unknown>,
  testID: string,
  onCardPress?: (documentId: number) => void,
  onSessionSelect?: (sessionId: string) => void,
  onFinalResultPress?: (sessionId: string) => void,
  loadingCardId?: number | null,
  cardError?: string | null
) {
  // Check if card_data is an array (multiple search results)
  if (Array.isArray(card_data)) {
    return (
      <View className="gap-2">
        {card_data.map((card, index) => {
          const cardType = (card.card_type as CardType) || 'article'
          const documentId = card.document_id as number | undefined
          const isLoading = loadingCardId != null && documentId === loadingCardId

          return (
            <ResultCard
              key={index}
              cardType={cardType}
              data={card as unknown as ResultCardData}
              onPress={() => handleCardPress(card, onCardPress)}
              testID={`${testID}-card-${index}`}
              loading={isLoading}
              error={isLoading ? undefined : (cardError ?? undefined)}
            />
          )
        })}
      </View>
    )
  }

  // Single card - cast through unknown to satisfy TypeScript discriminated union
  const cardType = card_data.card_type as CardType | 'deep_research_loading' | 'deep_research_confirmation' | 'resume_session_list' | 'final_result'

  // Handle deep research loading card - render specialized component
  if (cardType === 'deep_research_loading') {
    return (
      <DeepResearchLoadingCard
        query={(card_data.query as string) ?? ''}
        message={(card_data.message as string | undefined)}
        testID={`${testID}-card`}
      />
    )
  }

  // Handle deep research confirmation card - render specialized component
  if (cardType === 'deep_research_confirmation') {
    return (
      <DeepResearchConfirmationCard
        sessionId={(card_data.session_id as string) ?? ''}
        topic={(card_data.topic as string) ?? ''}
        maxIterations={(card_data.max_iterations as number) ?? 5}
        testID={`${testID}-card`}
      />
    )
  }

  // Handle resume session list card - transform and render specialized component
  if (cardType === 'resume_session_list' && onSessionSelect) {
    const sessions = (card_data.sessions as Array<{
      session_id: string
      topic: string
      current_iteration: number
      max_iterations: number
      status: string
    }>) ?? []

    // Transform backend data to match ResumeSessionList component expectations
    // Backend uses snake_case, component uses camelCase
    const transformedSessions = sessions.map((session) => ({
      id: session.session_id,
      topic: session.topic,
      currentIteration: session.current_iteration,
      targetIterations: session.max_iterations,
      coverageScore: 3, // Default score - backend doesn't provide this yet
      dateStarted: new Date().toISOString(), // Backend doesn't provide created_at in card
    }))

    return (
      <ResumeSessionList
        sessions={transformedSessions}
        onSelect={onSessionSelect}
        testID={`${testID}-card`}
      />
    )
  }

  // Handle final result card - navigate to research detail view
  if (cardType === 'final_result') {
    const sessionId = (card_data.session_id as string) ?? ''

    // For now, render a simple pressable card with topic and score
    // TODO: Create dedicated FinalResultCard component in follow-up
    return (
      <Pressable
        onPress={() => onFinalResultPress?.(sessionId)}
        className="active:opacity-80 w-full"
        testID={`${testID}-final-result-pressable`}
      >
        <Card className="bg-card border-border">
          <View className="p-4 gap-2">
            <View className="flex-row items-center gap-2">
              <Text className="text-foreground font-semibold flex-1 text-lg">
                {(card_data.topic as string) ?? 'Research Complete'}
              </Text>
              <View className="bg-primary/20 px-2 py-1 rounded-full">
                <Text className="text-primary text-xs font-semibold">
                  Score: {card_data.final_coverage_score as number}/5
                </Text>
              </View>
            </View>
            <Text className="text-muted-foreground text-sm" numberOfLines={2}>
              {(card_data.findings_summary as string) ?? 'Tap to view full research findings.'}
            </Text>
            <View className="flex-row items-center gap-1 mt-1">
              <Text className="text-muted-foreground text-xs">
                {card_data.total_iterations as number} iterations completed
              </Text>
              <Text className="text-muted-foreground">→</Text>
            </View>
          </View>
        </Card>
      </Pressable>
    )
  }

  const documentId = card_data.document_id as number | undefined
  const isLoading = loadingCardId != null && documentId === loadingCardId

  return (
    <ResultCard
      cardType={cardType as CardType}
      data={card_data as unknown as ResultCardData}
      onPress={() => handleCardPress(card_data, onCardPress)}
      testID={`${testID}-card`}
      loading={isLoading}
      error={isLoading ? undefined : (cardError ?? undefined)}
    />
  )
}

/**
 * Handle card press - triggers navigation to ArticleDetail overlay
 * Extracts document_id from card_data and calls onCardPress callback
 */
function handleCardPress(
  card_data: Record<string, unknown>,
  onCardPress?: (documentId: number) => void
) {
  // Extract document_id from card_data (number type)
  const documentId = card_data.document_id as number | undefined
  if (documentId !== undefined && onCardPress) {
    onCardPress(documentId)
  }
}
