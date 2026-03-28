import { SettingsScreen } from '@/screens/settings-screen'
import { ScreenLayout } from '@/components/ui/screen-layout'
import { useRouter } from 'expo-router'

/**
 * Settings screen route
 *
 * Personal app preferences and theme customization.
 */
export default function SettingsScreenRoute() {
  const router = useRouter()

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.navigate('/chat/new')
    }
  }

  return (
    <ScreenLayout
      header={{
        title: 'Settings',
        showBack: true,
        onBack: handleBack,
      }}
      edges="bottom"
      testID="settings-route-layout"
    >
      <SettingsScreen />
    </ScreenLayout>
  )
}
