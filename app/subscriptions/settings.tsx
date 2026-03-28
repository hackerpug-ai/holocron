import { useRouter } from 'expo-router'
import { ScreenLayout } from '@/components/ui/screen-layout'
import { SubscriptionsScreen } from '@/screens/subscriptions-screen'

/**
 * Subscriptions settings/management route.
 * Manage all subscription sources with search and filtering.
 */
export default function SubscriptionsSettingsRoute() {
  const router = useRouter()

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.navigate('/subscriptions')
    }
  }

  return (
    <ScreenLayout
      header={{
        title: 'Subscriptions',
        showBack: true,
        onBack: handleBack,
      }}
      edges="bottom"
      testID="subscriptions-settings-route"
    >
      <SubscriptionsScreen />
    </ScreenLayout>
  )
}
