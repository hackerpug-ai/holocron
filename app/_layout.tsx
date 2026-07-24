import '../global.css';

import { PortalHost } from '@rn-primitives/portal';
import { expoSQLiteStoreProvider } from '@rocicorp/zero/expo-sqlite';
import { ZeroProvider } from '@rocicorp/zero/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, useColorScheme as useRNColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { useColorScheme } from '@/lib/useColorScheme';
import { cn } from '@/lib/utils';
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

/**
 * Handle incoming deep links
 * Routes holocron:// URLs to appropriate screens
 */
function handleIncomingURL({ url }: { url: string }) {
  try {
    const parsed = Linking.parse(url);

    if (parsed.scheme === 'holocron') {
      const params = parsed.queryParams as Record<string, string>;

      // Handle toolbelt/add deep links
      if (parsed.path === 'toolbelt/add') {
        router.push({
          pathname: '/toolbelt/add',
          params,
        });
        return;
      }

      // Subscriptions settings list (Zero-backed sources + auto_research toggles)
      if (parsed.path === 'subscriptions' || parsed.path === 'subscriptions/settings') {
        router.push({
          pathname: '/subscriptions',
          params,
        });
        return;
      }

      // Legacy feed deep link → What's New intelligence briefing
      if (parsed.path === 'subscriptions/feed') {
        router.push({
          pathname: '/whats-new',
          params,
        });
        return;
      }

      if (parsed.path === 'whats-new' || parsed.path === 'whats-new/social') {
        router.push({
          pathname: `/${parsed.path}`,
          params,
        });
        return;
      }
    }
  } catch (error) {
    console.error('[RootLayout] Failed to handle URL:', error);
  }
}

/** Syncs the device color scheme to NativeWind so .dark CSS variables activate */
function ThemeSync({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useRNColorScheme();
  const { colorScheme, setColorScheme } = useColorScheme();

  useEffect(() => {
    const scheme = systemColorScheme === 'dark' ? 'dark' : 'light';
    setColorScheme(scheme);
  }, [systemColorScheme, setColorScheme]);

  return (
    <View className={cn(colorScheme === 'dark' ? 'dark' : '', 'flex-1')} style={{ flex: 1 }}>
      {children}
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

export default function RootLayout() {
  usePushNotifications();

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
        kvStore={Platform.OS === 'web' ? 'idb' : expoSQLiteStoreProvider()}
      >
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <ThemeSync>
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
            </ThemeSync>
          </QueryClientProvider>
        </SafeAreaProvider>
      </ZeroProvider>
    </GestureHandlerRootView>
  );
}
