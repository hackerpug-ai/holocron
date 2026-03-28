import * as React from 'react'
import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Settings } from '@/components/ui/icons'
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
    <View className="flex-row items-center gap-1">
      <NotificationBellButton onPress={() => setNotifSheetVisible(true)} />
      <Pressable
        testID="subscriptions-settings-button"
        onPress={() => router.push('/subscriptions/settings')}
        className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
      >
        <Settings size={22} className="text-muted-foreground" />
      </Pressable>
    </View>
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
