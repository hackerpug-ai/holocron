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
import { AssimilationCard } from '@/components/AssimilationCard'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

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

  // Handle result_card messages - render specialized cards
  if (message_type === 'result_card' && card_data) {
    console.log('[MessageBubble] result_card detected:', {
      message_type,
      card_data,
      role,
      isUser,
      hasCardData: !!card_data,
      cardType: card_data.card_type
    })

    // Render result card for non-user messages
    if (!isUser) {
      return (
        <View
          className={cn('my-1 px-4', 'items-start')}
          testID={testID}
        >
          {renderResultCard(card_data, message_type, testID, onCardPress, onSessionSelect, onFinalResultPress, loadingCardId, cardError)}
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
 * Wrapper component for DeepResearchLoadingCard that polls session status
 */
function DeepResearchLoadingCardWithPolling({
  sessionId,
  topic,
  testID
}: {
  sessionId: string
  topic: string
  testID: string
}) {
  // Poll session status for real-time updates
  const session = useQuery(
    api.research.queries.getDeepResearchSession,
    { sessionId: sessionId as Id<"deepResearchSessions"> }
  )

  // Extract steps from session if available (card_data will be updated by backend)
  const steps = session?.iterations?.map((iter, index) => ({
    id: `iteration-${iter.iterationNumber}`,
    label: `Iteration ${iter.iterationNumber} - Coverage: ${iter.coverageScore || 0}/5`,
    status: (iter.status === 'completed' ? 'completed' : 'pending') as 'completed' | 'in-progress' | 'pending',
    detail: iter.feedback || undefined,
  }))

  return (
    <DeepResearchLoadingCard
      query={topic}
      message={session?.status ? `Status: ${session.status}` : undefined}
      steps={steps}
      testID={testID}
    />
  )
}

/**
 * Transform backend card_data to ResultCard props and render
 * Handles both single cards and arrays of cards (for search results)
 */
function renderResultCard(
  card_data: Record<string, unknown>,
  message_type: MessageType | undefined,
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
  const cardType = card_data.card_type as CardType | 'deep_research_loading' | 'deep_research_iteration' | 'deep_research_confirmation' | 'resume_session_list' | 'final_result' | 'assimilation'

  // Handle deep research loading card - check card_type and status
  if (cardType === 'deep_research_loading') {
    const status = card_data.status as string
    const topic = (card_data.topic as string) ?? (card_data.query as string) ?? ''
    const sessionId = (card_data.session_id as string) ?? ''

    // In progress - show loading card with live polling
    if (status === 'in_progress' && sessionId) {
      return (
        <DeepResearchLoadingCardWithPolling
          sessionId={sessionId}
          topic={topic}
          testID={`${testID}-card`}
        />
      )
    }
  }

  // Handle deep research iteration card - show progress for each iteration
  if (cardType === 'deep_research_iteration') {
    const iterationNumber = (card_data.iteration_number as number) ?? 0
    const coverageScore = (card_data.coverage_score as number) ?? 0
    const feedback = (card_data.feedback as string) ?? ''
    const estimatedRemaining = (card_data.estimated_remaining as number) ?? 0

    return (
      <Card className="bg-card border-border border-l-4 border-l-cyan-500" testID={`${testID}-iteration-card`}>
        <View className="p-4 gap-2">
          <View className="flex-row items-center gap-2">
            <Text className="text-foreground font-semibold flex-1">
              Iteration {iterationNumber}
            </Text>
            <View className="bg-cyan-500/20 px-2 py-1 rounded-full">
              <Text className="text-cyan-500 text-xs font-semibold">
                Coverage: {coverageScore}/5
              </Text>
            </View>
          </View>
          {feedback && (
            <Text className="text-muted-foreground text-sm" numberOfLines={2}>
              {feedback}
            </Text>
          )}
          {estimatedRemaining > 0 && (
            <Text className="text-muted-foreground text-xs">
              {estimatedRemaining} iteration{estimatedRemaining !== 1 ? 's' : ''} remaining
            </Text>
          )}
        </View>
      </Card>
    )
  }

  // Handle deep research completion - check status for completed research
  if (message_type === 'result_card' && card_data.status === 'completed') {
    const topic = (card_data.topic as string) ?? (card_data.query as string) ?? ''
    const sessionId = (card_data.session_id as string) ?? ''

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
                {topic || 'Research Complete'}
              </Text>
              <View className="bg-primary/20 px-2 py-1 rounded-full">
                <Text className="text-primary text-xs font-semibold">
                  Score: {(card_data.final_coverage_score as number) ?? 3}/5
                </Text>
              </View>
            </View>
            <Text className="text-muted-foreground text-sm" numberOfLines={2}>
              {(card_data.findings_summary as string) ?? 'Tap to view full research findings.'}
            </Text>
            <View className="flex-row items-center gap-1 mt-1">
              <Text className="text-muted-foreground text-xs">
                {(card_data.total_iterations as number) ?? 0} iterations completed
              </Text>
              <Text className="text-muted-foreground">→</Text>
            </View>
          </View>
        </Card>
      </Pressable>
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

  // Handle assimilation card - display Borg-themed repository analysis
  if (cardType === 'assimilation') {
    const documentId = card_data.document_id as Id<'documents'>
    const repositoryName = (card_data.repository_name as string) ?? ''
    const repositoryUrl = (card_data.repository_url as string) ?? ''
    const primaryLanguage = (card_data.primary_language as string) ?? undefined
    const stars = (card_data.stars as number) ?? undefined
    const sophisticationRating = (card_data.sophistication_rating as number) ?? 3
    const trackRatings = (card_data.track_ratings as {
      architecture: number
      patterns: number
      documentation: number
      dependencies: number
      testing: number
    }) ?? {
      architecture: 3,
      patterns: 3,
      documentation: 3,
      dependencies: 3,
      testing: 3,
    }

    return (
      <AssimilationCard
        documentId={documentId}
        metadata={{
          repositoryName,
          repositoryUrl,
          primaryLanguage,
          stars,
          sophisticationRating,
          trackRatings,
        }}
        snippet={(card_data.snippet as string) ?? undefined}
        date={(card_data.date as string) ?? undefined}
        onPress={() => handleCardPress(card_data, onCardPress)}
      />
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
