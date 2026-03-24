import * as Notifications from 'expo-notifications'

/**
 * Schedule an immediate local push notification.
 *
 * @param title - The notification title
 * @param body  - The notification body text
 * @param route - App route to navigate to when the notification is tapped
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  route: string,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { route },
    },
    trigger: null,
  })
}
