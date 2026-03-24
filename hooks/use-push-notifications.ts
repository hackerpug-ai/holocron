import { useEffect } from 'react'
import { useRouter } from 'expo-router'
import * as Notifications from 'expo-notifications'

/**
 * usePushNotifications — side-effect hook for device push notifications
 *
 * Call once in the root layout. Handles:
 * - Requesting notification permissions on mount
 * - Suppressing foreground alert display (in-app toast handles it)
 * - Navigating to the relevant route when a notification is tapped
 */
export function usePushNotifications(): void {
  const router = useRouter()

  useEffect(() => {
    // Suppress foreground alerts — the in-app toast handles display
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: false,
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
        router.push(route as Parameters<typeof router.push>[0])
      }
    })

    return () => {
      subscription.remove()
    }
  }, [router])
}
