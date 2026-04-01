import React from 'react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

interface OfflineBannerProps {
  testID?: string
}

/**
 * OfflineBanner - Displays a banner when the device is offline
 * Shows queued feedback count if there are pending items
 */
export function OfflineBanner({ testID = 'offline-banner' }: OfflineBannerProps) {
  const { isOffline } = useNetworkStatus()

  if (!isOffline) {
    return null
  }

  return (
    <View
      className="bg-amber-500 dark:bg-amber-600 px-4 py-2 items-center justify-center"
      testID={testID}
    >
      <Text variant="small" className="text-amber-950 dark:text-amber-100 text-center">
        You're offline. Showing cached content.
      </Text>
    </View>
  )
}
