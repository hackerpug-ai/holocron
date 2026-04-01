import { useEffect } from 'react'
import { useRouter } from 'expo-router'

let Notifications: typeof import('expo-notifications') | null = null
try {
  Notifications = require('expo-notifications')
} catch {
  // Native module not available (e.g. Expo Go without dev client)
}

/**
 * usePushNotifications — side-effect hook for device push notifications
 *
 * Call once in the root layout. Handles:
 * - Requesting notification permissions on mount
 * - Suppressing foreground alert display (in-app toast handles it)
 * - Navigating to the relevant route when a notification is tapped
 *
 * Gracefully no-ops when expo-notifications native module is unavailable.
 */
export function usePushNotifications(): void {
  const router = useRouter()

  useEffect(() => {
    if (!Notifications) return

    // Suppress foreground alerts — the in-app toast handles display
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: false,
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    })

    // Request permission
    Notifications.requestPermissionsAsync().catch(() => {
      // Permission request failed silently; user may have denied
    })

    // Navigate to route when user taps a notification
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const route = response.notification.request.content.data?.route as string | undefined
      if (route) {
        // Delay to ensure navigation tree is ready when app launches from notification
        setTimeout(() => {
          router.push(route as Parameters<typeof router.push>[0])
        }, 100)
      }
    })

    return () => {
      subscription.remove()
    }
  }, [router])
}
