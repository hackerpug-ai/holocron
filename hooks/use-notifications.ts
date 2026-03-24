/**
 * useNotifications — Convex-backed notifications hook
 *
 * Provides access to unread notifications, their count, and mutations
 * to mark individual or all notifications as read.
 *
 * @example
 * ```tsx
 * const { unread, unreadCount, markRead, markAllRead } = useNotifications()
 *
 * return (
 *   <View>
 *     <Text>{unreadCount} unread</Text>
 *     <Button onPress={() => markAllRead()}>Mark all read</Button>
 *   </View>
 * )
 * ```
 */

import { api } from '@/convex/_generated/api'
import type { Doc, Id } from '@/convex/_generated/dataModel'
import { useMutation, useQuery } from 'convex/react'
import type { NotificationData } from '@/components/notifications/NotificationToast'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseNotificationsReturn {
  /** Unread notifications, most-recent first (up to 10) */
  unread: NotificationData[]
  /** Number of unread notifications */
  unreadCount: number
  /** Mark a single notification as read by ID */
  markRead: (id: string) => Promise<void>
  /** Mark all unread notifications as read */
  markAllRead: () => Promise<void>
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNotifications(): UseNotificationsReturn {
  const rawUnread = useQuery(api.notifications.queries.listUnread)

  const markReadMutation = useMutation(api.notifications.mutations.markRead)
  const markAllReadMutation = useMutation(api.notifications.mutations.markAllRead)

  const unread: NotificationData[] = (rawUnread ?? []).map((n: Doc<'notifications'>) => ({
    _id: n._id,
    type: n.type as NotificationData['type'],
    title: n.title,
    body: n.body,
    route: n.route,
    read: n.read,
    createdAt: n.createdAt,
  }))

  const markRead = async (id: string): Promise<void> => {
    await markReadMutation({ id: id as Id<'notifications'> })
  }

  const markAllRead = async (): Promise<void> => {
    await markAllReadMutation({})
  }

  return {
    unread,
    unreadCount: unread.length,
    markRead,
    markAllRead,
  }
}
