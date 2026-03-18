import '../global.css'

import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ConvexProvider, ConvexReactClient } from 'convex/react'

// Create a client for Convex
const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!)

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

export default function RootLayout() {
  // Render Storybook UI directly, bypassing Expo Router
  if (STORYBOOK_ENABLED) {
    const StorybookUI = require('../.rnstorybook').default
    return <StorybookUI />
  }

  return (
    <ConvexProvider client={convex}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(drawer)" />
            <Stack.Screen name="articles" />
            <Stack.Screen name="toolbelt" />
            <Stack.Screen name="document/[id]" />
            <Stack.Screen name="webview/[url]" />
            <Stack.Screen name="storybook" />
            <Stack.Screen name="+not-found" />
          </Stack>
          <StatusBar style="auto" />
        </QueryClientProvider>
      </SafeAreaProvider>
    </ConvexProvider>
  )
}
