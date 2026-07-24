/**
 * NotificationToastProvider
 *
 * Bridges Zero real-time notifications to in-app toast display.
 *
 * - Subscribes to unread notifications via Zero (`useNotifications`)
 * - Shows an in-app toast (+ haptic feedback) when the app is ACTIVE
 * - When the app is BACKGROUNDED: logs a note (expo-notifications not installed;
 *   install it and un-comment the scheduleNotificationAsync block to enable push)
 * - Auto-dismisses after 4 seconds
 *
 * @example
 * ```tsx
 * <NotificationToastProvider>
 *   <Stack />
 * </NotificationToastProvider>
 * ```
 */

import * as Haptics from 'expo-haptics';
import * as React from 'react';
import { AppState, type AppStateStatus, View } from 'react-native';
import { useNotifications } from '@/hooks/use-notifications';
import { type NotificationData, NotificationToast } from './NotificationToast';

// ─── Constants ────────────────────────────────────────────────────────────────

const AUTO_DISMISS_MS = 4000;

/** Notification types that warrant a full toast (user-initiated async completions) */
const HIGH_IMPORTANCE_TYPES = new Set(['research_complete', 'assimilate_complete']);

// ─── Component ────────────────────────────────────────────────────────────────

interface NotificationToastProviderProps {
  children: React.ReactNode;
}

export function NotificationToastProvider({ children }: NotificationToastProviderProps) {
  // Current notification queued for display
  const [current, setCurrent] = React.useState<NotificationData | null>(null);

  // Track which notification IDs we've already acted on
  const shownIds = React.useRef<Set<string>>(new Set());

  // Track current AppState
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);

  // Zero: subscribe to unread notifications + mark-read mutator
  const { unread, markRead } = useNotifications();

  // ── AppState listener ──────────────────────────────────────────────────────

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, []);

  // ── Auto-dismiss timer ─────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!current) return;

    const timer = setTimeout(() => {
      setCurrent(null);
    }, AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
  }, [current]);

  // ── React to new unread notifications ─────────────────────────────────────

  React.useEffect(() => {
    if (!unread || unread.length === 0) return;

    // Pick the most-recent notification that hasn't been shown yet
    const next = unread.find((n) => !shownIds.current.has(n._id));
    if (!next) return;

    shownIds.current.add(next._id);

    // Only show toast for high-importance notifications (user-initiated async completions).
    // Normal-importance notifications are bell-only — the NotificationListSheet handles those.
    if (!HIGH_IMPORTANCE_TYPES.has(next.type)) return;

    if (appStateRef.current === 'active') {
      // App is in foreground — show in-app toast with haptic feedback
      setCurrent(next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
        // Haptics may not be available on all devices; ignore errors
      });

      // Do NOT mark read here — let the notification bell list handle read state.
      // This allows the bell dot to show even after the toast is dismissed.
    } else {
      // App is in background — expo-notifications is not installed.
      // To enable push notifications, install expo-notifications and replace
      // this block with Notifications.scheduleNotificationAsync({ ... }).
      // Push notifications not configured — no-op when backgrounded
    }
  }, [unread]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleDismiss = React.useCallback(() => {
    setCurrent(null);
  }, []);

  const handleMarkRead = React.useCallback(
    (id: string) => {
      markRead(id).catch((err: unknown) => {
        console.warn('[NotificationToastProvider] markRead failed:', err);
      });
    },
    [markRead]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {children}
      {current && (
        <View className="absolute right-0 top-14 left-0 z-50 px-4" pointerEvents="box-none">
          <NotificationToast
            notification={current}
            onDismiss={handleDismiss}
            onMarkRead={handleMarkRead}
            testID="notification-toast-provider-toast"
          />
        </View>
      )}
    </>
  );
}
