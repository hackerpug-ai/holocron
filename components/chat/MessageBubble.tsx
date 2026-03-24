import { View, Pressable, Linking } from 'react-native'
import { Text } from '@/components/ui/text'
import { MarkdownText } from '@/components/markdown'
import { cn } from '@/lib/utils'
import type { MessageRole, MessageType } from '@/lib/types/conversations'
import { formatTimestamp } from '@/lib/formatTimestamp'
import { ResultCard, type ResultCardData, type CardType } from '@/components/ui/result-card'
import { DeepResearchLoadingCard } from '@/components/deep-research/DeepResearchLoadingCard'
import { DeepResearchConfirmationCard } from '@/components/deep-research/DeepResearchConfirmationCard'
import { Card } from '@/components/ui/card'
import { AssimilationCard } from '@/components/AssimilationCard'
import { ShopResultsCard, ShopLoadingCard } from '@/components/shop'
import { SubscriptionAddedCard, SubscriptionListCard } from '@/components/subscriptions'
import { WhatsNewReportCard, WhatsNewLoadingCard } from '@/components/whats-new'
import { ToolSearchResultsCard, ToolAddingCard, ToolAddedCard } from '@/components/toolbelt'
import { DocumentSavedCard, DocumentContextCard } from '@/components/documents'
import { ToolApprovalCardWithConvex } from '@/components/agent/ToolApprovalCard'
import { StreamingCursor } from '@/components/chat/StreamingCursor'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import type {
  ShopListingCardData,
  SubscriptionAddedCardData,
  SubscriptionListCardData,
  WhatsNewReportCardData,
  WhatsNewLoadingCardData,
  ToolSearchResultsCardData,
  ToolAddingCardData,
  ToolAddedCardData,
  DocumentSavedCardData,
  DocumentContextCardData,
} from '@/lib/types/chat'

// Human-readable status labels for research sessions
const STATUS_LABELS: Record<string, string> = {
  'pending': 'Starting research...',
  'in_progress': 'Researching...',
  'running': 'Running iteration...',
  'completed': 'Complete',
  'error': 'Error occurred',
  'cancelled': 'Cancelled',
}

export interface MessageBubbleProps {
  role: MessageRole
  content: string
  message_type?: MessageType
  card_data?: Record<string, unknown> | null
  toolCallId?: string | null
  isStreaming?: boolean
  createdAt?: Date
  showTimestamp?: boolean
  testID?: string
  onCardPress?: (documentId: number) => void
  onFinalResultPress?: (sessionId: string) => void
  onWhatsNewReportPress?: (reportId: string) => void
  /** Navigate to a document with optional highlight at a specific block */
  onDocumentContextNavigate?: (documentId: string, blockIndex?: number) => void
  loadingCardId?: number | null
  cardError?: string | null
}

export function MessageBubble({
  role,
  content,
  message_type,
  card_data,
  toolCallId,
  isStreaming = false,
  createdAt,
  showTimestamp = true,
  testID = 'message-bubble',
  onCardPress,
  onFinalResultPress,
  onWhatsNewReportPress,
  onDocumentContextNavigate,
  loadingCardId,
  cardError,
}: MessageBubbleProps) {
  const isUser = role === 'user'
  const isSystem = role === 'system'

  // Handle tool_approval messages - render live tool approval card
  if (message_type === 'tool_approval' && toolCallId) {
    return (
      <View
        className={cn('my-1 px-4')}
        testID={testID}
      >
        <ToolApprovalBubble
          toolCallId={toolCallId as Id<'toolCalls'>}
          cardData={card_data ?? undefined}
        />
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

  // Handle result_card messages - render specialized cards
  if (message_type === 'result_card' && card_data) {
    // Suppress iteration cards entirely - they're consolidated in DeepResearchLoadingCard
    const cardType = card_data.card_type as string
    if (cardType === 'deep_research_iteration') {
      return null
    }

    // Render result card for non-user messages
    if (!isUser) {
      const cardContent = renderResultCard(card_data, message_type, testID, onCardPress, onFinalResultPress, onWhatsNewReportPress, loadingCardId, cardError, onDocumentContextNavigate)

      // If renderResultCard returns null, suppress the entire message
      if (cardContent === null) {
        return null
      }

      return (
        <View
          className={cn('my-1 px-4')}
          testID={testID}
        >
          <View className="w-full">
            {cardContent}
          </View>
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
        {!isUser && !isSystem ? (
          <View>
            <MarkdownText
              content={content}
              onLinkPress={(url) => Linking.openURL(url)}
              testID={`${testID}-markdown`}
            />
            {isStreaming && <StreamingCursor />}
          </View>
        ) : (
          <View className={cn('flex-row flex-wrap items-end')}>
            <Text
              variant={isSystem ? 'small' : 'default'}
              className={cn(
                isUser && 'text-primary-foreground',
                isSystem && 'text-muted-foreground',
              )}
            >
              {content}
            </Text>
          </View>
        )}
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
 * Wrapper that queries live toolCall status and renders ToolApprovalCardWithConvex.
 * Reads from Convex so status updates (approved/executing/completed) are reactive.
 */
function ToolApprovalBubble({
  toolCallId,
  cardData,
}: {
  toolCallId: Id<'toolCalls'>
  cardData?: Record<string, unknown>
}) {
  const toolCall = useQuery(api.toolCalls.queries.get, { id: toolCallId })

  if (!toolCall) return null

  return (
    <ToolApprovalCardWithConvex
      approvalId={toolCallId}
      toolName={toolCall.toolName}
      toolDisplayName={toolCall.toolDisplayName}
      parameters={(toolCall.toolArgs as Record<string, unknown>) ?? {}}
      reasoning={cardData?.reasoning as string | undefined}
      status={toolCall.status as 'pending' | 'approved' | 'rejected' | 'executing' | 'completed'}
    />
  )
}

/**
 * Wrapper component for DeepResearchLoadingCard that polls session status
 */
function DeepResearchLoadingCardWithPolling({
  sessionId,
  topic,
  researchType = 'deep',
  testID,
  onFinalResultPress
}: {
  sessionId: string
  topic: string
  researchType?: 'quick' | 'deep'
  testID: string
  onFinalResultPress?: (sessionId: string) => void
}) {
  // Poll session status for real-time updates
  const session = useQuery(
    api.research.queries.getDeepResearchSession,
    { sessionId: sessionId as Id<"deepResearchSessions"> }
  )

  // Check if session is complete
  const isComplete = session?.status === 'completed'

  // Determine confidence from coverage score (simplified single-pass model)
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' | undefined
  if (isComplete && session?.currentCoverageScore) {
    confidence = session.currentCoverageScore >= 4 ? 'HIGH' :
                 session.currentCoverageScore >= 3 ? 'MEDIUM' : 'LOW'
  }

  return (
    <DeepResearchLoadingCard
      query={topic}
      researchType={researchType}
      message={session?.status ? STATUS_LABELS[session.status] || session.status : undefined}
      isComplete={isComplete}
      confidence={confidence}
      sessionId={sessionId}
      onPress={() => onFinalResultPress?.(sessionId)}
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
  onFinalResultPress?: (sessionId: string) => void,
  onWhatsNewReportPress?: (reportId: string) => void,
  loadingCardId?: number | null,
  cardError?: string | null,
  onDocumentContextNavigate?: (documentId: string, blockIndex?: number) => void,
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
  const cardType = card_data.card_type as CardType | 'deep_research_loading' | 'deep_research_iteration' | 'deep_research_confirmation' | 'final_result' | 'assimilation' | 'shop_results' | 'shop_loading' | 'subscription_added' | 'subscription_list' | 'whats_new_report' | 'whats_new_loading' | 'tool_search_results' | 'tool_adding' | 'tool_added' | 'document_saved' | 'document_context'

  // Handle shop results card
  if (cardType === 'shop_results') {
    const listings = (card_data.listings as ShopListingCardData[]) || []
    return (
      <ShopResultsCard
        sessionId={(card_data.session_id as string) || ''}
        query={(card_data.query as string) || ''}
        totalListings={(card_data.total_listings as number) || 0}
        bestDealId={card_data.best_deal_id as string | undefined}
        listings={listings}
        status={(card_data.status as 'searching' | 'completed' | 'failed') || 'completed'}
        durationMs={card_data.duration_ms as number | undefined}
        testID={`${testID}-shop-results`}
      />
    )
  }

  // Handle shop loading card
  if (cardType === 'shop_loading') {
    return (
      <ShopLoadingCard
        sessionId={(card_data.session_id as string) || ''}
        query={(card_data.query as string) || ''}
        message={card_data.message as string | undefined}
        testID={`${testID}-shop-loading`}
      />
    )
  }

  // Handle subscription added card
  if (cardType === 'subscription_added') {
    return (
      <SubscriptionAddedCard
        data={card_data as unknown as SubscriptionAddedCardData}
        testID={`${testID}-subscription-added`}
      />
    )
  }

  // Handle subscription list card
  if (cardType === 'subscription_list') {
    return (
      <SubscriptionListCard
        data={card_data as unknown as SubscriptionListCardData}
        testID={`${testID}-subscription-list`}
      />
    )
  }

  // Handle what's new report card
  if (cardType === 'whats_new_report') {
    const reportData = card_data as unknown as WhatsNewReportCardData
    return (
      <Pressable
        onPress={() => onWhatsNewReportPress?.(reportData.report_id)}
        className="active:opacity-80 w-full"
        testID={`${testID}-whats-new-report-pressable`}
      >
        <WhatsNewReportCard
          data={reportData}
          testID={`${testID}-whats-new-report`}
        />
      </Pressable>
    )
  }

  // Handle what's new loading card
  if (cardType === 'whats_new_loading') {
    return (
      <WhatsNewLoadingCard
        data={card_data as unknown as WhatsNewLoadingCardData}
        testID={`${testID}-whats-new-loading`}
      />
    )
  }

  // Handle tool search results card
  if (cardType === 'tool_search_results') {
    return (
      <ToolSearchResultsCard
        data={card_data as unknown as ToolSearchResultsCardData}
        testID={`${testID}-tool-search-results`}
      />
    )
  }

  // Handle tool adding card (loading state)
  if (cardType === 'tool_adding') {
    return (
      <ToolAddingCard
        data={card_data as unknown as ToolAddingCardData}
        testID={`${testID}-tool-adding`}
      />
    )
  }

  // Handle tool added card (confirmation)
  if (cardType === 'tool_added') {
    return (
      <ToolAddedCard
        data={card_data as unknown as ToolAddedCardData}
        testID={`${testID}-tool-added`}
      />
    )
  }

  // Handle document saved card
  if (cardType === 'document_saved') {
    return (
      <DocumentSavedCard
        data={card_data as unknown as DocumentSavedCardData}
        testID={`${testID}-document-saved`}
      />
    )
  }

  // Handle document context card (added from document viewer)
  if (cardType === 'document_context') {
    const contextData = card_data as unknown as DocumentContextCardData
    const isExcerpt = contextData.scope === 'excerpt'

    // For full doc: wrap in Pressable to navigate directly
    // For excerpts: the card manages its own reader sheet internally
    if (!isExcerpt) {
      return (
        <Pressable
          onPress={() => onDocumentContextNavigate?.(contextData.document_id)}
          className="active:opacity-80 w-full"
          testID={`${testID}-document-context-pressable`}
        >
          <DocumentContextCard
            data={contextData}
            onNavigateToDocument={onDocumentContextNavigate}
            testID={`${testID}-document-context`}
          />
        </Pressable>
      )
    }

    return (
      <DocumentContextCard
        data={contextData}
        onNavigateToDocument={onDocumentContextNavigate}
        testID={`${testID}-document-context`}
      />
    )
  }

  // Handle deep research loading card - check card_type and status
  if (cardType === 'deep_research_loading') {
    const status = card_data.status as string
    const topic = (card_data.topic as string) ?? (card_data.query as string) ?? ''
    const sessionId = (card_data.session_id as string) ?? ''
    // Determine research type from card_data.research_type field
    // 'simple' maps to 'quick', anything else (including undefined) maps to 'deep'
    const researchType: 'quick' | 'deep' = card_data.research_type === 'simple' ? 'quick' : 'deep'

    // In progress - show loading card with live polling
    if (status === 'in_progress' && sessionId) {
      return (
        <DeepResearchLoadingCardWithPolling
          sessionId={sessionId}
          topic={topic}
          researchType={researchType}
          testID={`${testID}-card`}
          onFinalResultPress={onFinalResultPress}
        />
      )
    }
  }

  // SUPPRESS individual iteration cards - they're now shown in the expandable loading card
  // The DeepResearchLoadingCardWithPolling fetches all iterations from the session
  // Handle deep research iteration card - show progress for each iteration
  if (cardType === 'deep_research_iteration') {
    // Return null to suppress individual iteration cards
    // They are consolidated in the DeepResearchLoadingCard via polling
    return null
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
