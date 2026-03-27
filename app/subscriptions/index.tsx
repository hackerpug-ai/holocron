import { Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Settings } from '@/components/ui/icons'
import { ScreenLayout } from '@/components/ui/screen-layout'
import { SubscriptionFeedScreen } from '@/components/subscriptions/SubscriptionFeedScreen'

/**
 * Subscriptions feed screen route.
 * Displays personalized content from user's subscriptions.
 */
export default function SubscriptionsRoute() {
  const router = useRouter()

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.navigate('/')
    }
  }

  const settingsButton = (
    <Pressable
      testID="subscriptions-settings-button"
      onPress={() => router.push('/subscriptions/settings')}
      className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
    >
      <Settings size={22} className="text-muted-foreground" />
    </Pressable>
  )

  return (
    <ScreenLayout
      header={{
        title: 'Feed',
        showBack: true,
        onBack: handleBack,
        rightContent: settingsButton,
      }}
      edges="bottom"
      testID="subscriptions-route"
    >
      <SubscriptionFeedScreen testID="subscriptions-feed" />
    </ScreenLayout>
  )
}
