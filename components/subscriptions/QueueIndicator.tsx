import React from 'react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'

interface QueueIndicatorProps {
  count: number
  testID?: string
}

/**
 * QueueIndicator - Shows the number of items queued for later submission
 */
export function QueueIndicator({ count, testID = 'queue-indicator' }: QueueIndicatorProps) {
  if (count === 0) {
    return null
  }

  return (
    <View
      className="bg-blue-500 dark:bg-blue-600 px-3 py-1.5 rounded-full items-center justify-center self-start"
      testID={testID}
    >
      <Text variant="small" className="text-blue-950 dark:text-blue-100">
        {count} feedback {count === 1 ? 'item' : 'items'} queued
      </Text>
    </View>
  )
}
