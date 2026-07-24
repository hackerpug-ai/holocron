/**
 * useNotifications — Zero-backed notifications hook
 *
 * Reads unread/recent notifications via Zero queries and writes mark-read
 * via Zero legacy mutators on the notifications table.
 */

import { useZero, useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { notificationsRecent, notificationsUnread } from '@/app/zero/queries';
import type { NotificationData } from '@/components/notifications/NotificationToast';

export interface UseNotificationsReturn {
  /** Unread notifications, most-recent first (up to 10) */
  unread: NotificationData[];
  /** Recent notifications (read + unread), most-recent first */
  recent: NotificationData[];
  /** Number of unread notifications */
  unreadCount: number;
  /** True while Zero has not yet returned a first result for unread */
  isLoading: boolean;
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

function mapRow(n: NotificationRow): NotificationData {
  return {
    _id: n.id,
    type: (n.type ?? 'system') as NotificationData['type'],
    title: n.title ?? '',
    body: n.body ?? '',
    route: n.route ?? '',
    read: n.read ?? false,
    createdAt: n.created_at,
  };
}

export function useNotifications(options?: {
  unreadLimit?: number;
  recentLimit?: number;
}): UseNotificationsReturn {
  const zero = useZero();
  const unreadLimit = options?.unreadLimit ?? 10;
  const recentLimit = options?.recentLimit ?? 20;

  const [rawUnread, unreadDetails] = useZeroQuery(notificationsUnread(unreadLimit));
  const [rawRecent] = useZeroQuery(notificationsRecent(recentLimit));

  const unread: NotificationData[] = ((rawUnread ?? []) as NotificationRow[]).map(mapRow);
  const recent: NotificationData[] = ((rawRecent ?? []) as NotificationRow[]).map(mapRow);

  const isLoading = unreadDetails.type === 'unknown' && rawUnread === undefined;

  const markRead = async (id: string): Promise<void> => {
    await zero.mutate.notifications.update({ id, read: true });
  };

  const markAllRead = async (): Promise<void> => {
    const targets = unread.length > 0 ? unread : recent.filter((n) => !n.read);
    await Promise.all(
      targets.map((n) => zero.mutate.notifications.update({ id: n._id, read: true }))
    );
  };

  return {
    unread,
    recent,
    unreadCount: unread.length,
    isLoading,
    markRead,
    markAllRead,
  };
}
