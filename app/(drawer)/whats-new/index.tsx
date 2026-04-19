import { useRouter } from 'expo-router';
import { SubscriptionFeedScreen } from '@/components/subscriptions/SubscriptionFeedScreen';
import { ScreenLayout } from '@/components/ui/screen-layout';

/**
 * What's New Screen
 *
 * Displays the latest What's New findings from the AI news briefing —
 * the same data produced by the /whats-new Claude Code skill.
 *
 * Route: /whats-new
 */
export default function WhatsNewScreen() {
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
        title: "What's New",
        showBack: true,
        onBack: handleBack,
      }}
      edges="bottom"
      testID="whats-new-layout"
    >
      <SubscriptionFeedScreen testID="whats-new-feed" />
    </ScreenLayout>
  );
}
