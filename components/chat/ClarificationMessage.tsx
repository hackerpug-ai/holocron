import React from 'react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { ClarificationQuickReplyChip } from './ClarificationQuickReplyChip'

export interface ClarificationMessageProps {
  question: string
  quickReplies?: string[]
  answered?: boolean
  userResponse?: string
  onQuickReply?: (label: string) => void
}

export function ClarificationMessage({
  question,
  quickReplies,
  answered = false,
  userResponse,
  onQuickReply,
}: ClarificationMessageProps) {
  return (
    <View testID="clarification-message" className="border-l-2 border-primary pl-3 py-2 my-2">
      <Text className="text-xs uppercase tracking-wide text-primary mb-1">
        Quick question
      </Text>
      <Text testID="clarification-question" className="text-base text-foreground">
        {question}
      </Text>
      {quickReplies && quickReplies.length > 0 && (
        <View className="flex-row flex-wrap gap-2 mt-2">
          {quickReplies.map((label, i) => (
            <ClarificationQuickReplyChip
              key={`${label}-${i}`}
              label={label}
              index={i}
              disabled={answered}
              onQuickReply={(l) => onQuickReply?.(l)}
            />
          ))}
        </View>
      )}
      {userResponse && (
        <View
          testID="clarification-user-response"
          className="mt-2 ml-2 pl-2 border-l border-border"
        >
          <Text className="text-sm text-muted-foreground">{userResponse}</Text>
        </View>
      )}
    </View>
  )
}
