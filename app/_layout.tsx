import '../global.css'

import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

// When STORYBOOK_ENABLED=true, render Storybook directly
const STORYBOOK_ENABLED = process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true'

export default function RootLayout() {
  // Render Storybook UI directly, bypassing Expo Router
  if (STORYBOOK_ENABLED) {
    const StorybookUI = require('../.rnstorybook').default
    return <StorybookUI />
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="storybook" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </>
  )
}
