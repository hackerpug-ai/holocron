/**
 * useNotifications — Zero-backed notifications hook
 *
 * Reads unread notifications via Zero query `notificationsUnread` and writes
 * mark-read via Zero legacy mutators on the notifications table.
 */

import { useZero, useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { notificationsUnread } from '@/app/zero/queries';
import type { NotificationData } from '@/components/notifications/NotificationToast';

export interface UseNotificationsReturn {
  /** Unread notifications, most-recent first (up to 10) */
  unread: NotificationData[];
  /** Number of unread notifications */
  unreadCount: number;
  /** Mark a single notification as read by ID */
  markRead: (id: string) => Promise<void>;
  /** Mark all unread notifications as read */
  markAllRead: () => Promise<void>;
}

type NotificationRow = {
  id: string;
  type?: string | null;
  title?: string | null;
  body?: string | null;
  route?: string | null;
  read?: boolean | null;
  created_at: number;
};

export function useNotifications(): UseNotificationsReturn {
  const zero = useZero();
  const [rawUnread] = useZeroQuery(notificationsUnread(10));

  const unread: NotificationData[] = ((rawUnread ?? []) as NotificationRow[]).map((n) => ({
    _id: n.id,
    type: (n.type ?? 'info') as NotificationData['type'],
    title: n.title ?? '',
    body: n.body ?? '',
    route: n.route ?? '',
    read: n.read ?? false,
    createdAt: n.created_at,
  }));

  const markRead = async (id: string): Promise<void> => {
    await zero.mutate.notifications.update({ id, read: true });
  };

  const markAllRead = async (): Promise<void> => {
    await Promise.all(
      unread.map((n) => zero.mutate.notifications.update({ id: n._id, read: true }))
    );
  };

  return {
    unread,
    unreadCount: unread.length,
    markRead,
    markAllRead,
  };
}
