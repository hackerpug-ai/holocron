import { Link, Stack } from 'expo-router'
import { StyleSheet, View, Text, Pressable } from 'react-native'
import { useTheme } from '@/hooks/use-theme'

export default function NotFoundScreen() {
  const { colors: themeColors, typography, spacing } = useTheme()

  const dynamicStyles = {
    headline: {
      fontSize: typography.h1.fontSize,
      fontWeight: typography.h1.fontWeight as any,
    },
    subtitle: {
      fontSize: typography.bodyLarge.fontSize,
      fontWeight: typography.bodyLarge.fontWeight as any,
    },
    buttonText: {
      fontSize: typography.label.fontSize,
      fontWeight: typography.label.fontWeight as any,
    },
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={[styles.headline, dynamicStyles.headline]}>Page not found</Text>
        <Text style={[styles.subtitle, dynamicStyles.subtitle]}>
          This screen doesn't exist.
        </Text>
        <Link href="/" asChild>
          <Pressable style={StyleSheet.flatten([styles.button, { backgroundColor: themeColors.primary }])}>
            <Text style={StyleSheet.flatten([styles.buttonText, dynamicStyles.buttonText, { color: themeColors.primaryForeground }])}>Go to home screen</Text>
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
    padding: spacing.xl,
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
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
})
