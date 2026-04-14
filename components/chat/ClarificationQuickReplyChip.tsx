import React from 'react'
import { Pressable } from 'react-native'
import { Text } from '@/components/ui/text'

export interface ClarificationQuickReplyChipProps {
  label: string
  index: number
  onQuickReply: (label: string) => void
  disabled?: boolean
}

export function ClarificationQuickReplyChip({
  label,
  index,
  onQuickReply,
  disabled = false,
}: ClarificationQuickReplyChipProps) {
  return (
    <Pressable
      testID={`quick-reply-chip-${index}`}
      onPress={() => {
        if (!disabled) {
          onQuickReply(label)
        }
      }}
      accessibilityState={{ disabled }}
      className="rounded-full border border-border bg-muted px-3 py-1.5 active:opacity-70 disabled:opacity-50"
    >
      <Text className="text-sm text-primary">{label}</Text>
    </Pressable>
  )
}
