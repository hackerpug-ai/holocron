import { Link } from 'expo-router'
import { StyleSheet, View, Text, Pressable, useColorScheme } from 'react-native'
import { colors } from '@/lib/theme'

export default function HomeScreen() {
  const colorScheme = useColorScheme()
  const themeColors = colorScheme === 'dark' ? colors.dark : colors.light

  return (
    <View style={styles.container}>
      <Text style={styles.headline}>Welcome to Holocron</Text>
      <Text style={styles.subtitle}>Your knowledge database</Text>

      {__DEV__ && (
        <Link href="/storybook" asChild>
          <Pressable style={[styles.storybookLink, { backgroundColor: themeColors.primary }]}>
            <Text style={[styles.storybookText, { color: themeColors.primaryForeground }]}>Open Storybook</Text>
          </Pressable>
        </Link>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  headline: {
    fontSize: 28,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 16,
    marginTop: 8,
    opacity: 0.7,
  },
  storybookLink: {
    marginTop: 32,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  storybookText: {
    fontWeight: '600',
  },
})
