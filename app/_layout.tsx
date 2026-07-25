import '../global.css';

import { PortalHost } from '@rn-primitives/portal';
import { expoSQLiteStoreProvider } from '@rocicorp/zero/expo-sqlite';
import { ZeroProvider } from '@rocicorp/zero/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { Appearance, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { resolveHolocronRoute } from '@/lib/holocron-deep-link';
import { getThemePreference } from '@/lib/theme-preference';
import { mutators as zeroMutators } from './zero/mutators';
import { schema as zeroSchema } from './zero/schema';

// Platform base URL (consolidated secrets → EXPO_PUBLIC_PLATFORM_URL).
// S-COLDBOOT-01 / CAP-CUT-01: cold-boot uses ZeroProvider only (no legacy data-plane client).
const platformUrl = process.env.EXPO_PUBLIC_PLATFORM_URL;
const zeroCacheUrl = process.env.EXPO_PUBLIC_ZERO_CACHE_URL;
const zeroUserId = process.env.EXPO_PUBLIC_ZERO_USER_ID ?? 'e2e-reference-user';
if (!platformUrl) {
  console.error(
    'EXPO_PUBLIC_PLATFORM_URL is not set. Copy services/platform/config/secrets.example.yaml → secrets.yaml or set EAS env.'
  );
}
if (!zeroCacheUrl) {
  console.error(
    'EXPO_PUBLIC_ZERO_CACHE_URL is not set; Zero sync will fail closed until the cache is provisioned.'
  );
}

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 0,
    },
  },
});

// When STORYBOOK_ENABLED=true, render Storybook directly
const STORYBOOK_ENABLED = process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true';

/** Root-layout effects can replay an initial URL while Expo Router remounts its stack. */
function navigateWhenReady(action: () => void) {
  setTimeout(action, 0);
}

/**
 * Handle incoming deep links
 * Routes holocron:// URLs to appropriate screens
 *
 * Step4 full-driver fail: holocron://whats-new uses hostname form; resolve via
 * {@link resolveHolocronRoute} (not path-only).
 */
function handleIncomingURL({ url }: { url: string }) {
  try {
    const parsed = Linking.parse(url);
    if (parsed.scheme !== 'holocron') return;

    const params = (parsed.queryParams ?? {}) as Record<string, string>;
    const route = resolveHolocronRoute(url);
    if (!route) return;

    // toolbelt/add deep links
    if (route === 'toolbelt/add' || route.startsWith('toolbelt/add')) {
      navigateWhenReady(() => router.push({ pathname: '/toolbelt/add', params }));
      return;
    }

    // Subscriptions settings list (Zero-backed sources + auto_research toggles)
    if (route === 'subscriptions' || route === 'subscriptions/settings') {
      navigateWhenReady(() => router.push({ pathname: '/subscriptions', params }));
      return;
    }

    // Subscription feed remains distinct from the What's New intelligence briefing.
    if (route === 'subscriptions/feed') {
      navigateWhenReady(() => router.push({ pathname: '/subscriptions/feed', params }));
      return;
    }

    // What's New (hostname form holocron://whats-new must work).
    // Prefer navigate over push so sequential Maestro steps (after articles) remount
    // the drawer route instead of no-op when the stack is already mid-sequence.
    if (route === 'whats-new' || route === 'whats-new/social') {
      const pathname = route === 'whats-new' ? '/whats-new' : '/whats-new/social';
      navigateWhenReady(() => router.navigate({ pathname, params }));
      return;
    }

    // Articles (same hostname form as Maestro openLink holocron://articles)
    if (route === 'articles') {
      navigateWhenReady(() => router.navigate({ pathname: '/articles', params }));
      return;
    }

    // Generic in-app path: /improvements, /toolbelt, /settings, …
    if (
      route === 'improvements' ||
      route === 'toolbelt' ||
      route === 'settings' ||
      route.startsWith('improvements/') ||
      route.startsWith('research/') ||
      route.startsWith('assimilate/')
    ) {
      navigateWhenReady(() => router.push({ pathname: `/${route}` as `/improvements`, params }));
      return;
    }
  } catch (error) {
    console.error('[RootLayout] Failed to handle URL:', error);
  }
}

export default function RootLayout() {
  usePushNotifications();

  useEffect(() => {
    void getThemePreference()
      .then((mode) => {
        if (mode) Appearance.setColorScheme((mode === 'system' ? null : mode) as never);
      })
      .catch(() => {
        // Theme preference is optional; system appearance remains the fallback.
      });
  }, []);

  // Handle deep linking for toolbelt add URLs
  useEffect(() => {
    const subscription = Linking.addEventListener('url', handleIncomingURL);

    // Handle initial URL (app opened from URL)
    Linking.getInitialURL().then((url) => {
      if (url) handleIncomingURL({ url });
    });

    return () => subscription.remove();
  }, []);

  // Render Storybook UI directly, bypassing Expo Router
  if (STORYBOOK_ENABLED) {
    const StorybookUI = require('../.rnstorybook').default;
    return <StorybookUI />;
  }

  // In-app notification toasts previously bridged via a Convex-backed provider.
  // That bridge is deferred until remaining data-plane call sites migrate (UC-SYNC).
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ZeroProvider
        cacheURL={zeroCacheUrl ?? 'http://127.0.0.1:4848'}
        userID={zeroUserId}
        schema={zeroSchema}
        mutators={zeroMutators}
        kvStore={Platform.OS === 'web' ? 'idb' : expoSQLiteStoreProvider()}
      >
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(drawer)" />
              <Stack.Screen name="reference-chat" />
              <Stack.Screen name="articles" />
              {/* toolbelt is now inside (drawer) group */}
              <Stack.Screen name="document/[id]" />
              <Stack.Screen name="webview/[url]" />
              <Stack.Screen name="storybook" />
              <Stack.Screen name="toolbelt/add" options={{ presentation: 'modal' }} />
              <Stack.Screen name="+not-found" />
            </Stack>
            <PortalHost />
          </QueryClientProvider>
        </SafeAreaProvider>
      </ZeroProvider>
    </GestureHandlerRootView>
  );
}
