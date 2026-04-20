/**
 * What's New route unit tests
 *
 * TDD tests for route component behavior
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('WhatsNewScreen', () => {
  // Resolve path from test file to route file
  const routeFilePath = resolve(__dirname, '../../../app/(drawer)/whats-new/index.tsx');

  describe('AC-1: NewsfeedScreen is rendered by the route', () => {
    it('rendersNewsfeedScreenWithTestID', () => {
      // GIVEN: The route file exists
      // WHEN: We read the file content
      const fileContent = readFileSync(routeFilePath, 'utf-8');

      // THEN: NewsfeedScreen is imported
      expect(fileContent).toContain("from '@/components/whats-new/NewsfeedScreen'");

      // AND: NewsfeedScreen is used in JSX
      expect(fileContent).toContain('<NewsfeedScreen');

      // AND: testID='whats-new-feed' is present
      expect(fileContent).toContain('testID="whats-new-feed"');
    });
  });

  describe('AC-2: SubscriptionFeedScreen is absent from the route', () => {
    it('doesNotRenderSubscriptionFeedScreen', () => {
      // GIVEN: The route file exists
      // WHEN: We read the file content
      const fileContent = readFileSync(routeFilePath, 'utf-8');

      // THEN: SubscriptionFeedScreen is NOT imported
      expect(fileContent).not.toContain('SubscriptionFeedScreen');

      // AND: SubscriptionFeedScreen is NOT used in JSX
      expect(fileContent).not.toContain('<SubscriptionFeedScreen');
    });
  });

  describe('AC-3: ScreenLayout wrapper and testID are preserved', () => {
    it('screenLayoutTestIDPreserved', () => {
      // GIVEN: The route file exists
      // WHEN: We read the file content
      const fileContent = readFileSync(routeFilePath, 'utf-8');

      // THEN: ScreenLayout is imported
      expect(fileContent).toContain("from '@/components/ui/screen-layout'");

      // AND: ScreenLayout testID='whats-new-layout' is present
      expect(fileContent).toContain('testID="whats-new-layout"');

      // AND: edges='bottom' is preserved
      expect(fileContent).toContain('edges="bottom"');
    });
  });

  describe('AC-4: Back navigation logic is unchanged', () => {
    it('backNavigationCallsRouterBack', () => {
      // GIVEN: The route file exists
      // WHEN: We read the file content
      const fileContent = readFileSync(routeFilePath, 'utf-8');

      // THEN: useRouter is imported
      expect(fileContent).toContain("import { useRouter } from 'expo-router'");

      // AND: handleBack function exists
      expect(fileContent).toContain('const handleBack =');

      // AND: router.canGoBack() is checked
      expect(fileContent).toContain('router.canGoBack()');

      // AND: router.back() is called
      expect(fileContent).toContain('router.back()');

      // AND: router.navigate('/chat/new') fallback exists
      expect(fileContent).toContain("router.navigate('/chat/new')");
    });
  });
});
