import { useColorScheme } from 'react-native'
import { useMemo } from 'react'
import { colors, spacing, radius, typography } from '@/lib/theme'

/**
 * Hook to access theme tokens based on current color scheme
 * Returns theme values that automatically adapt to light/dark mode
 */
export function useTheme() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return useMemo(
    () => ({
      colors: isDark ? colors.dark : colors.light,
      spacing,
      radius,
      typography,
      isDark,
    }),
    [isDark]
  )
}
