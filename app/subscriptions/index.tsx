import * as React from 'react'
import { useRouter } from 'expo-router'
import { ScreenLayout } from '@/components/ui/screen-layout'
import { SubscriptionFeedScreen } from '@/components/subscriptions/SubscriptionFeedScreen'
import { NotificationBellButton } from '@/components/notifications/NotificationBellButton'
import { NotificationListSheet } from '@/components/notifications/NotificationListSheet'

/**
 * Subscriptions feed screen route.
 * Displays personalized content from user's subscriptions.
 */
export default function SubscriptionsRoute() {
  const router = useRouter()
  const [notifSheetVisible, setNotifSheetVisible] = React.useState(false)

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.navigate('/')
    }
  }

  const rightContent = (
    <NotificationBellButton onPress={() => setNotifSheetVisible(true)} />
  )

  return (
    <ScreenLayout
      header={{
        title: 'Feed',
        showBack: true,
        onBack: handleBack,
        rightContent,
      }}
      edges="bottom"
      testID="subscriptions-route"
    >
      <SubscriptionFeedScreen testID="subscriptions-feed" />
      <NotificationListSheet
        visible={notifSheetVisible}
        onClose={() => setNotifSheetVisible(false)}
        testID="subscriptions-notification-sheet"
      />
    </ScreenLayout>
  )
}
