/**
 * NotificationToastProvider
 *
 * Bridges Convex real-time notifications to in-app toast display.
 *
 * - Subscribes to unread notifications via Convex
 * - Shows an in-app toast (+ haptic feedback) when the app is ACTIVE
 * - When the app is BACKGROUNDED: logs a note (expo-notifications not installed;
 *   install it and un-comment the scheduleNotificationAsync block to enable push)
 * - Marks the notification as read after the toast is shown
 * - Auto-dismisses after 4 seconds
 *
 * @example
 * ```tsx
 * <NotificationToastProvider>
 *   <Stack />
 * </NotificationToastProvider>
 * ```
 */

import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import * as Haptics from 'expo-haptics'
import { useMutation, useQuery } from 'convex/react'
import * as React from 'react'
import { AppState, type AppStateStatus, View } from 'react-native'
import { NotificationToast, type NotificationData } from './NotificationToast'

// ─── Constants ────────────────────────────────────────────────────────────────

const AUTO_DISMISS_MS = 4000

// ─── Component ────────────────────────────────────────────────────────────────

interface NotificationToastProviderProps {
  children: React.ReactNode
}

export function NotificationToastProvider({ children }: NotificationToastProviderProps) {
  // Current notification queued for display
  const [current, setCurrent] = React.useState<NotificationData | null>(null)

  // Track which notification IDs we've already acted on
  const shownIds = React.useRef<Set<string>>(new Set())

  // Track current AppState
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState)

  // Convex: subscribe to unread notifications
  const unread = useQuery(api.notifications.queries.listUnread)

  // Convex: mutation to mark a single notification as read
  const markReadMutation = useMutation(api.notifications.mutations.markRead)

  // ── AppState listener ──────────────────────────────────────────────────────

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState
    })
    return () => subscription.remove()
  }, [])

  // ── Auto-dismiss timer ─────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!current) return

    const timer = setTimeout(() => {
      setCurrent(null)
    }, AUTO_DISMISS_MS)

    return () => clearTimeout(timer)
  }, [current])

  // ── React to new unread notifications ─────────────────────────────────────

  React.useEffect(() => {
    if (!unread || unread.length === 0) return

    // Pick the most-recent notification that hasn't been shown yet
    const next = unread.find((n: { _id: string }) => !shownIds.current.has(n._id))
    if (!next) return

    shownIds.current.add(next._id)

    const notification: NotificationData = {
      _id: next._id,
      type: next.type as NotificationData['type'],
      title: next.title,
      body: next.body,
      route: next.route,
      read: next.read,
      createdAt: next.createdAt,
    }

    if (appStateRef.current === 'active') {
      // App is in foreground — show in-app toast with haptic feedback
      setCurrent(notification)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
        // Haptics may not be available on all devices; ignore errors
      })

      // Mark read immediately so Convex removes it from the unread feed
      markReadMutation({ id: next._id as Id<'notifications'> }).catch((err: unknown) => {
        console.warn('[NotificationToastProvider] markRead failed:', err)
      })
    } else {
      // App is in background — expo-notifications is not installed.
      // To enable push notifications, install expo-notifications and replace
      // this block with Notifications.scheduleNotificationAsync({ ... }).
      // Push notifications not configured — no-op when backgrounded
    }
  }, [unread, markReadMutation])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleDismiss = React.useCallback(() => {
    setCurrent(null)
  }, [])

  const handleMarkRead = React.useCallback(
    (id: string) => {
      markReadMutation({ id: id as Id<'notifications'> }).catch((err: unknown) => {
        console.warn('[NotificationToastProvider] markRead failed:', err)
      })
    },
    [markReadMutation]
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {children}
      {current && (
        <View
          className="absolute right-0 top-14 left-0 z-50 px-4"
          pointerEvents="box-none"
        >
          <NotificationToast
            notification={current}
            onDismiss={handleDismiss}
            onMarkRead={handleMarkRead}
            testID="notification-toast-provider-toast"
          />
        </View>
      )}
    </>
  )
}
