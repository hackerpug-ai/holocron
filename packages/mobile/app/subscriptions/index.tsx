import { useRouter } from 'expo-router';
import { ScreenLayout } from '@/components/ui/screen-layout';
import { SubscriptionsScreen } from '@/screens/subscriptions-screen';

/**
 * Subscriptions management deep link (settings list).
 *
 * Deep link: holocron://subscriptions
 * Renders Zero-backed subscription sources list (auto_research toggles).
 *
 * AC-2 / AC-4 Maestro flows open this route and expect
 * `subscriptions-settings-route` + `subscriptions-screen` + `subscriptions-list`.
 */
export default function SubscriptionsIndexRoute() {
  const router = useRouter();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate('/chat/new');
    }
  };

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
  );
}
