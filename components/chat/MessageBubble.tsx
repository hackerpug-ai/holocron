import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import type { MessageRole, MessageType } from '@/lib/types/conversations'
import { formatTimestamp } from '@/lib/formatTimestamp'
import { ResultCard, type ResultCardData, type CardType } from '@/components/ui/result-card'

export interface MessageBubbleProps {
  role: MessageRole
  content: string
  message_type?: MessageType
  card_data?: Record<string, unknown> | null
  createdAt?: Date
  showTimestamp?: boolean
  testID?: string
}

export function MessageBubble({
  role,
  content,
  message_type,
  card_data,
  createdAt,
  showTimestamp = true,
  testID = 'message-bubble',
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
        {renderResultCard(card_data, testID)}
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
function renderResultCard(card_data: Record<string, unknown>, testID: string) {
  // Check if card_data is an array (multiple search results)
  if (Array.isArray(card_data)) {
    return (
      <View className="gap-2">
        {card_data.map((card, index) => (
          <ResultCard
            key={index}
            cardType={card.card_type as CardType}
            data={card as ResultCardData}
            onPress={handleCardPress}
            testID={`${testID}-card-${index}`}
          />
        ))}
      </View>
    )
  }

  // Single card
  const cardType = card_data.card_type as CardType
  return (
    <ResultCard
      cardType={cardType}
      data={card_data as ResultCardData}
      onPress={handleCardPress}
      testID={`${testID}-card`}
    />
  )
}

/**
 * Handle card press - placeholder for US-031 (ArticleDetail navigation)
 * TODO: Wire to ArticleDetail overlay in US-031
 */
function handleCardPress(documentId?: string) {
  console.log('Card pressed, documentId:', documentId)
  // Navigation to ArticleDetail will be implemented in US-031
}
