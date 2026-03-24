import '../global.css'

import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { useEffect } from 'react'
import { View, useColorScheme as useRNColorScheme } from 'react-native'
import { useColorScheme } from '@/lib/useColorScheme'
import { cn } from '@/lib/utils'
import { NotificationToastProvider } from '@/components/notifications'
import { usePushNotifications } from '@/hooks/use-push-notifications'

// Validate required env vars at startup
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL
if (!convexUrl) {
  console.error('EXPO_PUBLIC_CONVEX_URL is not set. Check your .env file or EAS build config.')
}

// Create a client for Convex
const convex = new ConvexReactClient(convexUrl ?? 'https://placeholder.convex.cloud')

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 0,
    },
  },
})

// When STORYBOOK_ENABLED=true, render Storybook directly
const STORYBOOK_ENABLED = process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true'

/** Syncs the device color scheme to NativeWind so .dark CSS variables activate */
function ThemeSync({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useRNColorScheme()
  const { colorScheme, setColorScheme } = useColorScheme()

  useEffect(() => {
    const scheme = systemColorScheme === 'dark' ? 'dark' : 'light'
    setColorScheme(scheme)
  }, [systemColorScheme, setColorScheme])

  return (
    <View className={cn(colorScheme === 'dark' ? 'dark' : '', 'flex-1')} style={{ flex: 1 }}>
      {children}
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  )
}

export default function RootLayout() {
  usePushNotifications()

  // Render Storybook UI directly, bypassing Expo Router
  if (STORYBOOK_ENABLED) {
    const StorybookUI = require('../.rnstorybook').default
    return <StorybookUI />
  }

  return (
    <ConvexProvider client={convex}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeSync>
            <NotificationToastProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(drawer)" />
                <Stack.Screen name="articles" />
                {/* toolbelt is now inside (drawer) group */}
                <Stack.Screen name="document/[id]" />
                <Stack.Screen name="webview/[url]" />
                <Stack.Screen name="storybook" />
                <Stack.Screen name="+not-found" />
              </Stack>
            </NotificationToastProvider>
          </ThemeSync>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ConvexProvider>
  )
}
