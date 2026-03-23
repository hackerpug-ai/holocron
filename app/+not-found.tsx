import { Link, Stack } from 'expo-router'
import { StyleSheet, View, Text, Pressable } from 'react-native'
import { useTheme } from '@/hooks/use-theme'

export default function NotFoundScreen() {
  const { colors: themeColors } = useTheme()

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.headline}>Page not found</Text>
        <Text style={styles.subtitle}>
          This screen doesn't exist.
        </Text>
        <Link href="/" asChild>
          <Pressable style={StyleSheet.flatten([styles.button, { backgroundColor: themeColors.primary }])}>
            <Text style={StyleSheet.flatten([styles.buttonText, { color: themeColors.primaryForeground }])}>Go to home screen</Text>
          </Pressable>
        </Link>
      </View>
    </>
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
    marginBottom: 24,
    opacity: 0.7,
  },
  button: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
})
